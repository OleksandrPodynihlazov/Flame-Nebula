import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

from confidence.levels import l8_landsat
from confidence.sources import http
from confidence.tests.helpers import hs
from confidence.tests.test_levels_cheap import make_ctx

GT = (8.0, 0.001, 0.0, 41.0, 0.0, -0.001)   # ~100 m pixels in EPSG:4326 for the test


def dn(reflectance):
    """Inverse of the C2 L2 scale: DN = (SR + 0.2) / 0.0000275."""
    return np.round((np.asarray(reflectance) + 0.2) / 0.0000275).astype(np.uint16)


class MathTest(unittest.TestCase):
    def test_nbr_math(self):
        nbr = l8_landsat.nbr(dn([[0.4]]), dn([[0.1]]), np.zeros((1, 1), np.uint16))
        self.assertAlmostEqual(float(nbr[0, 0]), (0.4 - 0.1) / (0.4 + 0.1), places=3)

    def test_qa_mask_bits(self):
        qa = np.array([[0, 1, 2, 8, 16, 32, 128]], np.uint16)   # clear, fill, dilated, cloud, shadow, snow, water
        self.assertEqual(l8_landsat.valid(qa).tolist(), [[True, False, False, False, False, True, True]])

    def test_masked_pixel_is_nan(self):
        nbr = l8_landsat.nbr(dn([[0.4]]), dn([[0.1]]), np.array([[8]], np.uint16))
        self.assertTrue(np.isnan(nbr[0, 0]))


class L8Test(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def run_with_scenes(self, pts, pre_nbr, post_nbr, years=None):
        scenes = {"pre": {"id": "pre"}, "post": {"id": "post"}}

        def find(bbox, start, end):
            return scenes["pre"] if end < pts[0].date else scenes["post"]

        def read(item, bbox):
            arr = np.full((1000, 1000), pre_nbr if item["id"] == "pre" else post_nbr, np.float32)
            return arr, GT, "EPSG:4326"

        ctx = make_ctx(pts)
        ctx.cache_dir = Path(self.tmp.name)
        ctx.years = years
        with mock.patch.object(l8_landsat, "find_scene", find), mock.patch.object(l8_landsat, "read_nbr", read):
            return l8_landsat.run(ctx), ctx

    def big(self, date="2008-07-24"):
        return [hs(40.5 + i * 0.002, 8.5, date, frp=100.0) for i in range(5)]

    def test_threshold_supports(self):
        pts = self.big()
        out, ctx = self.run_with_scenes(pts, 0.5, 0.1)
        self.assertEqual(out[pts[0].key], (1, "dnbr:0.40"))
        self.assertEqual(ctx.event_signals[ctx.event_of[pts[0].key]]["l8_dnbr"], 0.4)

    def test_below_threshold(self):
        pts = self.big()
        out, _ = self.run_with_scenes(pts, 0.5, 0.45)
        self.assertEqual(out[pts[0].key], (0, "dnbr:0.05"))

    def test_no_scene_is_na(self):
        pts = self.big()
        ctx = make_ctx(pts)
        ctx.cache_dir = Path(self.tmp.name)
        with mock.patch.object(l8_landsat, "find_scene", return_value=None):
            self.assertEqual(l8_landsat.run(ctx)[pts[0].key], (0, "n/a:no-clear-scene"))

    def test_not_top_event_is_na(self):
        pts = self.big()
        small = hs(42.0, 12.0, "2008-07-24", frp=1.0)
        with mock.patch.object(l8_landsat.config, "L8_TOP_N", 1):
            out, _ = self.run_with_scenes(pts + [small], 0.5, 0.1)
        self.assertEqual(out[small.key], (0, "n/a:not-top-event"))
        self.assertEqual(out[pts[0].key][0], 1)

    def test_nonfire_event_excluded(self):
        etna = [hs(37.748, 14.999, "2008-07-24", frp=500.0), hs(37.749, 14.999, "2008-07-24", frp=500.0)]
        out, _ = self.run_with_scenes(etna, 0.5, 0.1)
        self.assertEqual(out[etna[0].key], (0, "n/a:non-fire-event"))

    def test_service_down_is_na(self):
        pts = self.big()
        ctx = make_ctx(pts)
        ctx.cache_dir = Path(self.tmp.name)
        with mock.patch.object(l8_landsat, "find_scene", side_effect=http.SourceDown("x")):
            self.assertEqual(l8_landsat.run(ctx)[pts[0].key], (0, "n/a:service"))


if __name__ == "__main__":
    unittest.main()
