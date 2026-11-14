#!/usr/bin/env python3
"""Canonical per-hotspot fields: MODIS and VIIRS reduced to one form (research/02 §C).

Why: the raw `hotspots` table keeps FIRMS values as delivered (decision I2), so `confidence` is a number 0-100
for MODIS but a class l/n/h for VIIRS, and satellites are spelled Terra/Aqua/N/N20/N21 (or T/A from the API).
Nothing above this layer may branch on the sensor to pick a field. The view adds sensor-neutral columns:
  confidence_level  low | nominal | high for both sensors (MODIS binned with the FIRMS thresholds 30 / 80)
  confidence_pct    raw MODIS 0-100, NULL for VIIRS
  platform          terra | aqua | snpp | noaa20 | noaa21

The SQL lives in db/init/hotspots-views.sql, so a fresh DB gets the view automatically. This script
re-applies it on an existing DB (safe to re-run):

    python3 harmonize/canonical.py
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pg  # noqa: E402

SQL = Path(__file__).resolve().parents[1] / "db" / "init" / "hotspots-views.sql"


def build(psql_cmd):
    script = (SQL.read_text()
              + "\nSELECT coalesce(confidence_level, 'null'), count(*) FROM hotspots_canonical GROUP BY 1 ORDER BY 1;\n")
    return pg.run(psql_cmd, script)


def main(argv=None):
    argparse.ArgumentParser(description=__doc__.split("\n\n")[0]).parse_args(argv)
    for line in build(pg.psql_cmd_from_env()):
        cls, n = line.split("|")
        print(f"hotspots_canonical: confidence_level {cls}: {n} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
