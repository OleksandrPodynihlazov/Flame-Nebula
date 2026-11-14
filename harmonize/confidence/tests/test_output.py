import csv
import tempfile
import unittest
from pathlib import Path

from confidence import output, report, score
from confidence.tests.helpers import hs


def rows_for(points, classes_scores, reasons=None):
    results = {}
    for p, (cls, sc) in zip(points, classes_scores):
        results[p.key] = score.Result(score=sc, cls=cls, reasons=(reasons or {}).get(p.key, "L0:conf:nominal"),
                                      signals={l: 0 for l in ("L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8")})
    event_of = {p.key: f"MODIS-{p.date:%Y%m%d}-1" for p in points}
    return output.hotspot_rows(points, results, event_of, {})


class OutputTest(unittest.TestCase):
    def test_csv_header_and_roundtrip(self):
        p = hs(40.0, 9.0)
        rows = rows_for([p], [("likely", 65)])
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "x.csv"
            output.write_csv(path, rows, output.HOTSPOT_COLUMNS)
            with path.open() as f:
                back = list(csv.DictReader(f))
        self.assertEqual(list(back[0].keys()), list(output.HOTSPOT_COLUMNS))
        r = back[0]
        self.assertEqual((r["satellite"], r["acq_date"], r["acq_time"], r["latitude"], r["longitude"]), p.key)
        self.assertEqual(r["score"], "65")
        self.assertEqual(r["class"], "likely")
        self.assertEqual(r["worldview_url"], "")
        self.assertEqual(r["l0"], "0")


class ReportTest(unittest.TestCase):
    def test_report_counts_match_results(self):
        pts = [hs(40.0, 9.0, "2008-07-24"), hs(41.0, 9.0, "2008-07-25"), hs(42.0, 9.0, "2008-08-01"),
               hs(43.0, 9.0, "2007-08-01")]
        rows = rows_for(pts, [("confirmed", 90), ("non_fire:static", 10), ("unverified", 50), ("likely", 70)])
        md, data = report.build(rows, [], 2008)
        self.assertEqual(data["classes"], {"confirmed": 1, "non_fire:static": 1, "unverified": 1})
        self.assertEqual(data["monthly"][7]["total"], 2)
        self.assertEqual(data["monthly"][7]["confirmed"], 1)
        self.assertEqual(data["monthly"][7]["non_fire"], 1)
        self.assertEqual(data["monthly"][8]["total"], 1)
        self.assertEqual(data["total"], 3)
        self.assertIn("2008", md)

    def test_report_lists_na_and_not_run_levels(self):
        pts = [hs(40.0, 9.0), hs(41.0, 9.0)]
        reasons = {p.key: "L0:conf:high;L6:n/a:effis-2016+" for p in pts}
        rows = rows_for(pts, [("unverified", 55), ("unverified", 55)], reasons)
        rows[0]["l0"] = 1
        md, data = report.build(rows, [], 2008)
        self.assertEqual(data["levels"]["L6"], {"run": True, "evaluated": 0, "na": 2, "support": 0, "refute": 0})
        self.assertEqual(data["levels"]["L0"]["evaluated"], 2)
        self.assertEqual(data["levels"]["L0"]["support"], 1)
        self.assertFalse(data["levels"]["L3"]["run"])
        self.assertIn("| L6", md)


if __name__ == "__main__":
    unittest.main()
