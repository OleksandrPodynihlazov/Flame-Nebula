"""One platform list drives coverage, the calibration chain and the reference rule."""

import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import coverage_table as cov  # noqa: E402
import platforms as pf  # noqa: E402


class ChainPath(unittest.TestCase):
    def test_unit_needs_no_junction(self):
        self.assertEqual(pf.chain_path("N"), [])

    def test_older_platform_multiplies_up_to_the_unit(self):
        self.assertEqual(pf.chain_path("Aqua"), [("J2", 1)])
        self.assertEqual(pf.chain_path("Terra"), [("J1", 1), ("J2", 1)])

    def test_newer_platform_divides_back_to_the_unit(self):
        self.assertEqual(pf.chain_path("N20"), [("J3", -1)])

    def test_unknown_platform_is_an_error(self):
        with self.assertRaises(KeyError):
            pf.chain_path("N21")


class List(unittest.TestCase):
    def test_noaa20_follows_snpp(self):
        j3 = next(j for j in pf.JUNCTIONS if j.name == "J3")
        self.assertEqual((j3.older, j3.newer, j3.start, j3.end),
                         ("N", "N20", dt.date(2018, 4, 1), dt.date(2026, 11, 1)))

    def test_snpp_is_preferred_over_noaa20(self):
        pref = {p.satellite: p.preference for p in pf.PLATFORMS}
        self.assertLess(pref["N"], pref["N20"])
        self.assertLess(pref["N20"], pref["Aqua"])
        self.assertLess(pref["Aqua"], pref["Terra"])

    def test_coverage_uses_the_same_list(self):
        self.assertEqual(cov.PLATFORMS["N20"], (dt.date(2018, 4, 1), None))
        self.assertEqual(cov.PLATFORMS["N"], (dt.date(2012, 1, 20), dt.date(2026, 11, 2)))


if __name__ == "__main__":
    unittest.main()
