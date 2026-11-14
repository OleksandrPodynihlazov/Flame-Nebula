#!/usr/bin/env python3
"""Recurring fire patterns: where fires come back in the same month, year after year.

Per 0.1° cell x calendar month, from S-NPP only (one sensor, one satellite per year: NOAA-20/21 would
add looks and inflate recurrence; MODIS sees 2.3x fewer recurring cells). Burning rows only (static
mask, not offshore). Design: docs/superpowers/specs/2026-11-14-fire-patterns-design.md.

  years_burned   = years with >= 1 burning detection in the cell and month
  years_observed = years whose month was fully observed (every day ok in `coverage`),
                   plus burned years of a partly observed month (a detection is a fact;
                   a partly covered month with no detection is unknown)
  probability    = years_burned / years_observed
  median_count   = median detections per burned year

Sparse: only cells that burned at least once. No row = probability 0 for an observed month.
Run after coverage_table.py and static_mask.py; every run replaces the table.

    python3 harmonize/patterns.py
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pg  # noqa: E402

CELLS_PER_DEGREE = 10


def script(source="N"):
    k = CELLS_PER_DEGREE
    return f"""\
SET client_min_messages = warning;
BEGIN;
CREATE TABLE IF NOT EXISTS fire_patterns (
  cell_lat       INTEGER  NOT NULL,   -- floor(latitude * {k})
  cell_lon       INTEGER  NOT NULL,   -- floor(longitude * {k})
  month          SMALLINT NOT NULL,   -- 1..12
  years_burned   SMALLINT NOT NULL,
  years_observed SMALLINT NOT NULL,
  probability    REAL     NOT NULL,   -- years_burned / years_observed
  median_count   REAL     NOT NULL,   -- detections per burned year, median
  PRIMARY KEY (cell_lat, cell_lon, month)
);
TRUNCATE fire_patterns;
WITH obs AS (
  SELECT extract(year FROM day)::int AS y, extract(month FROM day)::int AS m
  FROM coverage WHERE satellite = '{source}'
  GROUP BY 1, 2
  HAVING count(*) FILTER (WHERE status = 'ok')
       = extract(day FROM date_trunc('month', min(day)) + interval '1 month - 1 day')
), n_obs AS (
  SELECT m, count(*) AS n FROM obs GROUP BY m
), burned AS (
  SELECT floor(latitude * {k})::int AS clat, floor(longitude * {k})::int AS clon,
         extract(year FROM acq_date)::int AS y, extract(month FROM acq_date)::int AS m, count(*) AS n
  FROM hotspots_flagged
  WHERE satellite = '{source}' AND is_burning
  GROUP BY 1, 2, 3, 4
), cells AS (
  SELECT b.clat, b.clon, b.m, count(*) AS burned,
         coalesce(max(n_obs.n), 0) + count(*) FILTER (WHERE obs.y IS NULL) AS observed,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY b.n) AS median_count
  FROM burned b
  LEFT JOIN obs ON obs.y = b.y AND obs.m = b.m
  LEFT JOIN n_obs ON n_obs.m = b.m
  GROUP BY b.clat, b.clon, b.m
)
INSERT INTO fire_patterns
SELECT clat, clon, m, burned, observed, burned::real / observed, median_count FROM cells;
COMMIT;
SELECT count(*), count(*) FILTER (WHERE probability >= 0.5) FROM fire_patterns;
"""


def build(psql_cmd, source="N"):
    return pg.run(psql_cmd, script(source))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.parse_args(argv)
    total, likely = build(pg.psql_cmd_from_env())[-1].split("|")
    print(f"fire_patterns: {total} cell-months, {likely} with probability >= 0.5")
    return 0


if __name__ == "__main__":
    sys.exit(main())
