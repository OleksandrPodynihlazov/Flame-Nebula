"""Load <data-dir>/processed/hotspot_confidence.csv into the `hotspot_confidence` table (idempotent upsert).

Talks to Postgres through psql, by default inside the compose `db` container (same approach as
ingest/load_hotspots.py). Override with HOTSPOTS_PSQL='psql postgresql://user:pass@host:5432/db'.
The table is created from sql/hotspot_confidence.sql if it does not exist; an existing table is not altered.
"""

import csv
import io
import os
import shlex
import subprocess
from pathlib import Path

from confidence.output import HOTSPOT_COLUMNS

SQL = Path(__file__).resolve().parent / "sql" / "hotspot_confidence.sql"
KEY = ("satellite", "acq_date", "acq_time", "latitude", "longitude")
DB_COLUMNS = HOTSPOT_COLUMNS
DEFAULT_PSQL = ["docker", "compose", "exec", "-T", "db", "sh", "-c",
                'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"', "sh"]
PSQL_FLAGS = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"]


def copy_rows(csv_path):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    n = 0
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            w.writerow([row[c] for c in DB_COLUMNS])
            n += 1
    return buf.getvalue(), n


def script(copy_data):
    cols = ", ".join(f'"{c}"' if c == "class" else c for c in DB_COLUMNS)
    key = ", ".join(KEY)
    rest = [c for c in DB_COLUMNS if c not in KEY]
    q = lambda c: f'"{c}"' if c == "class" else c
    return f"""\
SET client_min_messages = warning;
BEGIN;
{SQL.read_text()}
CREATE TEMP TABLE stg (LIKE hotspot_confidence INCLUDING DEFAULTS) ON COMMIT DROP;
COPY stg ({cols}) FROM STDIN WITH (FORMAT csv);
{copy_data}\\.
WITH up AS (
  INSERT INTO hotspot_confidence ({cols}) SELECT DISTINCT ON ({key}) {cols} FROM stg
  ON CONFLICT ({key}) DO UPDATE SET {", ".join(f"{q(c)} = EXCLUDED.{q(c)}" for c in rest)}
  RETURNING (xmax = 0) AS inserted
)
SELECT 'RESULT', (SELECT count(*) FROM stg), count(*), count(*) FILTER (WHERE inserted),
       count(*) FILTER (WHERE NOT inserted) FROM up;
COMMIT;
"""


def main(csv_path, psql_cmd=None):
    if psql_cmd is None:
        env = os.environ.get("HOTSPOTS_PSQL")
        psql_cmd = shlex.split(env) if env else DEFAULT_PSQL
    data, n = copy_rows(csv_path)
    if n == 0:
        print("load-db: nothing to load")
        return 0
    proc = subprocess.run(list(psql_cmd) + PSQL_FLAGS, input=script(data), capture_output=True, text=True)
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout).strip().splitlines()
        print(f"load-db: FAILED: {' / '.join(msg[-3:]) or proc.returncode}")
        return 1
    for line in proc.stdout.splitlines():
        if line.startswith("RESULT|"):
            _, staged, upserted, ins, upd = line.split("|")
            print(f"load-db: {staged} rows staged, {ins} inserted, {upd} updated")
            return 0
    print(f"load-db: FAILED: no result line from psql: {proc.stdout.strip()[:200]!r}")
    return 1
