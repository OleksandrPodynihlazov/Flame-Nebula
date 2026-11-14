"""Calibration: per-month factors on clean overlaps (J1 Terra->Aqua, J2 Aqua->S-NPP) and the
S-NPP-equivalent monthly series built on the reference-platform chain (research/07 §8)."""

import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import calibrate as cal  # noqa: E402
import coverage_table as cov  # noqa: E402
import static_mask as sm  # noqa: E402
from pgfixture import PG, docker_ok  # noqa: E402

setUpModule, tearDownModule = PG.start, PG.stop
D = dt.date
J1 = cal.Junction("J1", "Terra", "Aqua", D(2003, 1, 1), D(2005, 12, 31))
J2 = cal.Junction("J2", "Aqua", "N", D(2012, 1, 20), D(2015, 12, 31))


def rows(sat, year, month, n, frp=10.0, first_day=1, **kw):
    """n detections spread over the days first_day..28 of the month (several per day if n is large)."""
    inst = "VIIRS" if sat == "N" else "MODIS"
    span = 29 - first_day
    return [dict(satellite=sat, instrument=inst, frp=frp, acq_date=D(year, month, first_day + i % span).isoformat(),
                 latitude=43.0 + i * 0.05, longitude=11.0, **kw) for i in range(n)]


@unittest.skipUnless(docker_ok(), "docker not available")
class CalTest(unittest.TestCase):
    gaps = []

    def setUp(self):
        PG.reset()
        cov.write(PG.psql(), cov.build(until=D(2016, 12, 31), gaps=self.gaps))

    def fit(self, *junctions):
        sm.build(PG.psql())
        cal.fit(PG.psql(), junctions or (J1, J2))

    def factor(self, junction, month, metric="count", col="factor"):
        return PG.sql(f"SELECT {col} FROM calibration WHERE junction='{junction}' AND month={month} "
                      f"AND metric='{metric}'")


class Fit(CalTest):
    def test_factor_is_the_median_of_yearly_ratios(self):
        for y, k in ((2013, 3), (2014, 3), (2015, 10)):
            PG.insert_hotspots(rows("Aqua", y, 7, 10) + rows("N", y, 7, 10 * k))
        self.fit(J2)
        self.assertEqual(float(self.factor("J2", 7)), 3.0)
        self.assertEqual(self.factor("J2", 7, col="n_years"), "3")

    def test_band_is_the_interquartile_range(self):
        for y, k in ((2013, 2), (2014, 3), (2015, 4)):
            PG.insert_hotspots(rows("Aqua", y, 7, 10) + rows("N", y, 7, 10 * k))
        self.fit(J2)
        self.assertEqual((float(self.factor("J2", 7, col="band_lo")), float(self.factor("J2", 7, col="band_hi"))),
                         (2.5, 3.5))

    def test_frp_has_its_own_factor(self):
        for y in (2013, 2014, 2015):
            PG.insert_hotspots(rows("Aqua", y, 7, 10, frp=10.0) + rows("N", y, 7, 30, frp=4.0))
        self.fit(J2)
        self.assertAlmostEqual(float(self.factor("J2", 7, "frp")), 1.2)

    def test_data_outside_the_fit_window_is_ignored(self):
        for y in (2013, 2014, 2015):
            PG.insert_hotspots(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30))
        PG.insert_hotspots(rows("Aqua", 2016, 7, 10) + rows("N", 2016, 7, 200))  # after J2 window
        self.fit(J2)
        self.assertEqual(float(self.factor("J2", 7)), 3.0)

    def test_months_with_too_few_detections_are_skipped(self):
        for y in (2013, 2014, 2015):
            PG.insert_hotspots(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30))
            PG.insert_hotspots(rows("Aqua", y, 1, 2) + rows("N", y, 1, 20))  # 2 MODIS detections: too noisy
        self.fit(J2)
        self.assertEqual(self.factor("J2", 1), "")
        self.assertEqual(float(self.factor("J2", 0)), 3.0)   # all-months fallback uses only valid months

    def test_masked_and_offshore_detections_are_ignored(self):
        for y in (2013, 2014):
            PG.insert_hotspots(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30))
            PG.insert_hotspots(rows("N", y, 7, 25, type=3))                           # offshore
        PG.insert_hotspots([dict(satellite="N", instrument="VIIRS", latitude=45.105, longitude=9.905,
                                 acq_date=(D(y, 1, 1) + dt.timedelta(days=d)).isoformat())
                            for y in (2012, 2013, 2014) for d in range(16)])          # builds a static cell
        PG.insert_hotspots([dict(satellite="N", instrument="VIIRS", latitude=45.105, longitude=9.905,
                                 acq_date=D(y, 7, d + 1).isoformat()) for y in (2013, 2014) for d in range(20)])
        self.fit(J2)
        self.assertEqual(float(self.factor("J2", 7)), 3.0)

    def test_refit_replaces_rows(self):
        for y in (2013, 2014, 2015):
            PG.insert_hotspots(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30))
        self.fit(J2)
        self.fit(J2)
        self.assertEqual(PG.sql("SELECT count(*) FROM calibration WHERE junction='J2' AND month=7"), "2")


class ExcludesGaps(CalTest):
    gaps = [cov.Gap(("Aqua",), D(2014, 7, 29), D(2014, 7, 29), "missing", "test gap")]

    def test_days_where_either_satellite_is_not_ok_are_excluded(self):
        for y in (2013, 2014):
            PG.insert_hotspots(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30))
        PG.insert_hotspots([dict(satellite="N", instrument="VIIRS", acq_date="2014-07-29",
                                 latitude=42.0 + i * 0.05, longitude=13.0) for i in range(100)])
        self.fit(J2)
        self.assertEqual(float(self.factor("J2", 7)), 3.0)


class Chain(CalTest):
    def setUp(self):
        super().setUp()
        for y in (2003, 2004, 2005):
            PG.insert_hotspots(rows("Terra", y, 7, 10) + rows("Aqua", y, 7, 20))   # J1 = 2
        for y in (2013, 2014, 2015):
            PG.insert_hotspots(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30))       # J2 = 3
        PG.insert_hotspots(rows("Terra", 2001, 7, 5) + rows("Terra", 2002, 7, 5) + rows("Aqua", 2002, 7, 4, first_day=5)
                           + rows("Aqua", 2012, 1, 7, first_day=1) + rows("N", 2012, 1, 9, first_day=20))
        self.fit()

    def chain(self, sat, month=7, metric="count"):
        return float(PG.sql(f"SELECT factor FROM calibration_chain WHERE satellite='{sat}' AND month={month} "
                            f"AND metric='{metric}'"))

    def month(self, start, cols="satellite, raw_count, count_snpp_eq"):
        return PG.sql(f"SELECT {cols} FROM harmonized_monthly WHERE month_start='{start}'")

    def test_chain_multiplies_junctions_up_to_snpp(self):
        self.assertEqual(self.chain("N"), 1.0)
        self.assertEqual(self.chain("Aqua"), 3.0)
        self.assertEqual(self.chain("Terra"), 6.0)

    def test_monthly_series_uses_one_reference_platform_per_month(self):
        self.assertEqual(self.month("2005-07-01"), "Aqua|20|60")    # Terra's 10 rows are not added
        self.assertEqual(self.month("2001-07-01"), "Terra|5|30")
        self.assertEqual(self.month("2014-07-01"), "N|30|30")

    def test_a_platform_must_cover_the_whole_month_to_be_its_reference(self):
        self.assertEqual(self.month("2002-07-01", "satellite"), "Terra")   # Aqua starts 2002-07-04
        self.assertEqual(self.month("2012-01-01", "satellite"), "Aqua")    # S-NPP starts 2012-01-20

    def test_band_is_carried_through_the_chain(self):
        self.assertEqual(self.month("2005-07-01", "count_lo, count_hi"), "60|60")

    def test_month_without_its_own_factor_falls_back_to_all_months(self):
        PG.insert_hotspots(rows("Aqua", 2006, 3, 10))
        self.assertEqual(self.month("2006-03-01"), "Aqua|10|30")

    def test_month_with_fewer_than_three_years_falls_back_to_all_months(self):
        for y in (2013, 2014):                       # only 2 years for March, ratio 10
            PG.insert_hotspots(rows("Aqua", y, 3, 10) + rows("N", y, 3, 100))
        self.fit()
        self.assertEqual(self.factor("J2", 3, col="n_years"), "2")
        PG.insert_hotspots(rows("Aqua", 2006, 3, 10))
        self.assertEqual(self.month("2006-03-01"), "Aqua|10|30")   # pooled median 3, not March's 10

    def test_coverage_of_the_reference_is_reported(self):
        self.assertEqual(self.month("2005-07-01", "days_ok, days_partial, days_missing"), "31|0|0")


if __name__ == "__main__":
    unittest.main()
