import datetime as dt
import tempfile
import unittest
from pathlib import Path

from confidence import events
from confidence.levels import Ctx, l0_product, l1_nonfire, l2_consistency
from confidence.tests.helpers import hs


def make_ctx(points, mask_points=None):
    ev = events.cluster(points)
    return Ctx(hotspots=points, by_key={p.key: p for p in points}, event_of=ev,
               events=events.summarize(points, ev), cache_dir=Path(tempfile.gettempdir()),
               years=None, all_hotspots_for_masks=mask_points if mask_points is not None else points)


def daily(lat, lon, year, n_days, sensor="VIIRS"):
    start = dt.date(year, 1, 1)
    return [hs(lat, lon, (start + dt.timedelta(days=i)).isoformat(), sensor=sensor) for i in range(n_days)]


class L0Test(unittest.TestCase):
    def test_l0_levels(self):
        pts = [hs(40.0, 9.0, conf="high"), hs(41.0, 9.0, conf="low"), hs(42.0, 9.0, conf="nominal")]
        out = l0_product.run(make_ctx(pts))
        self.assertEqual([out[p.key][0] for p in pts], [1, -1, 0])


class L1Test(unittest.TestCase):
    def test_l1_static_mask_needs_3_years(self):
        two_years = daily(40.51, 17.21, 2013, 16) + daily(40.51, 17.21, 2014, 16)
        self.assertEqual(l1_nonfire.build_static_mask(two_years, "VIIRS"), set())
        three_years = two_years + daily(40.51, 17.21, 2015, 16)
        self.assertEqual(l1_nonfire.build_static_mask(three_years, "VIIRS"), {(4051, 1721)})

    def test_l1_static_mask_needs_16_days_per_year(self):
        pts = daily(40.51, 17.21, 2013, 15) + daily(40.51, 17.21, 2014, 15) + daily(40.51, 17.21, 2015, 15)
        self.assertEqual(l1_nonfire.build_static_mask(pts, "VIIRS"), set())

    def test_l1_static_applies_to_other_sensor_and_neighbour_cell(self):
        mask_src = daily(40.515, 17.215, 2013, 16) + daily(40.515, 17.215, 2014, 16) + daily(40.515, 17.215, 2015, 16)
        modis_2008 = hs(40.525, 17.205, "2008-07-24", sensor="MODIS")  # neighbouring 0.01 deg cell
        out = l1_nonfire.run(make_ctx([modis_2008], mask_points=mask_src + [modis_2008]))
        self.assertEqual(out[modis_2008.key], (-1, "static"))

    def test_l1_volcano_radius(self):
        near = hs(37.748 + 5 / 111.2, 14.999)       # 5 km from Etna summit
        far = hs(37.748 + 9 / 111.2, 14.999)        # 9 km, outside the 7 km radius
        out = l1_nonfire.run(make_ctx([near, far]))
        self.assertEqual(out[near.key], (-1, "volcano:Etna"))
        self.assertEqual(out[far.key][0], 0)

    def test_l1_volcano_type1(self):
        p = hs(40.0, 9.0, type_=1)
        self.assertEqual(l1_nonfire.run(make_ctx([p]))[p.key], (-1, "volcano:type1"))

    def test_l1_offshore_type3(self):
        p = hs(40.0, 9.0, type_=3)
        self.assertEqual(l1_nonfire.run(make_ctx([p]))[p.key], (-1, "offshore"))


class L2Test(unittest.TestCase):
    def test_l2_isolated_is_zero(self):
        p = hs(40.0, 9.0)
        self.assertEqual(l2_consistency.run(make_ctx([p]))[p.key][0], 0)

    def test_l2_three_hotspots_supports(self):
        pts = [hs(40.0, 9.0), hs(40.005, 9.0), hs(40.01, 9.0)]
        out = l2_consistency.run(make_ctx(pts))
        self.assertTrue(all(out[p.key][0] == 1 for p in pts))

    def test_l2_two_days_supports(self):
        pts = [hs(40.0, 9.0, "2008-07-24"), hs(40.0, 9.0, "2008-07-25")]
        out = l2_consistency.run(make_ctx(pts))
        self.assertTrue(all(out[p.key][0] == 1 for p in pts))

    def test_l2_terra_and_aqua_supports(self):
        pts = [hs(40.0, 9.0, hhmm="1000", platform="terra"), hs(40.005, 9.0, hhmm="1240", platform="aqua")]
        out = l2_consistency.run(make_ctx(pts))
        self.assertTrue(all(out[p.key][0] == 1 for p in pts))

    def test_l2_two_pixels_one_pass_is_zero(self):
        pts = [hs(40.0, 9.0), hs(40.005, 9.0)]
        out = l2_consistency.run(make_ctx(pts))
        self.assertTrue(all(out[p.key][0] == 0 for p in pts))


if __name__ == "__main__":
    unittest.main()
