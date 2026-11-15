#!/usr/bin/env python3
"""Fit the reference-platform chain per country and publish S-NPP-equivalent monthly numbers.

Method (research/07 §8, decisions H1/H2; per-country: docs/superpowers/specs/2026-11-14-europe-noaa20-design.md):
  * Platforms and junctions: harmonize/platforms.py. The reference platform of a month is the most
    preferred one covering the whole month: Terra -> Aqua -> S-NPP (unit) -> NOAA-20 after 2026-11-02.
  * Junction factors are MULTIPLICATIVE, per country, per calendar month, per metric (count, Σ FRP):
        factor[c, m] = median over years y of  newer[c, y, m] / older[c, y, m]
        band[c, m]   = interquartile range of the same ratios
    fitted only on days where BOTH satellites are `ok` in `coverage`, inside the junction's window,
    on burning detections only. Year-months where the older satellite has < MIN_COUNT detections are
    skipped, and so are year-months where the newer one has none (missing data, not a ratio of 0).
    `EUR` is the same fit on all points that have a country (hotspot_country).
  * Fallback for (country, month): the country's month (>= MIN_YEARS years) -> the country's all-months
    -> EUR month (>= MIN_YEARS) -> EUR all-months. `source` says which one was used.
  * Chain to the unit: older platforms multiply the junction factors, newer ones divide (band inverted).
  * Factors apply to AGGREGATES (month x area) only, never to individual points.

Prerequisites: hotspots loaded, hotspot_country (country.py), coverage (coverage_table.py),
static_mask + view (static_mask.py).

Creates or replaces:
  calibration            table: junction, country, older, newer, month (0 = all months), metric, factor,
                         band_lo, band_hi, n_years, fit_start, fit_end, fitted_at
  calibration_country    table: the countries the chain is published for (+ EUR)
  calibration_effective  view: junction x country x month 1-12 x metric, fallback applied, + source
  calibration_chain      view: satellite x country x month x metric -> multiplier to S-NPP-equivalent
                         (+ band, source). THE CONTRACT for the backend: for any area, count each
                         country's raw detections of the month's reference satellite, multiply by that
                         country's factor, add up.
  harmonized_monthly     table (snapshot of view harmonized_monthly_live, rebuilt by every run): country
                         (and EUR = sum of countries) x month series in S-NPP-equivalent units + coverage

    python3 harmonize/calibrate.py
"""

import argparse
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import country as ctry  # noqa: E402
import pg  # noqa: E402
import platforms as pf  # noqa: E402

Junction = pf.Junction
JUNCTIONS = pf.JUNCTIONS
EUR = "EUR"
MIN_COUNT = 5
MIN_YEARS = 3
COLUMNS = ("junction", "country", "older", "newer", "month", "metric", "factor", "band_lo", "band_hi", "n_years",
           "fit_start", "fit_end")
SOURCES = ("unit", "country-month", "country-all", "eur-month", "eur-all")   # best -> worst

DDL = """
DO $$ BEGIN   -- the Italy-only table had no country column: it is derived data, rebuild it
  IF to_regclass('calibration') IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns WHERE table_name = 'calibration' AND column_name = 'country') THEN
    DROP TABLE calibration CASCADE;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS calibration (
  junction  TEXT NOT NULL,
  country   TEXT NOT NULL,                                      -- ISO3, or EUR for the pooled fit
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
  PRIMARY KEY (junction, country, month, metric)
);
CREATE TABLE IF NOT EXISTS calibration_country (country TEXT PRIMARY KEY);
"""


def _rank_sql(expr):
    return "CASE " + " ".join(f"WHEN {expr} = '{s}' THEN {i}" for i, s in enumerate(SOURCES)) + " END"


def _source_sql(ranks):
    worst = f"GREATEST({', '.join(ranks)})" if len(ranks) > 1 else ranks[0]
    return "CASE " + " ".join(f"WHEN {worst} = {i} THEN '{s}'" for i, s in enumerate(SOURCES)) + " END"


def chain_sql(platforms=pf.PLATFORMS):
    """calibration_chain, generated from the platform list: one SELECT per platform."""
    base = ("FROM calibration_country c CROSS JOIN generate_series(1, 12) AS m(month) "
            "CROSS JOIN (VALUES ('count'), ('frp')) AS x(metric)")
    parts = []
    for p in platforms:
        path = pf.chain_path(p.satellite)
        if not path:
            parts.append(f"SELECT '{p.satellite}'::text AS satellite, c.country, m.month, x.metric, "
                         f"1.0::float8 AS factor, 1.0::float8 AS band_lo, 1.0::float8 AS band_hi, "
                         f"'unit'::text AS source {base}")
            continue
        joins, f, lo, hi, ranks = [], [], [], [], []
        for k, (junction, direction) in enumerate(path):
            e = f"e{k}"
            joins.append(f"JOIN calibration_effective {e} ON {e}.junction = '{junction}' AND {e}.country = c.country "
                         f"AND {e}.month = m.month AND {e}.metric = x.metric")
            if direction > 0:
                f.append(f"{e}.factor"), lo.append(f"{e}.band_lo"), hi.append(f"{e}.band_hi")
            else:   # newer than the unit: divide, and the band turns over
                f.append(f"(1 / NULLIF({e}.factor, 0))"), lo.append(f"(1 / NULLIF({e}.band_hi, 0))"),
                hi.append(f"(1 / NULLIF({e}.band_lo, 0))")
            ranks.append(_rank_sql(f"{e}.source"))
        parts.append(f"SELECT '{p.satellite}'::text, c.country, m.month, x.metric, {' * '.join(f)}, "
                     f"{' * '.join(lo)}, {' * '.join(hi)}, {_source_sql(ranks)} {base} {' '.join(joins)}")
    return "CREATE OR REPLACE VIEW calibration_chain AS\n" + "\nUNION ALL\n".join(parts) + ";\n"


def views_sql(platforms=pf.PLATFORMS):
    prefs = ", ".join(f"('{p.satellite}', {p.preference})" for p in platforms)
    return f"""
DO $$ BEGIN   -- harmonized_monthly was a view before it became a snapshot table
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'harmonized_monthly' AND relkind = 'v') THEN
    DROP VIEW harmonized_monthly CASCADE;
  END IF;
END $$;
DROP TABLE IF EXISTS harmonized_monthly;
DROP VIEW IF EXISTS harmonized_monthly_live, calibration_chain, calibration_effective CASCADE;

CREATE VIEW calibration_effective AS
SELECT j.junction, c.country, m.month, j.metric,
       coalesce(cm.factor, ca.factor, em.factor, ea.factor)    AS factor,
       coalesce(cm.band_lo, ca.band_lo, em.band_lo, ea.band_lo) AS band_lo,
       coalesce(cm.band_hi, ca.band_hi, em.band_hi, ea.band_hi) AS band_hi,
       CASE WHEN cm.factor IS NOT NULL THEN 'country-month' WHEN ca.factor IS NOT NULL THEN 'country-all'
            WHEN em.factor IS NOT NULL THEN 'eur-month' ELSE 'eur-all' END AS source
FROM (SELECT DISTINCT junction, metric FROM calibration) j
CROSS JOIN calibration_country c
CROSS JOIN generate_series(1, 12) AS m(month)
LEFT JOIN calibration cm ON cm.junction = j.junction AND cm.metric = j.metric AND cm.country = c.country
                        AND cm.month = m.month AND cm.n_years >= {MIN_YEARS}
LEFT JOIN calibration ca ON ca.junction = j.junction AND ca.metric = j.metric AND ca.country = c.country
                        AND ca.month = 0 AND ca.n_years >= {MIN_YEARS}
LEFT JOIN calibration em ON em.junction = j.junction AND em.metric = j.metric AND em.country = '{EUR}'
                        AND em.month = m.month AND em.n_years >= {MIN_YEARS}
LEFT JOIN calibration ea ON ea.junction = j.junction AND ea.metric = j.metric AND ea.country = '{EUR}'
                        AND ea.month = 0
WHERE coalesce(cm.factor, ca.factor, em.factor, ea.factor) IS NOT NULL;

{chain_sql(platforms)}
CREATE VIEW harmonized_monthly_live AS
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
  JOIN (VALUES {prefs}) AS r(satellite, pref) ON r.satellite = s.satellite
  ORDER BY m.month_start, r.pref
), raw AS (
  SELECT c.country, date_trunc('month', h.acq_date)::date AS month_start, h.satellite,
         count(*) AS n, coalesce(sum(h.frp), 0) AS frp
  FROM hotspots_flagged h JOIN hotspot_country c ON c.hotspot_id = h.id
  WHERE h.is_burning AND c.country IS NOT NULL GROUP BY 1, 2, 3
), cov AS (
  SELECT date_trunc('month', day)::date AS month_start, satellite,
         count(*) FILTER (WHERE status = 'ok')      AS days_ok,
         count(*) FILTER (WHERE status = 'partial') AS days_partial,
         count(*) FILTER (WHERE status = 'missing') AS days_missing
  FROM coverage GROUP BY 1, 2
), per_country AS (
  SELECT cc0.country, ref.month_start, ref.satellite,
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
  CROSS JOIN (SELECT country FROM calibration_country WHERE country <> '{EUR}') cc0
  JOIN cov USING (month_start, satellite)
  LEFT JOIN raw ON raw.country = cc0.country AND raw.month_start = ref.month_start AND raw.satellite = ref.satellite
  LEFT JOIN calibration_chain cc ON cc.satellite = ref.satellite AND cc.country = cc0.country
        AND cc.month = extract(month FROM ref.month_start) AND cc.metric = 'count'
  LEFT JOIN calibration_chain cf ON cf.satellite = ref.satellite AND cf.country = cc0.country
        AND cf.month = extract(month FROM ref.month_start) AND cf.metric = 'frp'
)
SELECT * FROM per_country
UNION ALL
SELECT '{EUR}', month_start, satellite, sum(raw_count), sum(raw_frp), sum(count_snpp_eq), sum(count_lo),
       sum(count_hi), sum(frp_snpp_eq), sum(frp_lo), sum(frp_hi),
       min(days_ok), min(days_partial), min(days_missing)
FROM per_country GROUP BY month_start, satellite;

-- snapshot: the live view scans every hotspot (~20 s for Europe); the backend reads this table
CREATE TABLE harmonized_monthly AS SELECT * FROM harmonized_monthly_live;
CREATE INDEX harmonized_monthly_country_month ON harmonized_monthly (country, month_start);
"""


def _aggregates(psql_cmd, j):
    """{country: {(year, month): {satellite: (count, frp)}}} on days where both satellites are ok; + EUR."""
    lines = pg.run(psql_cmd, f"""
WITH days AS (
  SELECT a.day FROM coverage a JOIN coverage b ON b.day = a.day
  WHERE a.satellite = '{j.older}' AND b.satellite = '{j.newer}'
    AND a.status = 'ok' AND b.status = 'ok' AND a.day BETWEEN '{j.start}' AND '{j.end}'
)
SELECT c.country, extract(year FROM h.acq_date)::int, extract(month FROM h.acq_date)::int, h.satellite,
       count(*), coalesce(sum(h.frp), 0)
FROM hotspots_flagged h JOIN days d ON d.day = h.acq_date
JOIN hotspot_country c ON c.hotspot_id = h.id AND c.country IS NOT NULL
WHERE h.is_burning AND h.satellite IN ('{j.older}', '{j.newer}')
GROUP BY 1, 2, 3, 4;
""")
    agg = defaultdict(lambda: defaultdict(dict))
    for line in lines:
        iso, y, m, sat, n, frp = line.split("|")
        key, n, frp = (int(y), int(m)), int(n), float(frp)
        agg[iso][key][sat] = (n, frp)
        old = agg[EUR][key].get(sat, (0, 0.0))
        agg[EUR][key][sat] = (old[0] + n, old[1] + frp)
    return agg


def _summary(ratios):
    ratios = sorted(ratios)
    factor = statistics.median(ratios)
    if len(ratios) >= 2:
        q = statistics.quantiles(ratios, n=4, method="inclusive")
        return factor, q[0], q[2]
    return factor, factor, factor


def fit_rows(j, agg, country=EUR):
    """Calibration rows for one junction and one country from its aggregates {(y, m): {sat: (n, frp)}}."""
    by_month = {"count": defaultdict(list), "frp": defaultdict(list)}
    for (_, m), sats in agg.items():
        old_n, old_frp = sats.get(j.older, (0, 0.0))
        new_n, new_frp = sats.get(j.newer, (0, 0.0))
        if old_n < MIN_COUNT or new_n == 0:   # newer (more sensitive) saw nothing: missing data, not a 0 ratio
            continue
        by_month["count"][m].append(new_n / old_n)
        if old_frp > 0:
            by_month["frp"][m].append(new_frp / old_frp)
    rows = []
    for metric, months in by_month.items():
        pooled = [r for rs in months.values() for r in rs]
        for m, ratios in sorted(months.items()):
            rows.append((j.name, country, j.older, j.newer, m, metric, *_summary(ratios), len(ratios), j.start, j.end))
        if pooled:
            rows.append((j.name, country, j.older, j.newer, 0, metric, *_summary(pooled), len(pooled), j.start, j.end))
    return rows


def fit(psql_cmd, junctions=JUNCTIONS):
    ctry.ensure_table(psql_cmd)
    rows = []
    for j in junctions:
        for iso, agg in sorted(_aggregates(psql_cmd, j).items()):
            rows += fit_rows(j, agg, iso)
    names = ", ".join(f"'{j.name}'" for j in junctions)
    pg.run(psql_cmd, "SET client_min_messages = warning;\nBEGIN;\n" + DDL
           + f"DELETE FROM calibration WHERE junction IN ({names});\n"
           + pg.copy_block("calibration", COLUMNS, rows)
           + "TRUNCATE calibration_country;\n"
           + f"INSERT INTO calibration_country SELECT DISTINCT country FROM hotspot_country "
             f"WHERE country IS NOT NULL UNION SELECT '{EUR}';\n"
           + views_sql() + "COMMIT;\n")
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--country", default=EUR, help="factors to print (ISO3 or EUR); all are fitted")
    args = ap.parse_args(argv)
    rows = fit(pg.psql_cmd_from_env())
    countries = {r[1] for r in rows}
    print(f"fitted {len(rows)} rows for {len(countries) - (EUR in countries)} countries + {EUR}")
    print(f"{args.country}: junction metric  month  factor  [band]        years")
    for r in rows:
        j, iso, _, _, m, metric, f, lo, hi, n, *_ = r
        if iso == args.country and metric == "count":
            print(f"  {j:8s} {metric:6s} {m:5d}  {f:6.2f}  [{lo:5.2f}-{hi:5.2f}]  {n:5d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
