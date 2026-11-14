#!/usr/bin/env python3
"""Load raw FIRMS CSVs (archive: data/raw/firms_archive/, API: data/raw/firms_api/) into `hotspots`.

Stdlib only. It talks to Postgres through `psql`, by default the one inside the compose `db`
container. The DB publishes no port (see docker-compose.yml), so there is nothing to connect to
from the host directly.

    python3 ingest/load_hotspots.py data/raw/firms_archive/*.csv
    python3 ingest/load_hotspots.py data/raw/firms_api/*.csv     # merged files, not chunks/

    # another DB / psql (anything that accepts psql flags at the end):
    HOTSPOTS_PSQL='psql postgresql://user:pass@host:5432/db' python3 ingest/load_hotspots.py FILES...

Guarantees:
  * Raw: values are stored as FIRMS wrote them, with no filtering (decision I2, research/07 §12).
    The only mapping is by column NAME into Vlad's schema (db/init/hotspots-init.sql):
    VIIRS `bright_ti4` -> `brightness`, and `bright_t31`/`bright_ti5` are dropped (no column).
  * Archive and API files: columns are matched by name, so a file is accepted if it has the
    archive columns of one sensor, where `type`, `instrument` and the second brightness column
    may be missing (API/NRT files have no `type`). Missing `type` -> NULL; missing `instrument`
    -> derived from the brightness column (`brightness` = MODIS, `bright_ti4` = VIIRS).
  * One satellite spelling per platform, so the same detection from the archive and the API is
    one row: API `T`/`A` -> `Terra`/`Aqua`; VIIRS `N`/`N20`/`N21` as they are.
  * Idempotent: one detection = (satellite, acq_date, acq_time, latitude, longitude), enforced by
    a unique index the loader creates if missing. Re-loading a file inserts nothing. If FIRMS
    reprocessed a row (same detection, e.g. new `version`/`type`), it is updated in place.
    A row without `type` (NRT) never overwrites a row that has one (standard product), so loading
    API files after the archive cannot downgrade data; the archive replaces NRT rows.
    Duplicates inside one file are loaded once, and the last one wins.
  * Atomic per file: a file is fully loaded or not at all. Other files still load.
  * Needs `hotspots.type` nullable. A DB created before that change needs, once:
    ALTER TABLE hotspots ALTER COLUMN type DROP NOT NULL;
"""

import argparse
import csv
import io
import os
import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from firms_csv import ARCHIVE_HEADERS  # noqa: E402

DB_COLUMNS = ("latitude", "longitude", "brightness", "scan", "track", "acq_date", "acq_time",
              "satellite", "instrument", "confidence", "version", "frp", "daynight", "type")
KEY = ("satellite", "acq_date", "acq_time", "latitude", "longitude")
REPO = Path(__file__).resolve().parents[1]
DEFAULT_SCHEMA = REPO / "db" / "init" / "hotspots-init.sql"
# File spelling -> stored spelling (the archive one, which harmonize/ filters on), per instrument.
SATELLITES = {
    "MODIS": {"Terra": "Terra", "Aqua": "Aqua", "T": "Terra", "A": "Aqua"},
    "VIIRS": {"N": "N", "N20": "N20", "N21": "N21"},
}
# Per instrument: its archive columns, and which of them API/NRT files may lack.
SENSOR_COLUMNS = {
    "MODIS": (ARCHIVE_HEADERS["modis"], {"type", "instrument", "bright_t31"}),
    "VIIRS": (ARCHIVE_HEADERS["viirs-snpp"], {"type", "instrument", "bright_ti5"}),
}

# psql inside the compose db container; credentials come from the container's own env.
DEFAULT_PSQL = ["docker", "compose", "exec", "-T", "db", "sh", "-c",
                'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"', "sh"]
PSQL_FLAGS = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"]

_STAGING_TYPES = {
    "latitude": "double precision", "longitude": "double precision", "brightness": "real",
    "scan": "real", "track": "real", "acq_date": "date", "acq_time": "smallint",
    "satellite": "text", "instrument": "text", "confidence": "text", "version": "text",
    "frp": "double precision", "daynight": "char(1)", "type": "smallint",
}


class LoadError(RuntimeError):
    """The file could not be loaded; nothing from it was written."""


@dataclass
class LoadResult:
    rows: int = 0        # data rows in the file
    distinct: int = 0    # after collapsing duplicate keys inside the file
    inserted: int = 0
    updated: int = 0

    @property
    def unchanged(self):
        return self.distinct - self.inserted - self.updated

    @property
    def file_duplicates(self):
        return self.rows - self.distinct


def _instrument(columns):
    return "VIIRS" if "bright_ti4" in columns else "MODIS"


def check_header(header):
    """Accept an archive or API/NRT header of one sensor (by column name); return it normalised."""
    header = [h.strip().lower() for h in header]
    cols = set(header)
    if "latitude" not in cols:
        raise LoadError(f"not a FIRMS CSV, header starts {','.join(header)[:60]!r}")
    if len(cols) != len(header):
        raise LoadError(f"duplicate column names in header {','.join(header)!r}")
    known, optional = SENSOR_COLUMNS[_instrument(cols)]
    missing = [c for c in known if c not in cols and c not in optional]
    unexpected = [c for c in header if c not in known]
    if missing or unexpected:
        raise LoadError(f"not a FIRMS {_instrument(cols)} archive/API CSV: "
                        f"missing {missing}, unexpected {unexpected}")
    return header


def map_row(header, row):
    header = [h.strip().lower() for h in header]
    if len(row) != len(header):
        raise LoadError(f"{len(row)} fields, header has {len(header)}")
    f = dict(zip(header, row))
    instrument = _instrument(f)
    satellite = SATELLITES[instrument].get(f["satellite"])
    if satellite is None:
        raise LoadError(f"unknown {instrument} satellite {f['satellite']!r}, "
                        f"expected one of {sorted(SATELLITES[instrument])}")
    f["satellite"] = satellite
    f["brightness"] = f["bright_ti4"] if instrument == "VIIRS" else f["brightness"]
    f.setdefault("instrument", instrument)
    f.setdefault("type", "")  # API/NRT: no type column -> empty CSV field -> NULL
    return [f[c] for c in DB_COLUMNS]


def _script(copy_data):
    cols = ", ".join(DB_COLUMNS)
    key = ", ".join(KEY)
    rest = [c for c in DB_COLUMNS if c not in KEY]
    staging = ", ".join(f"{c} {_STAGING_TYPES[c]}" for c in DB_COLUMNS)
    return f"""\
SET client_min_messages = warning;
DO $$ BEGIN
  IF to_regclass('hotspots') IS NULL THEN
    RAISE EXCEPTION 'table "hotspots" does not exist: apply db/init/hotspots-init.sql first';
  END IF;
END $$;
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS hotspots_natural_key ON hotspots ({key});
CREATE TEMP TABLE stg (ord bigint GENERATED ALWAYS AS IDENTITY, {staging}) ON COMMIT DROP;
COPY stg ({cols}) FROM STDIN WITH (FORMAT csv);
{copy_data}\\.
WITH src AS (
  SELECT DISTINCT ON ({key}) {cols} FROM stg ORDER BY {key}, ord DESC
), up AS (
  INSERT INTO hotspots ({cols}) SELECT {cols} FROM src
  ON CONFLICT ({key}) DO UPDATE SET {", ".join(f"{c} = EXCLUDED.{c}" for c in rest)}
  WHERE ({", ".join(f"hotspots.{c}" for c in rest)}) IS DISTINCT FROM ({", ".join(f"EXCLUDED.{c}" for c in rest)})
    AND (EXCLUDED.type IS NOT NULL OR hotspots.type IS NULL)  -- NRT never replaces a typed row
  RETURNING (xmax = 0) AS inserted
)
SELECT 'RESULT', (SELECT count(*) FROM stg), (SELECT count(*) FROM src),
       count(*) FILTER (WHERE inserted), count(*) FILTER (WHERE NOT inserted) FROM up;
COMMIT;
"""


def load_file(path, psql_cmd):
    path = Path(path)
    with open(path, newline="") as fh:
        reader = csv.reader(fh)
        header = next(reader, None)
        if not header:
            return LoadResult()
        header = check_header(header)
        buf = io.StringIO()
        writer = csv.writer(buf, lineterminator="\n")
        rows = 0
        for line_no, row in enumerate(reader, start=2):
            if not row:
                continue
            try:
                writer.writerow(map_row(header, row))
            except LoadError as e:
                raise LoadError(f"line {line_no}: {e}") from None
            rows += 1
    if rows == 0:
        return LoadResult()

    proc = subprocess.run(list(psql_cmd) + PSQL_FLAGS, input=_script(buf.getvalue()),
                          capture_output=True, text=True)
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout).strip().splitlines()
        text = " / ".join(msg[-3:]) or f"psql exited with {proc.returncode}"
        if 'column "type"' in text and "not-null" in text:
            text += (" -- this DB predates nullable `type`; run once: "
                     "ALTER TABLE hotspots ALTER COLUMN type DROP NOT NULL;")
        raise LoadError(text)
    for line in proc.stdout.splitlines():
        if line.startswith("RESULT|"):
            _, n, distinct, ins, upd = line.split("|")
            return LoadResult(int(n), int(distinct), int(ins), int(upd))
    raise LoadError(f"psql gave no result line: {proc.stdout.strip()[:200]!r}")


def ensure_table(psql_cmd, schema_path):
    """Create `hotspots` from the schema file only if it does not exist. Returns True if created.

    An existing table is never dropped, re-created or altered, so rows and later schema
    changes (migrations) survive. The schema file is applied in one transaction.
    """
    def run(*args, stdin=None):
        proc = subprocess.run(list(psql_cmd) + PSQL_FLAGS + list(args), input=stdin,
                              capture_output=True, text=True)
        if proc.returncode != 0:
            raise LoadError((proc.stderr or proc.stdout).strip() or f"psql exited with {proc.returncode}")
        return proc.stdout.strip()

    if run("-c", "SELECT to_regclass('hotspots') IS NOT NULL") == "t":
        return False
    run("-1", stdin=Path(schema_path).read_text())
    return True


def main(argv=None, psql_cmd=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="+", help="raw FIRMS archive or API CSV files")
    ap.add_argument("--create-table", action="store_true",
                    help=f"create `hotspots` from {DEFAULT_SCHEMA.relative_to(REPO)} if it does not exist "
                         "(an existing table is never touched)")
    args = ap.parse_args(argv)
    if psql_cmd is None:
        env = os.environ.get("HOTSPOTS_PSQL")
        psql_cmd = shlex.split(env) if env else DEFAULT_PSQL

    if args.create_table:
        try:
            created = ensure_table(psql_cmd, DEFAULT_SCHEMA)
        except (LoadError, OSError) as e:
            print(f"create table: FAILED: {e}")
            return 1
        print("table hotspots: created" if created else "table hotspots: already exists, left as is")

    total, failed = LoadResult(), 0
    for f in args.files:
        name = Path(f).name
        try:
            r = load_file(f, psql_cmd)
        except (LoadError, OSError) as e:
            failed += 1
            print(f"{name}: FAILED: {e}")
            continue
        print(f"{name}: {r.rows} rows, {r.inserted} inserted, {r.updated} updated, "
              f"{r.unchanged} unchanged, {r.file_duplicates} duplicate in file")
        total.rows += r.rows
        total.distinct += r.distinct
        total.inserted += r.inserted
        total.updated += r.updated
    print(f"total: {total.inserted} inserted, {total.updated} updated, {total.unchanged} unchanged; "
          f"{failed} file(s) failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
