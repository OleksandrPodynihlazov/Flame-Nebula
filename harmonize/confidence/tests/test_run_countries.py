import importlib.util
import unittest
from pathlib import Path

from confidence import report

_spec = importlib.util.spec_from_file_location("confidence_run", Path(__file__).resolve().parents[1] / "run.py")
run = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run)


def row(date, cls, l3=0, l5=0, l6=0, l8=0, sensor="MODIS"):
    return {"acq_date": date, "class": cls, "sensor": sensor, "l3": l3, "l5": l5, "l6": l6, "l8": l8}


class PathsTest(unittest.TestCase):
    def test_paths_per_country(self):
        p = run.paths(Path("d"), "Spain")
        self.assertEqual(p["hotspots"], Path("d/processed/confidence/Spain/hotspot_confidence.csv"))
        self.assertEqual(p["cache"], Path("d/cache/confidence/Spain"))

    def test_parse_countries(self):
        self.assertEqual(run.parse_countries("Italy"), ["Italy"])
        self.assertEqual(run.parse_countries("Spain, Portugal,Greece"), ["Spain", "Portugal", "Greece"])


class SummaryTest(unittest.TestCase):
    def test_country_stats(self):
        rows = [row("2008-07-01", "confirmed", l5=1), row("2017-08-01", "likely", l3=1, l6=1),
                row("2017-08-02", "non_fire:static"), row("2017-08-03", "non_fire:urban"),
                row("2020-01-01", "unverified", sensor="VIIRS")]
        s = report.country_stats(iter(rows))
        self.assertEqual(s["total"], 5)
        self.assertEqual(s["classes"], {"confirmed": 1, "likely": 1, "unverified": 1, "doubtful": 0, "non_fire": 2})
        self.assertEqual(s["non_fire"], {"non_fire:static": 1, "non_fire:urban": 1})
        self.assertEqual(s["support"], {"l3": 1, "l5": 1, "l6": 1, "l8": 0})
        self.assertEqual(s["years"], [2008, 2020])
        self.assertEqual(s["by_sensor"], {"MODIS": 4, "VIIRS": 1})

    def test_summary_markdown(self):
        stats = {"Italy": report.country_stats(iter([row("2008-07-01", "confirmed")])),
                 "Spain": report.country_stats(iter([row("2008-07-01", "non_fire:volcano")]))}
        md, data = report.summary(stats)
        self.assertIn("| Italy |", md)
        self.assertIn("| Spain |", md)
        self.assertEqual(data["Spain"]["classes"]["non_fire"], 1)


if __name__ == "__main__":
    unittest.main()
