#!/usr/bin/env python3
"""Fit the reference-platform chain and publish S-NPP-equivalent monthly numbers.

Method (research/07 §8, decisions H1/H2/I5):
  * One reference satellite per era: Terra (2000-11 .. 2002-07) -> Aqua (.. 2012-01) -> S-NPP.
    A satellite is the reference for a month only if it covers the whole month.
  * Junction factors are MULTIPLICATIVE, per calendar month, per metric (count, Σ FRP):
        factor[m] = median over years y of  newer[y,m] / older[y,m]
        band[m]   = interquartile range of the same ratios
    fitted only on days where BOTH satellites are `ok` in `coverage`, inside a pre-drift window,
    on burning detections only (`hotspots_flagged.is_burning`: not in the static mask, not offshore).
    Year-months where the older satellite has < MIN_COUNT detections are skipped (ratio too noisy).
  * A month with fewer than MIN_YEARS valid years uses the all-months factor (month = 0) instead.
  * Fit windows come from measurement V3 (median overpass time is stable through 2021 for both
    MODIS satellites, drifting from 2022): J1 Terra->Aqua 2003..2021, J2 Aqua->S-NPP 2012-01-20..2021.
  * Factors apply to AGGREGATES (month x area) only, never to individual points.

Prerequisites: hotspots loaded, `coverage` (coverage_table.py), `static_mask` + view (static_mask.py).

Creates or replaces:
  calibration            table: junction, older, newer, month (0 = all months), metric, factor, band_lo,
                         band_hi, n_years, fit_start, fit_end, fitted_at
  calibration_effective  view: junction x month 1-12 x metric, with the month-0 fallback applied
  calibration_chain      view: satellite x month x metric -> multiplier to S-NPP-equivalent (+ band)
                         THE CONTRACT for the backend: for any AOI, sum raw detections of the month's
                         reference satellite, multiply by this factor.
  harmonized_monthly     view: Italy-wide month series in S-NPP-equivalent units + coverage of the reference

    python3 harmonize/calibrate.py
"""

import argparse
import statistics
import sys
from collections import defaultdict, namedtuple
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pg  # noqa: E402
import datetime as dt  # noqa: E402

Junction = namedtuple("Junction", "name older newer start end")
JUNCTIONS = (
    Junction("J1", "Terra", "Aqua", dt.date(2003, 1, 1), dt.date(2021, 12, 31)),
    Junction("J2", "Aqua", "N", dt.date(2012, 1, 20), dt.date(2021, 12, 31)),
)
MIN_COUNT = 5
MIN_YEARS = 3
COLUMNS = ("junction", "older", "newer", "month", "metric", "factor", "band_lo", "band_hi", "n_years",
           "fit_start", "fit_end")

DDL = """
CREATE TABLE IF NOT EXISTS calibration (
  junction  TEXT NOT NULL,
  older     TEXT NOT NULL,
  newer     TEXT NOT NULL,
  month     SMALLINT NOT NULL CHECK (month BETWEEN 0 AND 12),   -- 0 = all months pooled
  metric    TEXT NOT NULL CHECK (metric IN ('count', 'frp')),
  factor    DOUBLE PRECISION NOT NULL,
  band_lo   DOUBLE PRECISION NOT NULL,
  band_hi   DOUBLE PRECISION NOT NULL,
  n_years   INTEGER NOT NULL,
  fit_start DATE NOT NULL,
  fit_end   DATE NOT NULL,
  fitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (junction, month, metric)
);
"""

VIEWS = f"""
CREATE OR REPLACE VIEW calibration_effective AS
SELECT j.junction, m.month, j.metric,
       coalesce(mo.factor, al.factor)   AS factor,
       coalesce(mo.band_lo, al.band_lo) AS band_lo,
       coalesce(mo.band_hi, al.band_hi) AS band_hi,
       (mo.factor IS NULL)              AS fallback
FROM (SELECT DISTINCT junction, metric FROM calibration) j
CROSS JOIN generate_series(1, 12) AS m(month)
LEFT JOIN calibration mo ON mo.junction = j.junction AND mo.metric = j.metric AND mo.month = m.month
                        AND mo.n_years >= {MIN_YEARS}
LEFT JOIN calibration al ON al.junction = j.junction AND al.metric = j.metric AND al.month = 0;

CREATE OR REPLACE VIEW calibration_chain AS
SELECT 'N'::text AS satellite, m.month, x.metric,
       1.0::float8 AS factor, 1.0::float8 AS band_lo, 1.0::float8 AS band_hi
FROM generate_series(1, 12) AS m(month), (VALUES ('count'), ('frp')) AS x(metric)
UNION ALL
SELECT 'Aqua', month, metric, factor, band_lo, band_hi FROM calibration_effective WHERE junction = 'J2'
UNION ALL
SELECT 'Terra', a.month, a.metric, a.factor * b.factor, a.band_lo * b.band_lo, a.band_hi * b.band_hi
FROM calibration_effective a
JOIN calibration_effective b ON b.junction = 'J2' AND b.month = a.month AND b.metric = a.metric
WHERE a.junction = 'J1';

CREATE OR REPLACE VIEW harmonized_monthly AS
WITH span AS (
  SELECT satellite, min(day) AS first_day, max(day) AS last_day FROM coverage GROUP BY satellite
), months AS (
  SELECT generate_series(date_trunc('month', min(first_day)), date_trunc('month', max(last_day)),
                         interval '1 month')::date AS month_start FROM span
), ref AS (
  SELECT DISTINCT ON (m.month_start) m.month_start, s.satellite
  FROM months m
  JOIN span s ON s.first_day <= m.month_start
             AND s.last_day >= (m.month_start + interval '1 month' - interval '1 day')::date
  JOIN (VALUES ('Terra', 1), ('Aqua', 2), ('N', 3)) AS r(satellite, rnk) ON r.satellite = s.satellite
  ORDER BY m.month_start, r.rnk DESC
), raw AS (
  SELECT date_trunc('month', acq_date)::date AS month_start, satellite,
         count(*) AS n, coalesce(sum(frp), 0) AS frp
  FROM hotspots_flagged WHERE is_burning GROUP BY 1, 2
), cov AS (
  SELECT date_trunc('month', day)::date AS month_start, satellite,
         count(*) FILTER (WHERE status = 'ok')      AS days_ok,
         count(*) FILTER (WHERE status = 'partial') AS days_partial,
         count(*) FILTER (WHERE status = 'missing') AS days_missing
  FROM coverage GROUP BY 1, 2
)
SELECT ref.month_start, ref.satellite,
       coalesce(raw.n, 0)   AS raw_count,
       coalesce(raw.frp, 0) AS raw_frp,
       coalesce(raw.n, 0) * cc.factor    AS count_snpp_eq,
       coalesce(raw.n, 0) * cc.band_lo   AS count_lo,
       coalesce(raw.n, 0) * cc.band_hi   AS count_hi,
       coalesce(raw.frp, 0) * cf.factor  AS frp_snpp_eq,
       coalesce(raw.frp, 0) * cf.band_lo AS frp_lo,
       coalesce(raw.frp, 0) * cf.band_hi AS frp_hi,
       cov.days_ok, cov.days_partial, cov.days_missing
FROM ref
JOIN cov USING (month_start, satellite)
LEFT JOIN raw USING (month_start, satellite)
LEFT JOIN calibration_chain cc ON cc.satellite = ref.satellite
      AND cc.month = extract(month FROM ref.month_start) AND cc.metric = 'count'
LEFT JOIN calibration_chain cf ON cf.satellite = ref.satellite
      AND cf.month = extract(month FROM ref.month_start) AND cf.metric = 'frp';
"""


def _aggregates(psql_cmd, j):
    """{(year, month): {satellite: (count, frp)}} on days where both satellites are ok."""
    lines = pg.run(psql_cmd, f"""
WITH days AS (
  SELECT a.day FROM coverage a JOIN coverage b ON b.day = a.day
  WHERE a.satellite = '{j.older}' AND b.satellite = '{j.newer}'
    AND a.status = 'ok' AND b.status = 'ok' AND a.day BETWEEN '{j.start}' AND '{j.end}'
)
SELECT extract(year FROM h.acq_date)::int, extract(month FROM h.acq_date)::int, h.satellite,
       count(*), coalesce(sum(h.frp), 0)
FROM hotspots_flagged h JOIN days d ON d.day = h.acq_date
WHERE h.is_burning AND h.satellite IN ('{j.older}', '{j.newer}')
GROUP BY 1, 2, 3;
""")
    agg = defaultdict(dict)
    for line in lines:
        y, m, sat, n, frp = line.split("|")
        agg[(int(y), int(m))][sat] = (int(n), float(frp))
    return agg


def _summary(ratios):
    ratios = sorted(ratios)
    factor = statistics.median(ratios)
    if len(ratios) >= 2:
        q = statistics.quantiles(ratios, n=4, method="inclusive")
        return factor, q[0], q[2]
    return factor, factor, factor


def fit_rows(j, agg):
    """Calibration rows for one junction from its aggregates."""
    by_month = {"count": defaultdict(list), "frp": defaultdict(list)}
    for (_, m), sats in agg.items():
        old_n, old_frp = sats.get(j.older, (0, 0.0))
        new_n, new_frp = sats.get(j.newer, (0, 0.0))
        if old_n < MIN_COUNT:
            continue
        by_month["count"][m].append(new_n / old_n)
        if old_frp > 0:
            by_month["frp"][m].append(new_frp / old_frp)
    rows = []
    for metric, months in by_month.items():
        pooled = [r for rs in months.values() for r in rs]
        for m, ratios in sorted(months.items()):
            rows.append((j.name, j.older, j.newer, m, metric, *_summary(ratios), len(ratios), j.start, j.end))
        if pooled:
            rows.append((j.name, j.older, j.newer, 0, metric, *_summary(pooled), len(pooled), j.start, j.end))
    return rows


def fit(psql_cmd, junctions=JUNCTIONS):
    rows = []
    for j in junctions:
        rows += fit_rows(j, _aggregates(psql_cmd, j))
    names = ", ".join(f"'{j.name}'" for j in junctions)
    pg.run(psql_cmd, "SET client_min_messages = warning;\nBEGIN;\n" + DDL
           + f"DELETE FROM calibration WHERE junction IN ({names});\n"
           + pg.copy_block("calibration", COLUMNS, rows) + VIEWS + "COMMIT;\n")
    return rows


def main(argv=None):
    argparse.ArgumentParser(description=__doc__.split("\n\n")[0]).parse_args(argv)
    rows = fit(pg.psql_cmd_from_env())
    print("junction metric  month  factor  [band]        years")
    for r in rows:
        j, _, _, m, metric, f, lo, hi, n, *_ = r
        print(f"{j:8s} {metric:6s} {m:5d}  {f:6.2f}  [{lo:5.2f}-{hi:5.2f}]  {n:5d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
