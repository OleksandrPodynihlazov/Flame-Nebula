"""load_regions.py against a REAL throwaway Postgres (same setup as test_load_hotspots.py).

    env/bin/python -m unittest ingest/tests/test_load_regions.py -v
"""

import io
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from contextlib import redirect_stdout
from unittest import mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import load_regions as lr  # noqa: E402
from regions_fixture import write_fixture  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
SCHEMA = REPO / "db" / "init" / "hotspots-init.sql"
CONTAINER = None


def docker_ok():
    return shutil.which("docker") and subprocess.run(["docker", "info"], capture_output=True).returncode == 0


def setUpModule():
    global CONTAINER
    if not docker_ok():
        return
    name = f"flame-regions-test-{uuid.uuid4().hex[:8]}"
    subprocess.run(["docker", "run", "-d", "--rm", "--name", name, "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
                    "postgres:17-alpine"], check=True, capture_output=True)
    CONTAINER = name
    for _ in range(60):
        r = subprocess.run(["docker", "exec", name, "psql", "-U", "postgres", "-h", "127.0.0.1", "-Atc", "select 1"],
                           capture_output=True, text=True)
        if r.returncode == 0:
            return
        time.sleep(0.5)
    raise RuntimeError("test postgres did not start")


def tearDownModule():
    if CONTAINER:
        subprocess.run(["docker", "stop", CONTAINER], capture_output=True)


PSQL = lambda: ["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-h", "127.0.0.1"]  # noqa: E731


def sql(query):
    r = subprocess.run(PSQL() + ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", query],
                       capture_output=True, text=True, check=True)
    return r.stdout.strip()


def insert_point(lon, lat):
    sql("INSERT INTO hotspots (latitude, longitude, acq_date, acq_time, satellite, instrument, type) "
        f"VALUES ({lat}, {lon}, '2008-01-01', 100, 'Terra', 'MODIS', 0)")


def create_hotspots(*points):
    subprocess.run(PSQL() + ["-X", "-q", "-v", "ON_ERROR_STOP=1"], input=SCHEMA.read_text(),
                   text=True, check=True, capture_output=True)
    for lon, lat in points:
        insert_point(lon, lat)


# inside AAA/A1/A1a, enclave EEE, coast of AAA, open sea
POINTS = [(2, 2), (4.5, 4.5), (-0.1, 2), (-1, 5)]


@unittest.skipUnless(docker_ok(), "docker not available")
class LoadRegions(unittest.TestCase):
    def setUp(self):
        sql("DROP TABLE IF EXISTS hotspot_regions, regions, hotspots CASCADE")
        create_hotspots(*POINTS)
        self.tmp = Path(tempfile.mkdtemp())
        write_fixture(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_main(self, *extra, countries="all"):
        out = io.StringIO()
        args = ["--boundaries", str(self.tmp)] + (["--countries", countries] if countries else []) + list(extra)
        with redirect_stdout(out):
            code = lr.main(args, psql_cmd=PSQL())
        return code, out.getvalue()

    def count(self, table):
        return int(sql(f"SELECT count(*) FROM {table}"))

    def test_loads_regions_and_assigns(self):
        code, out = self.run_main()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.count("regions"), 7)
        self.assertEqual(self.count("hotspot_regions"), 3 + 1 + 3)
        self.assertEqual(sql("SELECT count(*) FROM hotspot_regions WHERE how = 'n'"), "3")
        self.assertEqual(sql("SELECT c.parent_id = p.id FROM regions c, regions p "
                             "WHERE c.source_id = 'A1a' AND p.source_id = 'A1'"), "t")
        self.assertEqual(sql("SELECT name, name_norm, country, level FROM regions WHERE source_id = 'AAA-ADM0'"),
                         "Aland|aland|AAA|0")
        self.assertIn("regions: loaded 7", out)
        self.assertIn("ADM0: 2 inside, 1 nearest, 1 unassigned", out)

    def test_rerun_inserts_nothing(self):
        self.run_main()
        code, out = self.run_main()
        self.assertEqual(code, 0, out)
        self.assertIn("regions: already loaded, skipped", out)
        self.assertEqual(self.count("regions"), 7)
        self.assertEqual(self.count("hotspot_regions"), 7)

    def test_stale_guard_after_hotspots_rebuild(self):
        self.run_main()
        sql("DROP TABLE hotspots CASCADE")
        create_hotspots((2, 2))                     # new table: ids restart at 1
        code, out = self.run_main()
        self.assertEqual(code, 0, out)
        self.assertIn("stale", out)
        self.assertEqual(self.count("hotspot_regions"), 3)
        self.assertEqual(sql("SELECT DISTINCT hotspot_id FROM hotspot_regions"), sql("SELECT id FROM hotspots"))

    def test_missing_hotspots_table_fails(self):
        sql("DROP TABLE hotspots CASCADE")
        code, out = self.run_main()
        self.assertEqual(code, 1)
        self.assertIn('table "hotspots" does not exist', out)

    def test_missing_boundary_file_fails(self):
        (self.tmp / "geoBoundariesCGAZ_ADM2.geojson").unlink()
        code, out = self.run_main()
        self.assertEqual(code, 1)
        self.assertIn("boundaries_fetch.py", out)

    def test_rebuild_reloads(self):
        self.run_main()
        code, out = self.run_main("--rebuild")
        self.assertEqual(code, 0, out)
        self.assertIn("regions: loaded 7", out)
        self.assertEqual(self.count("regions"), 7)
        self.assertEqual(self.count("hotspot_regions"), 7)

    def test_point_index_exists_for_drawn_polygons(self):
        self.run_main()
        self.assertEqual(sql("SELECT count(*) FROM pg_indexes WHERE indexname = 'hotspots_point_gist'"), "1")
        self.assertEqual(sql("SELECT count(*) FROM hotspots "
                             "WHERE point(longitude, latitude) <@ polygon '((1,1),(3,1),(3,3),(1,3))'"), "1")

    # ---- chunks: points are processed N at a time, each chunk committed on its own

    def test_chunks_give_the_same_result(self):
        code, out = self.run_main("--chunk", "1")
        self.assertEqual(code, 0, out)
        self.assertEqual(len(re.findall(r"^chunk \d+:", out, re.M)), 4)
        self.assertEqual(self.count("hotspot_regions"), 7)
        self.assertIn("ADM0: 2 inside, 1 nearest, 1 unassigned", out)

    def test_assign_never_gets_more_points_than_the_chunk(self):
        sizes, real = [], lr.rg.assign

        def spy(regions, lons, lats, coast_km=25.0):
            sizes.append(len(lons))
            return real(regions, lons, lats, coast_km)

        with mock.patch.object(lr.rg, "assign", spy):
            code, out = self.run_main("--chunk", "3")
        self.assertEqual(code, 0, out)
        self.assertEqual(sizes, [3, 1])

    def test_rerun_continues_after_a_failed_chunk(self):
        real, calls = lr.write_assignments, []

        def flaky(psql_cmd, points, rows):
            calls.append(1)
            if len(calls) == 2:
                raise lr.RegionsError("boom")
            return real(psql_cmd, points, rows)

        with mock.patch.object(lr, "write_assignments", flaky):
            code, out = self.run_main("--chunk", "2")
        self.assertEqual(code, 1)
        self.assertIn("boom", out)
        self.assertEqual(self.count("hotspot_regions"), 4)      # chunk 1 (ids 1-2) stayed committed
        code, out = self.run_main("--chunk", "2")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.count("hotspot_regions"), 7)
        self.assertEqual(sql("SELECT count(*) FROM (SELECT 1 FROM hotspot_regions "
                             "GROUP BY region_id, hotspot_id HAVING count(*) > 1) d"), "0")

    def test_chunk_must_be_positive(self):
        with redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            lr.main(["--boundaries", str(self.tmp), "--chunk", "0"], psql_cmd=PSQL())

    # ---- scope: only the requested countries are loaded and assigned; the scope can grow later

    def test_scope_loads_only_requested_countries_then_extends(self):
        insert_point(15, 5)                                      # inside BBB
        code, out = self.run_main(countries="AAA,EEE")
        self.assertEqual(code, 0, out)
        self.assertIn("scope: 2 countries", out)
        self.assertEqual(self.count("regions"), 6)               # AAA, EEE, A1, A2, A1a, A1b
        self.assertEqual(self.count("hotspot_regions"), 7)       # (15,5) and the open-sea point stay out
        self.assertIn("ADM0: 2 inside, 1 nearest, 2 unassigned", out)

        code, out = self.run_main(countries="all")
        self.assertEqual(code, 0, out)
        self.assertIn("regions: loaded 1 (6 already present)", out)
        self.assertEqual(self.count("regions"), 7)
        self.assertEqual(self.count("hotspot_regions"), 8)       # (15,5) -> BBB
        self.assertIn("ADM0: 1 inside, 0 nearest, 1 unassigned", out)

    def test_default_scope_is_europe(self):
        code, out = self.run_main(countries=None)                # fixture countries are not European
        self.assertEqual(code, 1)
        self.assertIn("scope: 45 countries", out)
        self.assertEqual(self.count("regions"), 0)

    def test_unknown_country_code_fails_before_changing_anything(self):
        self.run_main()
        code, out = self.run_main("--rebuild", countries="AAA,ZZZ")
        self.assertEqual(code, 1)
        self.assertIn("ZZZ", out)
        self.assertEqual(self.count("regions"), 7)               # --rebuild did not truncate


if __name__ == "__main__":
    unittest.main()
