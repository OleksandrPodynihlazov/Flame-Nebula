#!/usr/bin/env python3
"""Country (ISO3) of every hotspot, for per-country calibration. Fills `hotspot_country`.

Three sources, in this order; a point that already has a row is never touched again:
  f  archive file name: FIRMS yearly files are already cut by country (`modis_2008_Italy.csv`),
     so ~all archive points get their country without geometry. A point in two files keeps the first.
  r  an existing level-0 assignment from ingest/load_regions.py (hotspot_regions + regions).
  g  geometry, for the rest (FIRMS API files are cut by bbox): point in the CGAZ ADM0 polygons of the
     scope, or the nearest one within 25 km (coast). A point outside every country gets country NULL,
     so it is checked once and then left out of every country series.

Why not just load_regions.py: it assigns ADM0-2 to every point (~2-3 h for Europe); this needs ADM0
only and skips the ~6M archive points.

    python3 harmonize/country.py --skip-geometry       # file names + regions only (stdlib)
    env/bin/python harmonize/country.py                # + geometry (needs shapely: ingest/requirements.txt)
"""

import argparse
import csv
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / "ingest"))
import pg  # noqa: E402
from firms_countries import FIRMS_TO_ISO3  # noqa: E402

ARCHIVE_DIR = REPO / "data" / "raw" / "firms_archive"
ADM0 = REPO / "data" / "raw" / "boundaries" / "geoBoundariesCGAZ_ADM0.geojson"
FILE_RE = re.compile(r"^(modis|viirs-snpp)_(\d{4})_(.+)\.csv$")
FK = "hotspot_country_hotspot_id_fkey"
KEY = ("latitude", "longitude", "acq_date", "acq_time", "satellite")
DEFAULT_CHUNK = 250_000

DDL = f"""
CREATE TABLE IF NOT EXISTS hotspot_country (
  hotspot_id BIGINT PRIMARY KEY,
  country    CHAR(3),                 -- ISO 3166-1 alpha-3; NULL = outside every country in scope
  how        CHAR(1) NOT NULL CHECK (how IN ('f', 'r', 'g'))   -- file name / region / geometry
);
CREATE INDEX IF NOT EXISTS hotspot_country_country ON hotspot_country (country);
DO $$ BEGIN
  -- DROP TABLE hotspots CASCADE drops only the FK: the rows would point at reused ids. Clear them.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{FK}') THEN
    TRUNCATE hotspot_country;
    ALTER TABLE hotspot_country ADD CONSTRAINT {FK}
      FOREIGN KEY (hotspot_id) REFERENCES hotspots (id) ON DELETE CASCADE;
  END IF;
END $$;
"""


def ensure_table(psql_cmd):
    pg.run(psql_cmd, "SET client_min_messages = warning;\n" + DDL)


def _inserted(lines):
    return int(lines[-1]) if lines else 0


def from_files(psql_cmd, paths):
    """Mark the rows of archive files with the file's country. Returns (rows marked, skipped file names)."""
    marked, skipped = 0, []
    for path in paths:
        path = Path(path)
        m = FILE_RE.match(path.name)
        iso = FIRMS_TO_ISO3.get(m.group(3)) if m else None
        if iso is None:
            skipped.append(path.name)
            continue
        with open(path, newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            rows = [tuple(r[c] for c in KEY) for r in reader]
        if not rows:
            continue
        lines = pg.run(psql_cmd, f"""\
SET client_min_messages = warning;
BEGIN;
CREATE TEMP TABLE stg (latitude float8, longitude float8, acq_date date, acq_time smallint, satellite text)
  ON COMMIT DROP;
{pg.copy_block("stg", KEY, rows)}WITH ins AS (
  INSERT INTO hotspot_country (hotspot_id, country, how)
  SELECT DISTINCT h.id, '{iso}', 'f' FROM stg s
  JOIN hotspots h ON h.satellite = s.satellite AND h.acq_date = s.acq_date AND h.acq_time = s.acq_time
                 AND h.latitude = s.latitude AND h.longitude = s.longitude
  ON CONFLICT (hotspot_id) DO NOTHING
  RETURNING 1)
SELECT count(*) FROM ins;
COMMIT;
""")
        marked += _inserted(lines)
    return marked, skipped


def from_regions(psql_cmd):
    """Copy level-0 countries assigned by ingest/load_regions.py. 0 if those tables do not exist."""
    lines = pg.run(psql_cmd, """\
SET client_min_messages = warning;
DO $$ BEGIN
  IF to_regclass('hotspot_regions') IS NOT NULL AND to_regclass('regions') IS NOT NULL THEN
    CREATE TEMP TABLE _n AS WITH ins AS (
      INSERT INTO hotspot_country (hotspot_id, country, how)
      SELECT hr.hotspot_id, r.country, 'r' FROM hotspot_regions hr JOIN regions r ON r.id = hr.region_id
      WHERE r.level = 0
      ON CONFLICT (hotspot_id) DO NOTHING RETURNING 1)
    SELECT count(*) AS n FROM ins;
  ELSE
    CREATE TEMP TABLE _n AS SELECT 0::bigint AS n;
  END IF;
END $$;
SELECT n FROM _n;
""")
    return _inserted(lines)


def from_geometry(psql_cmd, adm0_path, countries, chunk=DEFAULT_CHUNK, log=lambda *a: None):
    """Point-in-polygon (ADM0 only) for points that have no row yet. Returns points processed."""
    import regions_geo as rg   # shapely: only this step needs it

    regions = rg.read_level(Path(adm0_path), 0, countries=countries)
    iso_of = {r.source_id: r.country for r in regions}
    done, after = 0, 0
    while True:
        lines = pg.run(psql_cmd, f"""\
SELECT h.id, h.longitude, h.latitude FROM hotspots h
WHERE h.id > {int(after)} AND NOT EXISTS (SELECT 1 FROM hotspot_country c WHERE c.hotspot_id = h.id)
ORDER BY h.id LIMIT {int(chunk)};
""")
        if not lines:
            return done
        pts = [(int(i), float(lon), float(lat)) for i, lon, lat in (ln.split("|") for ln in lines)]
        got = {k: iso_of[sid] for k, sid, _ in rg.assign(regions, [p[1] for p in pts], [p[2] for p in pts])}
        rows = [(p[0], got.get(k), "g") for k, p in enumerate(pts)]
        pg.run(psql_cmd, "SET client_min_messages = warning;\nBEGIN;\n"
               + pg.copy_block("hotspot_country", ("hotspot_id", "country", "how"), rows) + "COMMIT;\n")
        done += len(pts)
        after = pts[-1][0]
        log(f"geometry: {done} points")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--archive", default=str(ARCHIVE_DIR), help="folder of FIRMS yearly country CSVs")
    ap.add_argument("--adm0", default=str(ADM0), help="geoBoundaries CGAZ ADM0 file")
    ap.add_argument("--countries", default="europe", help="scope for geometry, as in ingest/load_regions.py")
    ap.add_argument("--chunk", type=int, default=DEFAULT_CHUNK)
    ap.add_argument("--skip-geometry", action="store_true", help="file names and regions only (no shapely)")
    args = ap.parse_args(argv)
    psql_cmd = pg.psql_cmd_from_env()
    ensure_table(psql_cmd)
    n, skipped = from_files(psql_cmd, sorted(Path(args.archive).glob("*.csv")))
    print(f"country from file names: {n} points" + (f"; skipped {len(skipped)} file(s): {', '.join(skipped[:5])}"
                                                    + (" …" if len(skipped) > 5 else "") if skipped else ""))
    print(f"country from regions: {from_regions(psql_cmd)} points")
    if not args.skip_geometry:
        from regions_scope import parse_countries
        done = from_geometry(psql_cmd, args.adm0, parse_countries(args.countries), args.chunk,
                             log=lambda s: print(s, flush=True))
        print(f"country from geometry: {done} points")
    for line in pg.run(psql_cmd, "SELECT coalesce(country, '---'), count(*) FROM hotspot_country "
                                 "GROUP BY 1 ORDER BY 2 DESC LIMIT 12;"):
        iso, cnt = line.split("|")
        print(f"  {iso}: {cnt}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
