"""Throwaway real Postgres for harmonize tests (never the project's db container).

Usage in a test module:
    from pgfixture import PG, docker_ok
    setUpModule = PG.start; tearDownModule = PG.stop
"""

import shutil
import subprocess
import time
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCHEMA = REPO / "db" / "init" / "hotspots-init.sql"


def docker_ok():
    return bool(shutil.which("docker")) and subprocess.run(["docker", "info"], capture_output=True).returncode == 0


class PG:
    name = None

    @classmethod
    def start(cls):
        if not docker_ok():
            return
        cls.name = f"flame-harmonize-test-{uuid.uuid4().hex[:8]}"
        subprocess.run(["docker", "run", "-d", "--rm", "--name", cls.name, "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
                        "postgres:17-alpine"], check=True, capture_output=True)
        for _ in range(60):
            if subprocess.run(cls.psql() + ["-Atc", "select 1"], capture_output=True).returncode == 0:
                return
            time.sleep(0.5)
        raise RuntimeError("test postgres did not start")

    @classmethod
    def stop(cls):
        if cls.name:
            subprocess.run(["docker", "stop", cls.name], capture_output=True)

    @classmethod
    def psql(cls):
        return ["docker", "exec", "-i", cls.name, "psql", "-U", "postgres", "-d", "postgres", "-h", "127.0.0.1"]

    @classmethod
    def sql(cls, query, stdin=None):
        args = ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"] + ([] if stdin is not None else ["-c", query])
        r = subprocess.run(cls.psql() + args, input=stdin if stdin is not None else None,
                           capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(r.stderr)
        return r.stdout.strip()

    @classmethod
    def reset(cls):
        """Fresh DB state: drop everything we create, re-apply Vlad's hotspots schema."""
        cls.sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        cls.sql(None, stdin=SCHEMA.read_text())

    @classmethod
    def insert_hotspots(cls, rows):
        """rows: dicts with any hotspots columns; sensible defaults for the rest."""
        base = dict(latitude=41.0, longitude=12.0, brightness=310, scan=1, track=1, acq_date="2015-07-01",
                    acq_time=1230, satellite="Aqua", instrument="MODIS", confidence="80", version="6.2",
                    frp=10.0, daynight="D", type=0)
        cols = list(base)
        lines = []
        for r in rows:
            v = {**base, **r}
            lines.append(",".join("" if v[c] is None else str(v[c]) for c in cols))
        cls.sql(None, stdin=f"COPY hotspots ({','.join(cols)}) FROM STDIN WITH (FORMAT csv);\n"
                            + "\n".join(lines) + "\n\\.\n")
