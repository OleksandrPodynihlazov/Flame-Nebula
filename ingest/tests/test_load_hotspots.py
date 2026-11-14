"""Loader raw FIRMS archive CSV -> hotspots table, tested against a REAL Postgres.

DB tests start a throwaway postgres:17-alpine container, apply Vlad's schema
(db/init/hotspots-init.sql) and drive the loader through psql, exactly like production.
They never touch the project's own db container. Skipped if docker is unavailable.

    python3 -m unittest ingest/tests/test_load_hotspots.py -v
"""

import collections
import io
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import load_hotspots as lh  # noqa: E402
from firms_csv import ARCHIVE_HEADERS  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
SCHEMA = REPO / "db" / "init" / "hotspots-init.sql"
REAL_2001 = REPO / "data" / "raw" / "firms_archive" / "modis_2001_Italy.csv"
ITALY_2001_MONTHLY = [3, 19, 56, 78, 85, 102, 917, 1134, 511, 245, 81, 26]  # total 3,257

MODIS_HEADER = ",".join(ARCHIVE_HEADERS["modis"])
VIIRS_HEADER = ",".join(ARCHIVE_HEADERS["viirs-snpp"])
# Real rows (02-field-reference.md §A)
MODIS_ROW = "37.9843,14.1981,302.6,1.2,1.1,2001-01-07,1024,Terra,MODIS,53,6.2,289.9,6.8,D,0"
VIIRS_ROW = "45.516,10.34384,298.76,0.38,0.36,2015-01-01,0127,N,VIIRS,n,2,271.62,0.84,N,2"


def modis(**changes):
    """MODIS_ROW with some fields replaced by name."""
    names = ARCHIVE_HEADERS["modis"]
    fields = dict(zip(names, MODIS_ROW.split(",")))
    fields.update(changes)
    return ",".join(fields[n] for n in names)


# ---------------------------------------------------------------- pure mapping, no DB

class MapRow(unittest.TestCase):
    def test_modis_row_maps_to_db_columns(self):
        got = dict(zip(lh.DB_COLUMNS, lh.map_row(MODIS_HEADER.split(","), MODIS_ROW.split(","))))
        self.assertEqual(got, {
            "latitude": "37.9843", "longitude": "14.1981", "brightness": "302.6",
            "scan": "1.2", "track": "1.1", "acq_date": "2001-01-07", "acq_time": "1024",
            "satellite": "Terra", "instrument": "MODIS", "confidence": "53", "version": "6.2",
            "frp": "6.8", "daynight": "D", "type": "0",
        })

    def test_viirs_bright_ti4_goes_to_brightness_and_ti5_is_dropped(self):
        got = dict(zip(lh.DB_COLUMNS, lh.map_row(VIIRS_HEADER.split(","), VIIRS_ROW.split(","))))
        self.assertEqual(got["brightness"], "298.76")
        self.assertEqual(got["confidence"], "n")
        self.assertNotIn("271.62", got.values())

    def test_columns_are_found_by_name_not_position(self):
        names = MODIS_HEADER.split(",")
        values = MODIS_ROW.split(",")
        order = list(reversed(range(len(names))))
        got = lh.map_row([names[i] for i in order], [values[i] for i in order])
        self.assertEqual(got, lh.map_row(names, values))

    def test_nrt_header_without_type_is_rejected_for_now(self):
        nrt = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight"
        with self.assertRaisesRegex(lh.LoadError, "NRT"):
            lh.check_header(nrt.split(","))

    def test_unknown_satellite_is_rejected(self):
        with self.assertRaisesRegex(lh.LoadError, "satellite"):
            lh.map_row(MODIS_HEADER.split(","), modis(satellite="Sentinel").split(","))


# ---------------------------------------------------------------- real Postgres

def docker_ok():
    return shutil.which("docker") and subprocess.run(["docker", "info"], capture_output=True).returncode == 0


CONTAINER = None


def setUpModule():
    global CONTAINER
    if not docker_ok():
        return
    name = f"flame-loader-test-{uuid.uuid4().hex[:8]}"
    subprocess.run(["docker", "run", "-d", "--rm", "--name", name, "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
                    "postgres:17-alpine"], check=True, capture_output=True)
    CONTAINER = name
    for _ in range(60):
        # wait for the real server, not the init-time temporary one
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


@unittest.skipUnless(docker_ok(), "docker not available")
class DbTest(unittest.TestCase):
    def setUp(self):
        sql("DROP TABLE IF EXISTS hotspots")
        subprocess.run(PSQL() + ["-X", "-q", "-v", "ON_ERROR_STOP=1"], input=SCHEMA.read_text(),
                       text=True, check=True, capture_output=True)
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def csv_file(self, name, *rows, header=MODIS_HEADER):
        p = self.tmp / name
        p.write_text("\n".join((header,) + rows) + "\n")
        return p

    def load(self, path):
        return lh.load_file(path, PSQL())

    def count(self):
        return int(sql("SELECT count(*) FROM hotspots"))


class Load(DbTest):
    def test_inserts_row_with_values_as_in_the_file(self):
        res = self.load(self.csv_file("a.csv", MODIS_ROW))
        self.assertEqual((res.inserted, res.updated, res.unchanged), (1, 0, 0))
        self.assertEqual(
            sql("SELECT latitude, longitude, brightness, scan, track, acq_date, acq_time, satellite, instrument,"
                " confidence, version, frp, daynight, type FROM hotspots"),
            "37.9843|14.1981|302.6|1.2|1.1|2001-01-07|1024|Terra|MODIS|53|6.2|6.8|D|0")

    def test_zero_padded_acq_time_is_kept_as_its_value(self):
        self.load(self.csv_file("v.csv", VIIRS_ROW, header=VIIRS_HEADER))
        self.assertEqual(sql("SELECT acq_time, brightness, confidence FROM hotspots"), "127|298.76|n")

    def test_header_only_file_loads_nothing(self):
        res = self.load(self.csv_file("empty.csv"))
        self.assertEqual((res.rows, res.inserted), (0, 0))
        self.assertEqual(self.count(), 0)


class Idempotent(DbTest):
    def test_loading_the_same_file_twice_adds_nothing(self):
        f = self.csv_file("a.csv", MODIS_ROW, modis(acq_time="1130"))
        self.load(f)
        again = self.load(f)
        self.assertEqual((again.inserted, again.updated, again.unchanged), (0, 0, 2))
        self.assertEqual(self.count(), 2)

    def test_overlapping_files_do_not_duplicate(self):
        self.load(self.csv_file("a.csv", MODIS_ROW, modis(acq_time="1130")))
        res = self.load(self.csv_file("b.csv", modis(acq_time="1130"), modis(acq_time="1300")))
        self.assertEqual((res.inserted, res.unchanged), (1, 1))
        self.assertEqual(self.count(), 3)

    def test_reprocessed_row_updates_in_place(self):
        """Same detection, newer product version re-typed it (MCD14ML v02 -> v03)."""
        self.load(self.csv_file("old.csv", MODIS_ROW))
        res = self.load(self.csv_file("new.csv", modis(version="6.03", type="2")))
        self.assertEqual((res.inserted, res.updated), (0, 1))
        self.assertEqual(sql("SELECT count(*), max(version), max(type) FROM hotspots"), "1|6.03|2")

    def test_duplicate_key_inside_one_file_is_loaded_once_last_wins(self):
        res = self.load(self.csv_file("d.csv", MODIS_ROW, modis(frp="9.9")))
        self.assertEqual((res.rows, res.file_duplicates, res.inserted), (2, 1, 1))
        self.assertEqual(sql("SELECT frp FROM hotspots"), "9.9")

    def test_different_satellite_same_place_and_time_is_a_different_hotspot(self):
        self.load(self.csv_file("a.csv", MODIS_ROW, modis(satellite="Aqua")))
        self.assertEqual(self.count(), 2)


class Atomic(DbTest):
    def test_a_bad_row_rolls_back_the_whole_file(self):
        self.load(self.csv_file("ok.csv", MODIS_ROW))
        bad = self.csv_file("bad.csv", modis(acq_time="1300"), modis(acq_time="1400", type=""))  # type NOT NULL
        with self.assertRaises(lh.LoadError):
            self.load(bad)
        self.assertEqual(self.count(), 1)

    def test_missing_table_gives_a_clear_error(self):
        sql("DROP TABLE hotspots")
        with self.assertRaisesRegex(lh.LoadError, "hotspots"):
            self.load(self.csv_file("a.csv", MODIS_ROW))


class CreateTable(DbTest):
    """The table is created from Vlad's schema only when missing; an existing one is never touched."""

    def oid(self):
        return sql("SELECT 'hotspots'::regclass::oid")

    def test_creates_the_table_when_missing(self):
        sql("DROP TABLE hotspots")
        self.assertTrue(lh.ensure_table(PSQL(), SCHEMA))
        self.assertEqual(self.load(self.csv_file("a.csv", MODIS_ROW)).inserted, 1)

    def test_existing_table_and_its_rows_are_left_alone(self):
        self.load(self.csv_file("a.csv", MODIS_ROW))
        before = self.oid()
        self.assertFalse(lh.ensure_table(PSQL(), SCHEMA))
        self.assertEqual(self.oid(), before)
        self.assertEqual(self.count(), 1)

    def test_a_migrated_table_is_not_reset_to_the_init_schema(self):
        """After a schema change (e.g. ALTER ... DROP NOT NULL) the loader must not 'restore' the old shape."""
        sql("ALTER TABLE hotspots ADD COLUMN note text")
        sql("ALTER TABLE hotspots ALTER COLUMN type DROP NOT NULL")
        lh.ensure_table(PSQL(), SCHEMA)
        self.assertEqual(sql("SELECT count(*) FROM information_schema.columns "
                             "WHERE table_name='hotspots' AND column_name='note'"), "1")
        self.assertEqual(sql("SELECT is_nullable FROM information_schema.columns "
                             "WHERE table_name='hotspots' AND column_name='type'"), "YES")

    def test_cli_flag_creates_then_loads(self):
        sql("DROP TABLE hotspots")
        with redirect_stdout(io.StringIO()):
            code = lh.main(["--create-table", str(self.csv_file("a.csv", MODIS_ROW))], psql_cmd=PSQL())
        self.assertEqual(code, 0)
        self.assertEqual(self.count(), 1)

    def test_without_flag_a_missing_table_is_still_an_error(self):
        sql("DROP TABLE hotspots")
        out = io.StringIO()
        with redirect_stdout(out):
            code = lh.main([str(self.csv_file("a.csv", MODIS_ROW))], psql_cmd=PSQL())
        self.assertEqual(code, 1)
        self.assertIn("does not exist", out.getvalue())


class Cli(DbTest):
    def test_loads_many_files_reports_and_continues_after_a_failure(self):
        good1 = self.csv_file("g1.csv", MODIS_ROW)
        bad = self.csv_file("bad.csv", "not,a,firms,file", header="foo,bar,baz,qux")
        good2 = self.csv_file("g2.csv", modis(acq_time="1300"))
        out = io.StringIO()
        with redirect_stdout(out):
            code = lh.main([str(good1), str(bad), str(good2)], psql_cmd=PSQL())
        self.assertEqual(code, 1)
        self.assertEqual(self.count(), 2)
        text = out.getvalue()
        self.assertIn("g1.csv", text)
        self.assertIn("FAILED", text)
        self.assertIn("total: 2 inserted", text)

    def test_all_good_exits_zero(self):
        with redirect_stdout(io.StringIO()):
            code = lh.main([str(self.csv_file("g.csv", MODIS_ROW))], psql_cmd=PSQL())
        self.assertEqual(code, 0)


@unittest.skipUnless(REAL_2001.exists(), "real archive file not downloaded (see ingest/RUNBOOK.md)")
class RealArchive(DbTest):
    def test_italy_2001_acceptance_numbers(self):
        res = self.load(REAL_2001)
        self.assertEqual(res.inserted, 3257)
        monthly = sql("SELECT string_agg(n::text, ',' ORDER BY m) FROM "
                      "(SELECT extract(month FROM acq_date) m, count(*) n FROM hotspots GROUP BY 1) t")
        self.assertEqual(monthly, ",".join(map(str, ITALY_2001_MONTHLY)))
        self.assertEqual(sql("SELECT string_agg(DISTINCT satellite, ',') FROM hotspots"), "Terra")
        self.assertEqual(self.load(REAL_2001).inserted, 0)


if __name__ == "__main__":
    unittest.main()
