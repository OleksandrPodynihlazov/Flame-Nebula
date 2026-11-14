#!/usr/bin/env python3
"""Static-source mask: industrial sites, gas flares and volcanoes, as a spatial grid.

Why not the product `type` field: MODIS `type=2` jumps from 4% to 46% of detections at 2018
(MCD14ML v02 -> v03), so `WHERE type = 0` fakes a ~30% drop (research/03 §3, 07 §5).
This mask is built once, from S-NPP (the most sensitive record), and applied to every
satellite and every year, so it has no version break.

Rule (03 §3, D6): grid cell 0.01° (~1.1 km). A cell is a static source if S-NPP saw it on
>= 16 distinct days in a calendar year (the official type-2 persistence rule), in >= 3 separate
years. Each core cell is grown by one cell in every direction, because MODIS 1 km pixel centres
jitter by about a cell between overpasses. A cell is a `volcano` if most of its S-NPP detections
carry the product type 1 (volcano list, which is stable across versions).

Creates or replaces:
  static_mask(cell_lat, cell_lon, category, core, qualifying_years)   cell = floor(deg * 100)
  VIEW hotspots_flagged = hotspots + mask_category + is_burning
       is_burning = not in the mask AND not offshore (type 3). NULL type (NRT) counts as land.

    python3 harmonize/static_mask.py
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pg  # noqa: E402

HOTSPOT_COLUMNS = ("id", "latitude", "longitude", "brightness", "scan", "track", "acq_date", "acq_time",
                   "satellite", "instrument", "confidence", "version", "frp", "daynight", "type")


def script(source="N", min_days=16, min_years=3):
    cols = ", ".join(f"h.{c}" for c in HOTSPOT_COLUMNS)
    return f"""\
SET client_min_messages = warning;
BEGIN;
CREATE TABLE IF NOT EXISTS static_mask (
  cell_lat         INTEGER NOT NULL,   -- floor(latitude * 100)
  cell_lon         INTEGER NOT NULL,   -- floor(longitude * 100)
  category         TEXT NOT NULL CHECK (category IN ('static', 'volcano')),
  core             BOOLEAN NOT NULL,   -- false = added by the 1-cell dilation
  qualifying_years INTEGER NOT NULL,
  PRIMARY KEY (cell_lat, cell_lon)
);
TRUNCATE static_mask;
WITH src AS (
  SELECT floor(latitude * 100)::int AS clat, floor(longitude * 100)::int AS clon,
         extract(year FROM acq_date)::int AS y, acq_date, type
  FROM hotspots WHERE satellite = '{source}'
), per_year AS (
  SELECT clat, clon, y FROM src GROUP BY clat, clon, y HAVING count(DISTINCT acq_date) >= {min_days}
), core AS (
  SELECT clat, clon, count(*) AS years FROM per_year GROUP BY clat, clon HAVING count(*) >= {min_years}
), cell_type AS (
  SELECT clat, clon, avg((type = 1)::int) AS volcano_share FROM src GROUP BY clat, clon
), cat AS (
  SELECT c.clat, c.clon, c.years,
         CASE WHEN t.volcano_share >= 0.5 THEN 'volcano' ELSE 'static' END AS category
  FROM core c JOIN cell_type t USING (clat, clon)
), grown AS (
  SELECT clat + dy AS clat, clon + dx AS clon, category, (dx = 0 AND dy = 0) AS core, years
  FROM cat, generate_series(-1, 1) AS dy, generate_series(-1, 1) AS dx
)
INSERT INTO static_mask (cell_lat, cell_lon, category, core, qualifying_years)
SELECT DISTINCT ON (clat, clon) clat, clon, category, core, years
FROM grown ORDER BY clat, clon, core DESC, (category = 'volcano') DESC, years DESC;

CREATE OR REPLACE VIEW hotspots_flagged AS
SELECT {cols},
       m.category AS mask_category,
       (h.type IS DISTINCT FROM 3 AND m.category IS NULL) AS is_burning
FROM hotspots h
LEFT JOIN static_mask m
  ON m.cell_lat = floor(h.latitude * 100)::int AND m.cell_lon = floor(h.longitude * 100)::int;
COMMIT;
SELECT category, core, count(*) FROM static_mask GROUP BY 1, 2 ORDER BY 1, 2;
"""


def build(psql_cmd, source="N", min_days=16, min_years=3):
    return pg.run(psql_cmd, script(source, min_days, min_years))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--min-days", type=int, default=16)
    ap.add_argument("--min-years", type=int, default=3)
    args = ap.parse_args(argv)
    for line in build(pg.psql_cmd_from_env(), min_days=args.min_days, min_years=args.min_years):
        cat, core, n = line.split("|")
        print(f"static_mask: {cat:7s} {'core' if core == 't' else 'grown'}: {n} cells")
    return 0


if __name__ == "__main__":
    sys.exit(main())
