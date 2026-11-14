"""Run SQL through psql, the same way ingest/load_hotspots.py does (DB publishes no port)."""

import os
import shlex
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ingest"))
from load_hotspots import DEFAULT_PSQL, PSQL_FLAGS  # noqa: E402


class PgError(RuntimeError):
    pass


def psql_cmd_from_env():
    env = os.environ.get("HOTSPOTS_PSQL")
    return shlex.split(env) if env else list(DEFAULT_PSQL)


def run(psql_cmd, script):
    """Run a SQL script (stdin) with ON_ERROR_STOP; return stdout lines (unaligned, tuples only)."""
    proc = subprocess.run(list(psql_cmd) + PSQL_FLAGS, input=script, capture_output=True, text=True)
    if proc.returncode != 0:
        raise PgError((proc.stderr or proc.stdout).strip() or f"psql exited with {proc.returncode}")
    return [line for line in proc.stdout.splitlines() if line]


def copy_block(table, columns, rows):
    """COPY ... FROM STDIN text for rows of python values (None -> NULL)."""
    import csv
    import io
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    for r in rows:
        w.writerow(["" if v is None else v for v in r])
    return f"COPY {table} ({', '.join(columns)}) FROM STDIN WITH (FORMAT csv);\n{buf.getvalue()}\\.\n"
