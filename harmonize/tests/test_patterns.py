"""Recurring fire patterns: per 0.1° cell x calendar month, the share of S-NPP years that burned
(docs/superpowers/specs/2026-11-14-fire-patterns-design.md)."""

import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import coverage_table as cov  # noqa: E402
import patterns  # noqa: E402
import static_mask as sm  # noqa: E402
from pgfixture import PG, docker_ok  # noqa: E402

setUpModule, tearDownModule = PG.start, PG.stop
D = dt.date


def fires(year, month, n, lat=43.05, lon=11.05, satellite="N", **kw):
    """n detections on n distinct days of the month, in one 0.1° cell."""
    inst = "VIIRS" if satellite == "N" else "MODIS"
    return [dict(satellite=satellite, instrument=inst, acq_date=D(year, month, 1 + i).isoformat(),
                 latitude=lat, longitude=lon, **kw) for i in range(n)]


@unittest.skipUnless(docker_ok(), "docker not available")
class PatternTest(unittest.TestCase):
    until = D(2016, 12, 31)   # S-NPP from 2012-01-20: July is fully observed in 2012..2016
    gaps = []

    def setUp(self):
        PG.reset()
        cov.write(PG.psql(), cov.build(until=self.until, gaps=self.gaps))

    def build(self):
        sm.build(PG.psql())
        patterns.build(PG.psql())

    def row(self, cell_lat=430, cell_lon=110, month=7,
            cols="years_burned, years_observed, probability, median_count"):
        return PG.sql(f"SELECT {cols} FROM fire_patterns "
                      f"WHERE cell_lat={cell_lat} AND cell_lon={cell_lon} AND month={month}")

    def count(self):
        return int(PG.sql("SELECT count(*) FROM fire_patterns"))


class Basics(PatternTest):
    def test_probability_is_years_burned_over_years_observed(self):
        for y in (2013, 2014, 2015):
            PG.insert_hotspots(fires(y, 7, 3))
        self.build()
        self.assertEqual(self.row(cols="years_burned, years_observed, probability"), "3|5|0.6")

    def test_median_count_is_over_burned_years(self):
        for y, n in ((2013, 2), (2014, 6), (2015, 10)):
            PG.insert_hotspots(fires(y, 7, n))
        self.build()
        self.assertEqual(self.row(cols="median_count"), "6")

    def test_cells_are_a_tenth_of_a_degree(self):
        PG.insert_hotspots(fires(2013, 7, 1, lat=43.01) + fires(2014, 7, 1, lat=43.09) + fires(2013, 7, 1, lat=43.11))
        self.build()
        self.assertEqual(self.row(cols="years_burned"), "2")
        self.assertEqual(self.row(cell_lat=431, cols="years_burned"), "1")
        self.assertEqual(self.count(), 2)

    def test_negative_longitude_floors_west(self):
        PG.insert_hotspots(fires(2013, 7, 1, lat=40.41, lon=-3.71))
        self.build()
        self.assertEqual(self.row(cell_lat=404, cell_lon=-38, cols="years_burned"), "1")

    def test_only_snpp_is_used(self):
        PG.insert_hotspots(fires(2013, 7, 5, satellite="Aqua") + fires(2014, 7, 5, satellite="N20"))
        self.build()
        self.assertEqual(self.count(), 0)

    def test_offshore_and_masked_are_ignored(self):
        PG.insert_hotspots(fires(2013, 7, 5, type=3))
        static = [dict(satellite="N", instrument="VIIRS", latitude=45.105, longitude=9.905,
                       acq_date=(D(y, 1, 1) + dt.timedelta(days=d)).isoformat())
                  for y in (2012, 2013, 2014) for d in range(16)]
        PG.insert_hotspots(static)
        self.build()
        self.assertEqual(self.count(), 0)

    def test_rebuild_replaces_rows(self):
        PG.insert_hotspots(fires(2013, 7, 1))
        self.build()
        self.build()
        self.assertEqual(self.count(), 1)


class PartialMonth(PatternTest):
    gaps = [cov.Gap(("N",), D(2014, 8, 10), D(2014, 8, 10), "missing", "test gap")]

    def test_partly_observed_month_without_fire_is_not_observed(self):
        PG.insert_hotspots(fires(2013, 8, 1) + fires(2015, 8, 1))
        self.build()
        self.assertEqual(self.row(month=8, cols="years_burned, years_observed"), "2|4")

    def test_partly_observed_month_with_fire_counts(self):
        PG.insert_hotspots(fires(2014, 8, 1))
        self.build()
        self.assertEqual(self.row(month=8, cols="years_burned, years_observed"), "1|5")


class CoverageEnd(PatternTest):
    until = D(2016, 6, 30)

    def test_months_after_coverage_end_are_not_observed(self):
        PG.insert_hotspots(fires(2013, 7, 1))
        self.build()
        self.assertEqual(self.row(cols="years_observed"), "4")


class Cli(PatternTest):
    def test_main_prints_a_summary(self):
        import contextlib
        import io
        import os
        for y in (2013, 2014, 2015):
            PG.insert_hotspots(fires(y, 7, 1))
        PG.insert_hotspots(fires(2013, 8, 1))
        sm.build(PG.psql())
        os.environ["HOTSPOTS_PSQL"] = " ".join(PG.psql())
        out = io.StringIO()
        try:
            with contextlib.redirect_stdout(out):
                self.assertEqual(patterns.main([]), 0)
        finally:
            del os.environ["HOTSPOTS_PSQL"]
        self.assertIn("fire_patterns: 2 cell-months, 1 with probability >= 0.5", out.getvalue())


if __name__ == "__main__":
    unittest.main()
