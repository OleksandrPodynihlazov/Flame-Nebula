import unittest
from urllib.parse import parse_qs, urlparse

from confidence.levels import l3_cross_sensor, l9_worldview
from confidence.tests.helpers import hs
from confidence.tests.test_levels_cheap import make_ctx

KM_LAT = 1 / 111.2


class L3Test(unittest.TestCase):
    def test_l3_match_within_12h(self):
        m = hs(40.0, 9.0, "2015-07-24", "1000", sensor="MODIS")
        v = hs(40.0 + 1.0 * KM_LAT, 9.0, "2015-07-24", "2130", sensor="VIIRS")   # 11.5 h later, 1 km away
        out = l3_cross_sensor.run(make_ctx([m, v]))
        self.assertEqual(out[m.key][0], 1)
        self.assertEqual(out[v.key][0], 1)

    def test_l3_no_match_13h(self):
        m = hs(40.0, 9.0, "2015-07-24", "1000", sensor="MODIS")
        v = hs(40.0, 9.0, "2015-07-24", "2301", sensor="VIIRS")
        out = l3_cross_sensor.run(make_ctx([m, v]))
        self.assertEqual(out[m.key], (0, "xsensor:none"))

    def test_l3_no_match_2km(self):
        m = hs(40.0, 9.0, "2015-07-24", "1000", sensor="MODIS")
        v = hs(40.0 + 2.0 * KM_LAT, 9.0, "2015-07-24", "1100", sensor="VIIRS")
        self.assertEqual(l3_cross_sensor.run(make_ctx([m, v]))[m.key][0], 0)

    def test_l3_match_across_midnight(self):
        m = hs(40.0, 9.0, "2015-07-24", "2300", sensor="MODIS")
        v = hs(40.0, 9.0, "2015-07-25", "0130", sensor="VIIRS")
        self.assertEqual(l3_cross_sensor.run(make_ctx([m, v]))[m.key][0], 1)

    def test_l3_pre_viirs_na(self):
        m = hs(40.0, 9.0, "2008-07-24", sensor="MODIS")
        self.assertEqual(l3_cross_sensor.run(make_ctx([m]))[m.key], (0, "n/a:no-viirs-era"))


class L9Test(unittest.TestCase):
    def _q(self, h):
        return parse_qs(urlparse(l9_worldview.url(h)).query)

    def test_l9_url_params_terra(self):
        q = self._q(hs(40.2, 8.55, "2021-07-24", platform="terra"))
        self.assertEqual(q["t"], ["2021-07-24-T00:00:00Z"])
        self.assertEqual(q["t1"], ["2021-07-14-T00:00:00Z"])
        self.assertEqual(q["ca"], ["true"])
        self.assertEqual(q["cm"], ["swipe"])
        self.assertEqual(q["v"], ["8.3,39.95,8.8,40.45"])
        layers = q["l"][0].split(",")
        self.assertIn("MODIS_Terra_CorrectedReflectance_Bands721", layers)
        self.assertIn("MODIS_Terra_CorrectedReflectance_TrueColor(hidden)", layers)
        self.assertIn("MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth(hidden)", layers)
        self.assertIn("MOPITT_CO_Daily_Total_Column_Day(hidden)", layers)
        self.assertEqual(q["l1"], q["l"])

    def test_l9_aqua_and_viirs_use_aqua_layers(self):
        for h in (hs(40.2, 8.55, platform="aqua"), hs(40.2, 8.55, sensor="VIIRS")):
            self.assertIn("MODIS_Aqua_CorrectedReflectance_Bands721", self._q(h)["l"][0].split(","))

    def test_l9_run_fills_extra_cols(self):
        h = hs(40.2, 8.55)
        ctx = make_ctx([h])
        self.assertEqual(l9_worldview.run(ctx), {})
        self.assertTrue(ctx.extra_cols[h.key]["worldview_url"].startswith("https://worldview.earthdata.nasa.gov/?"))


if __name__ == "__main__":
    unittest.main()
