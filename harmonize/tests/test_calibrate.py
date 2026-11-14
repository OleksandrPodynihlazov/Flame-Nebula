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
J3 = cal.Junction("J3", "N", "N20", D(2018, 4, 1), D(2026, 11, 1))


def ins(rows, country="ITA"):
    PG.insert_hotspots(rows, country=country)


def rows(sat, year, month, n, frp=10.0, first_day=1, lat=43.0, **kw):
    """n detections spread over the days first_day..28 of the month (several per day if n is large)."""
    inst = "VIIRS" if sat in ("N", "N20") else "MODIS"
    span = 29 - first_day
    return [dict(satellite=sat, instrument=inst, frp=frp, acq_date=D(year, month, first_day + i % span).isoformat(),
                 latitude=lat + i * 0.05, longitude=11.0, **kw) for i in range(n)]


@unittest.skipUnless(docker_ok(), "docker not available")
class CalTest(unittest.TestCase):
    gaps = []
    until = D(2016, 12, 31)

    def setUp(self):
        PG.reset()
        cov.write(PG.psql(), cov.build(until=self.until, gaps=self.gaps))

    def fit(self, *junctions):
        sm.build(PG.psql())
        cal.fit(PG.psql(), junctions or (J1, J2))

    def factor(self, junction, month, metric="count", col="factor", country="ITA"):
        return PG.sql(f"SELECT {col} FROM calibration WHERE junction='{junction}' AND month={month} "
                      f"AND metric='{metric}' AND country='{country}'")

    def chain(self, sat, month=7, metric="count", country="ITA", col="factor"):
        return float(PG.sql(f"SELECT {col} FROM calibration_chain WHERE satellite='{sat}' AND month={month} "
                            f"AND metric='{metric}' AND country='{country}'"))

    def month(self, start, cols="satellite, raw_count, count_snpp_eq", country="ITA"):
        return PG.sql(f"SELECT {cols} FROM harmonized_monthly WHERE month_start='{start}' AND country='{country}'")


class Fit(CalTest):
    def test_factor_is_the_median_of_yearly_ratios(self):
        for y, k in ((2013, 3), (2014, 3), (2015, 10)):
            ins(rows("Aqua", y, 7, 10) + rows("N", y, 7, 10 * k))
        self.fit(J2)
        self.assertEqual(float(self.factor("J2", 7)), 3.0)
        self.assertEqual(self.factor("J2", 7, col="n_years"), "3")

    def test_band_is_the_interquartile_range(self):
        for y, k in ((2013, 2), (2014, 3), (2015, 4)):
            ins(rows("Aqua", y, 7, 10) + rows("N", y, 7, 10 * k))
        self.fit(J2)
        self.assertEqual((float(self.factor("J2", 7, col="band_lo")), float(self.factor("J2", 7, col="band_hi"))),
                         (2.5, 3.5))

    def test_frp_has_its_own_factor(self):
        for y in (2013, 2014, 2015):
            ins(rows("Aqua", y, 7, 10, frp=10.0) + rows("N", y, 7, 30, frp=4.0))
        self.fit(J2)
        self.assertAlmostEqual(float(self.factor("J2", 7, "frp")), 1.2)

    def test_data_outside_the_fit_window_is_ignored(self):
        for y in (2013, 2014, 2015):
            ins(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30))
        ins(rows("Aqua", 2016, 7, 10) + rows("N", 2016, 7, 200))  # after J2 window
        self.fit(J2)
        self.assertEqual(float(self.factor("J2", 7)), 3.0)

    def test_months_with_too_few_detections_are_skipped(self):
        for y in (2013, 2014, 2015):
            ins(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30))
            ins(rows("Aqua", y, 1, 2) + rows("N", y, 1, 20))  # 2 MODIS detections: too noisy
        self.fit(J2)
        self.assertEqual(self.factor("J2", 1), "")
        self.assertEqual(float(self.factor("J2", 0)), 3.0)   # all-months fallback uses only valid months

    def test_year_months_where_the_newer_satellite_saw_nothing_are_skipped(self):
        for y in (2013, 2014, 2015):
            ins(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30))
        ins(rows("Aqua", 2012, 7, 10))          # S-NPP has no rows: missing data, not a ratio of 0
        self.fit(J2)
        self.assertEqual(float(self.factor("J2", 7)), 3.0)
        self.assertEqual(self.factor("J2", 7, col="n_years"), "3")

    def test_masked_and_offshore_detections_are_ignored(self):
        for y in (2013, 2014):
            ins(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30))
            ins(rows("N", y, 7, 25, type=3))                           # offshore
        ins([dict(satellite="N", instrument="VIIRS", latitude=45.105, longitude=9.905,
                                 acq_date=(D(y, 1, 1) + dt.timedelta(days=d)).isoformat())
                            for y in (2012, 2013, 2014) for d in range(16)])          # builds a static cell
        ins([dict(satellite="N", instrument="VIIRS", latitude=45.105, longitude=9.905,
                                 acq_date=D(y, 7, d + 1).isoformat()) for y in (2013, 2014) for d in range(20)])
        self.fit(J2)
        self.assertEqual(float(self.factor("J2", 7)), 3.0)

    def test_refit_replaces_rows(self):
        for y in (2013, 2014, 2015):
            ins(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30))
        self.fit(J2)
        self.fit(J2)
        self.assertEqual(PG.sql("SELECT count(*) FROM calibration WHERE junction='J2' AND month=7 "
                                "AND country='ITA'"), "2")


class ExcludesGaps(CalTest):
    gaps = [cov.Gap(("Aqua",), D(2014, 7, 29), D(2014, 7, 29), "missing", "test gap")]

    def test_days_where_either_satellite_is_not_ok_are_excluded(self):
        for y in (2013, 2014):
            ins(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30))
        ins([dict(satellite="N", instrument="VIIRS", acq_date="2014-07-29",
                                 latitude=42.0 + i * 0.05, longitude=13.0) for i in range(100)])
        self.fit(J2)
        self.assertEqual(float(self.factor("J2", 7)), 3.0)


class Chain(CalTest):
    def setUp(self):
        super().setUp()
        for y in (2003, 2004, 2005):
            ins(rows("Terra", y, 7, 10) + rows("Aqua", y, 7, 20))   # J1 = 2
        for y in (2013, 2014, 2015):
            ins(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30))       # J2 = 3
        ins(rows("Terra", 2001, 7, 5) + rows("Terra", 2002, 7, 5) + rows("Aqua", 2002, 7, 4, first_day=5)
                           + rows("Aqua", 2012, 1, 7, first_day=1) + rows("N", 2012, 1, 9, first_day=20))
        self.fit()

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
        ins(rows("Aqua", 2006, 3, 10))
        self.fit()                                   # harmonized_monthly is a snapshot of the fit
        self.assertEqual(self.month("2006-03-01"), "Aqua|10|30")

    def test_month_with_fewer_than_three_years_falls_back_to_all_months(self):
        for y in (2013, 2014):                       # only 2 years for March, ratio 10
            ins(rows("Aqua", y, 3, 10) + rows("N", y, 3, 100))
        self.fit()
        self.assertEqual(self.factor("J2", 3, col="n_years"), "2")
        ins(rows("Aqua", 2006, 3, 10))
        self.fit()
        self.assertEqual(self.month("2006-03-01"), "Aqua|10|30")   # pooled median 3, not March's 10

    def test_monthly_series_is_a_snapshot_rebuilt_by_each_fit(self):
        ins(rows("Aqua", 2006, 3, 10))
        self.assertEqual(self.month("2006-03-01", "raw_count"), "0")
        self.fit()
        self.assertEqual(self.month("2006-03-01", "raw_count"), "10")

    def test_coverage_of_the_reference_is_reported(self):
        self.assertEqual(self.month("2005-07-01", "days_ok, days_partial, days_missing"), "31|0|0")


class Countries(CalTest):
    def setUp(self):
        super().setUp()
        for y in (2013, 2014, 2015):
            ins(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30), "ITA")                       # ITA J2 = 3
            ins(rows("Aqua", y, 7, 10, lat=40.0) + rows("N", y, 7, 50, lat=40.0), "ESP")   # ESP J2 = 5

    def test_each_country_gets_its_own_factor_and_europe_the_pooled_one(self):
        self.fit(J2)
        self.assertEqual(float(self.factor("J2", 7, country="ITA")), 3.0)
        self.assertEqual(float(self.factor("J2", 7, country="ESP")), 5.0)
        self.assertEqual(float(self.factor("J2", 7, country="EUR")), 4.0)          # (30+50)/(10+10)

    def test_country_without_overlap_data_uses_the_europe_factor(self):
        ins(rows("Aqua", 2005, 7, 10, lat=47.0), "FRA")                                  # no S-NPP overlap
        self.fit(J2)
        self.assertEqual(self.chain("Aqua", country="FRA"), 4.0)
        self.assertEqual(PG.sql("SELECT source FROM calibration_chain WHERE satellite='Aqua' AND country='FRA' "
                                "AND month=7 AND metric='count'"), "eur-month")

    def test_europe_series_is_the_sum_of_countries_each_with_its_own_factor(self):
        ins(rows("Aqua", 2005, 7, 10), "ITA")
        ins(rows("Aqua", 2005, 7, 10, lat=40.0), "ESP")
        self.fit(J2)
        self.assertEqual(self.month("2005-07-01", country="ITA"), "Aqua|10|30")
        self.assertEqual(self.month("2005-07-01", country="ESP"), "Aqua|10|50")
        self.assertEqual(self.month("2005-07-01", country="EUR"), "Aqua|20|80")

    def test_points_without_a_country_are_left_out(self):
        ins(rows("Aqua", 2005, 7, 10), "ITA")
        ins(rows("Aqua", 2005, 7, 99, lat=60.0), None)
        self.fit(J2)
        self.assertEqual(self.month("2005-07-01", country="EUR", cols="raw_count"), "10")


class Noaa20(CalTest):
    until = D(2026, 12, 31)

    def setUp(self):
        super().setUp()
        for y in (2013, 2014, 2015):
            ins(rows("Aqua", y, 7, 10) + rows("N", y, 7, 30))                          # J2 = 3
        for y, n20 in ((2019, 40), (2020, 50), (2021, 80)):
            ins(rows("N", y, 7, 40) + rows("N20", y, 7, n20))                          # J3 ratios 1, 1.25, 2
        ins(rows("N20", 2026, 11, 25))
        self.fit(J2, J3)

    def test_newer_platform_divides_by_its_junction(self):
        self.assertEqual(float(self.factor("J3", 7)), 1.25)
        self.assertAlmostEqual(self.chain("N20"), 0.8)

    def test_band_of_a_newer_platform_is_inverted(self):
        # J3 band = IQR of (1, 1.25, 2) = 1.125 .. 1.625  ->  N20 band = 1/1.625 .. 1/1.125
        self.assertAlmostEqual(self.chain("N20", col="band_lo"), 1 / 1.625)
        self.assertAlmostEqual(self.chain("N20", col="band_hi"), 1 / 1.125)

    def test_snpp_stays_the_reference_where_both_cover_the_month(self):
        self.assertEqual(self.month("2019-07-01", "satellite"), "N")

    def test_noaa20_is_the_reference_after_snpp_ends(self):
        self.assertEqual(self.month("2026-10-01", "satellite"), "N")      # S-NPP ends 2026-11-02
        self.assertEqual(self.month("2026-11-01", "satellite, raw_count"), "N20|25")
        self.assertAlmostEqual(float(self.month("2026-11-01", "count_snpp_eq")), 20.0)   # 25 / 1.25


if __name__ == "__main__":
    unittest.main()
