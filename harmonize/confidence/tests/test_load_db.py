import csv
import io
import sys
import tempfile
import unittest
from pathlib import Path

from confidence import load_db, output, score
from confidence.tests.helpers import hs


def write_sample(path):
    p = hs(41.435, 13.11, "2008-01-02", "0105", platform="aqua")
    r = score.Result(score=65, cls="likely", reasons="L2:event:n=3,days=1,passes=1",
                     signals={l: 0 for l in ("L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8")})
    rows = output.hotspot_rows([p], {p.key: r}, {p.key: "MODIS-20080102-1"}, {p.key: {"worldview_url": "https://w/?a=1"}})
    output.write_csv(path, rows, output.HOTSPOT_COLUMNS)


class LoadDbTest(unittest.TestCase):
    def test_script_has_create_and_upsert(self):
        s = load_db.script("x\n")
        self.assertIn("CREATE TABLE IF NOT EXISTS hotspot_confidence", s)
        self.assertIn("COPY stg", s)
        self.assertIn("ON CONFLICT (satellite, acq_date, acq_time, latitude, longitude) DO UPDATE", s)
        self.assertIn("RESULT", s)

    def test_copy_rows_column_order(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "hc.csv"
            write_sample(path)
            data, n = load_db.copy_rows(path)
        self.assertEqual(n, 1)
        row = next(csv.reader(io.StringIO(data)))
        self.assertEqual(row[:5], ["Aqua", "2008-01-02", "0105", "41.4350", "13.1100"])
        self.assertEqual(len(row), len(load_db.DB_COLUMNS))
        self.assertEqual(row[load_db.DB_COLUMNS.index("class")], "likely")

    def test_main_parses_result_with_fake_psql(self):
        fake = [sys.executable, "-c", "import sys; sys.stdin.read(); print('RESULT|1|1|1|0')", "--"]
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "hc.csv"
            write_sample(path)
            self.assertEqual(load_db.main(path, psql_cmd=fake), 0)

    def test_main_reports_psql_failure(self):
        fake = [sys.executable, "-c", "import sys; sys.stdin.read(); sys.exit('boom')", "--"]
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "hc.csv"
            write_sample(path)
            self.assertEqual(load_db.main(path, psql_cmd=fake), 1)


if __name__ == "__main__":
    unittest.main()
