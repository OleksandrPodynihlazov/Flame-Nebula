#!/usr/bin/env python3
"""Coverage table: one row per satellite x UTC day, status ok / partial / missing.

Why: a hotspot file has no row for "no overpass" or "satellite was down", so without this table
a data gap looks like a quiet day (research/07 §6, decision I4). Downstream:
  * the calendar greys/hatches non-ok days instead of drawing zero;
  * calibration fits only on days where BOTH satellites of a junction are ok.

The table is fully derived from GAPS below, so every run replaces it (no manual edits in the DB).

    python3 harmonize/coverage_table.py                 # until 2025-12-31 (archive end)
    python3 harmonize/coverage_table.py --until 2026-11-14

Satellite values match hotspots.satellite in the archive: Terra, Aqua, N (S-NPP).
"""

import argparse
import datetime as dt
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pg  # noqa: E402

D = dt.date

# First and last day of usable data per platform (None = still operating).
PLATFORMS = {
    "Terra": (D(2000, 11, 1), None),   # FIRMS archive start; earlier Terra data unusable (MODIS guide §7.2.1)
    "Aqua": (D(2002, 7, 4), None),     # first Aqua day in the archive (MEASURED: 2002-07-04)
    "N": (D(2012, 1, 20), D(2026, 11, 2)),  # VIIRS guide §4 effective start; end of S-NPP mission
}
MODIS = ("Terra", "Aqua")
STATUS_RANK = {"ok": 0, "partial": 1, "missing": 2}


@dataclass(frozen=True)
class Gap:
    satellites: tuple
    start: dt.date
    end: dt.date      # inclusive
    status: str       # partial | missing | ok (ok = note only)
    note: str


# Sources and evidence: research/07-harmonization-deep-dive.md §6.
# "Italy data" = daily detection counts in the archive (zero-detection runs inside fire season).
GAPS = [
    Gap(MODIS, D(2001, 6, 15), D(2001, 7, 3), "missing",
        "FIRMS Readme: missing end Jun-early Jul 2001; bounds = 19 zero-detection days in Italy data"),
    Gap(MODIS, D(2002, 1, 1), D(2002, 12, 31), "ok",
        "FIRMS Readme: 2002 is missing some data throughout"),
    Gap(MODIS, D(2007, 8, 15), D(2007, 8, 31), "ok",
        "FIRMS Readme: some missing data from mid-Aug 2007; no missing days visible in Italy data"),
    Gap(MODIS, D(2009, 4, 21), D(2009, 4, 22), "partial",
        "FIRMS Readme: part of 21 Apr and 22 Apr 2009 missing (Italy has detections on 22 Apr)"),
    Gap(("Aqua",), D(2020, 8, 16), D(2020, 9, 2), "partial",
        "Aqua FMU failure, Direct Broadcast only (MODIS guide §7.2.4)"),
    Gap(("Aqua",), D(2024, 3, 23), D(2024, 3, 25), "partial",
        "Aqua MODIS non-recoverable data loss (Svalbard power failure), Earthdata alert"),
    Gap(("Terra",), D(2026, 3, 26), D(2026, 3, 27), "partial",
        "Terra MODIS standby, data flagged bad, Earthdata alert"),
    Gap(("N",), D(2021, 8, 3), D(2021, 8, 3), "partial", "S-NPP safe mode from 12:46 UTC (PO.DAAC)"),
    Gap(("N",), D(2021, 8, 4), D(2021, 8, 4), "missing", "S-NPP safe mode; zero detections in Italy data"),
    Gap(("N",), D(2022, 7, 26), D(2022, 7, 26), "partial", "S-NPP safe mode from ~16:30 UTC"),
    Gap(("N",), D(2022, 7, 27), D(2022, 8, 10), "missing",
        "S-NPP safe mode, unrecoverable (Earthdata); zero detections in Italy data"),
    Gap(("N",), D(2022, 8, 11), D(2022, 8, 19), "partial",
        "S-NPP recovering; land products resumed 2022-08-20 (Earthdata), low counts in Italy data"),
    Gap(("N",), D(2024, 7, 24), D(2024, 7, 24), "partial", "S-NPP VIIRS anomaly from 05:28 UTC (Earthdata)"),
    Gap(("N",), D(2024, 7, 25), D(2024, 7, 28), "missing", "S-NPP VIIRS anomaly; zero detections in Italy data"),
    Gap(("N",), D(2024, 7, 29), D(2024, 7, 29), "partial", "S-NPP VIIRS recovering; low counts in Italy data"),
    Gap(("N",), D(2026, 3, 9), D(2026, 3, 13), "missing", "S-NPP hidden for geolocation errors (Earthdata)"),
    Gap(("N",), D(2026, 3, 14), D(2026, 3, 16), "partial", "S-NPP out of spec until 03-16 19:30 UTC"),
    Gap(("N",), D(2026, 4, 28), D(2026, 4, 30), "missing", "S-NPP outage until 05-01 05:00 UTC (Earthdata)"),
    Gap(("N",), D(2026, 5, 1), D(2026, 5, 1), "partial", "S-NPP outage end 05:00 UTC"),
    Gap(("N",), D(2026, 6, 1), D(2026, 6, 2), "missing", "S-NPP outage (Earthdata)"),
    Gap(("N",), D(2026, 6, 3), D(2026, 6, 11), "partial", "S-NPP quality approved from 06-10/06-12"),
    Gap(("N",), D(2026, 7, 10), D(2026, 7, 16), "missing", "S-NPP outage until 07-17 04:00 UTC (Earthdata)"),
    Gap(("N",), D(2026, 8, 2), D(2026, 8, 6), "missing", "S-NPP outage, 08-03..08-06 excluded (Earthdata)"),
    Gap(("N",), D(2026, 11, 2), D(2026, 11, 2), "partial", "S-NPP end of mission ~13:00-15:40 UTC"),
]

COLUMNS = ("satellite", "day", "status", "note")
DDL = """
CREATE TABLE IF NOT EXISTS coverage (
  satellite TEXT NOT NULL,
  day       DATE NOT NULL,
  status    TEXT NOT NULL CHECK (status IN ('ok', 'partial', 'missing')),
  note      TEXT,
  PRIMARY KEY (satellite, day)
);
"""


def build(until, gaps=None):
    """Return [(satellite, day, status, note)] for every operating day up to `until` (inclusive)."""
    gaps = GAPS if gaps is None else gaps
    rows = []
    for sat, (first, last) in PLATFORMS.items():
        end = min(until, last) if last else until
        day = first
        while day <= end:
            status, notes = "ok", []
            for g in gaps:
                if sat in g.satellites and g.start <= day <= g.end:
                    notes.append(g.note)
                    if STATUS_RANK[g.status] > STATUS_RANK[status]:
                        status = g.status
            rows.append((sat, day, status, "; ".join(notes) or None))
            day += dt.timedelta(days=1)
    return rows


def write(psql_cmd, rows):
    """Replace the whole coverage table with `rows`, atomically."""
    script = ("SET client_min_messages = warning;\nBEGIN;\n" + DDL + "TRUNCATE coverage;\n"
              + pg.copy_block("coverage", COLUMNS, rows) + "COMMIT;\n")
    pg.run(psql_cmd, script)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--until", type=D.fromisoformat, default=D(2025, 12, 31),
                    help="last day to cover (default: 2025-12-31, end of the yearly archive)")
    args = ap.parse_args(argv)
    rows = build(args.until)
    write(pg.psql_cmd_from_env(), rows)
    counts = {}
    for _, _, status, _ in rows:
        counts[status] = counts.get(status, 0) + 1
    print(f"coverage: {len(rows)} satellite-days until {args.until} ({counts})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
