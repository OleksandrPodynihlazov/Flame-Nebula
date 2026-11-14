import datetime as dt
import unittest

from confidence import events
from confidence.tests.helpers import hs

KM_LAT = 1 / 111.2  # degrees of latitude per km


class EventsTest(unittest.TestCase):
    def test_two_close_same_day_join(self):
        a, b = hs(40.0, 9.0), hs(40.0 + 1.0 * KM_LAT, 9.0)
        ev = events.cluster([a, b])
        self.assertEqual(ev[a.key], ev[b.key])

    def test_far_points_split(self):
        a, b = hs(40.0, 9.0), hs(40.0 + 3.0 * KM_LAT, 9.0)
        ev = events.cluster([a, b])
        self.assertNotEqual(ev[a.key], ev[b.key])

    def test_chain_across_days(self):
        pts = [hs(40.0, 9.0, "2008-07-24"), hs(40.0 + 1.5 * KM_LAT, 9.0, "2008-07-25"),
               hs(40.0 + 3.0 * KM_LAT, 9.0, "2008-07-26")]
        ev = events.cluster(pts)
        self.assertEqual(len({ev[p.key] for p in pts}), 1)

    def test_two_day_gap_splits(self):
        a, b = hs(40.0, 9.0, "2008-07-24"), hs(40.0, 9.0, "2008-07-26", hhmm="1201")
        ev = events.cluster([a, b])
        self.assertNotEqual(ev[a.key], ev[b.key])

    def test_new_year_boundary_joins(self):
        a, b = hs(40.0, 9.0, "2008-12-31"), hs(40.0, 9.0, "2009-01-01")
        ev = events.cluster([a, b])
        self.assertEqual(ev[a.key], ev[b.key])

    def test_sensor_families_separate(self):
        a, b = hs(40.0, 9.0, sensor="MODIS"), hs(40.0, 9.0, sensor="VIIRS")
        ev = events.cluster([a, b])
        self.assertNotEqual(ev[a.key], ev[b.key])
        self.assertTrue(ev[a.key].startswith("MODIS-20080724-"))
        self.assertTrue(ev[b.key].startswith("VIIRS-20080724-"))

    def test_summarize(self):
        a = hs(40.0, 9.0, "2008-07-24", platform="terra", frp=10.0)
        b = hs(40.0 + 1.0 * KM_LAT, 9.0, "2008-07-25", platform="aqua", frp=None)
        ev = events.cluster([a, b])
        summary = events.summarize([a, b], ev)
        e = summary[ev[a.key]]
        self.assertEqual(e.n, 2)
        self.assertEqual(e.start, dt.date(2008, 7, 24))
        self.assertEqual(e.end, dt.date(2008, 7, 25))
        self.assertEqual(e.frp_sum, 10.0)
        self.assertEqual(e.platforms, {"terra", "aqua"})
        self.assertEqual(sorted(e.members), sorted([a.key, b.key]))
        self.assertAlmostEqual(e.bbox[1], 40.0)


if __name__ == "__main__":
    unittest.main()
