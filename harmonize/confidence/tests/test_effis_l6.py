import datetime as dt
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from confidence.levels import l6_effis
from confidence.sources import effis, http
from confidence.tests.helpers import hs
from confidence.tests.test_levels_cheap import make_ctx

FIXTURE = Path(__file__).parent / "fixtures" / "effis_small.xml"
KM_LON_40 = 1 / (111.2 * 0.766)   # degrees of longitude per km at 40 N


class EffisParseTest(unittest.TestCase):
    def test_parse_gml_fixture(self):
        polys = effis.parse_gml(FIXTURE.read_bytes())
        self.assertEqual([p.id for p in polys], ["100", "200"])
        a, b = polys
        self.assertEqual(a.firedate, dt.date(2021, 7, 24))
        self.assertEqual(a.finaldate, dt.date(2021, 7, 29))
        self.assertEqual(a.area_ha, 13278.0)
        self.assertEqual(a.rings[0][0], (40.10, 8.50))
        self.assertEqual(a.bbox, (8.50, 40.10, 8.60, 40.20))
        self.assertEqual(len(b.rings), 2)

    def test_fetch_polygons_caches_tiles_and_dedups(self):
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(http, "get", return_value=FIXTURE.read_bytes()) as g:
                polys, failed = effis.fetch_polygons((8.2, 40.1, 9.8, 41.9), Path(d))
                self.assertEqual(sorted(p.id for p in polys), ["100", "200"])
                self.assertEqual(failed, [])
                n_calls = g.call_count
                effis.fetch_polygons((8.2, 40.1, 9.8, 41.9), Path(d))
                self.assertEqual(g.call_count, n_calls)   # second call served from cache
        self.assertEqual(n_calls, 4)                      # 2x2 one-degree tiles


class L6Test(unittest.TestCase):
    def setUp(self):
        self.polys = effis.parse_gml(FIXTURE.read_bytes())

    def run_l6(self, points, failed=()):
        with mock.patch.object(effis, "fetch_polygons", return_value=(self.polys, list(failed))):
            return l6_effis.run(make_ctx(points))

    def test_point_inside_and_date_window(self):
        p = hs(40.15, 8.55, "2021-07-25")
        self.assertEqual(self.run_l6([p])[p.key], (1, "effis:100:13278ha"))

    def test_date_window_two_days_slack(self):
        early, late = hs(40.15, 8.55, "2021-07-22"), hs(40.15, 8.55, "2021-07-31", hhmm="1300")
        out = self.run_l6([early, late])
        self.assertEqual(out[early.key][0], 1)
        self.assertEqual(out[late.key][0], 1)

    def test_date_outside_window(self):
        p = hs(40.15, 8.55, "2021-08-05")
        self.assertEqual(self.run_l6([p])[p.key], (0, "effis:none"))

    def test_point_1km_outside_counts(self):
        near = hs(40.15, 8.60 + 0.8 * KM_LON_40, "2021-07-25")
        far = hs(40.15, 8.60 + 1.5 * KM_LON_40, "2021-07-25", hhmm="1300")
        out = self.run_l6([near, far])
        self.assertEqual(out[near.key][0], 1)
        self.assertEqual(out[far.key][0], 0)

    def test_multipolygon_second_part(self):
        p = hs(41.21, 9.24, "2017-08-10")
        self.assertEqual(self.run_l6([p])[p.key][0], 1)

    def test_pre_2016_na(self):
        p = hs(40.15, 8.55, "2008-07-25")
        self.assertEqual(self.run_l6([p])[p.key], (0, "n/a:effis-2016+"))

    def test_point_in_failed_tile_is_na(self):
        p = hs(42.5, 12.5, "2021-07-25")
        out = self.run_l6([p], failed=[(12.0, 42.0, 13.0, 43.0)])
        self.assertEqual(out[p.key], (0, "n/a:service"))

    def test_wfs_down_is_na(self):
        p = hs(40.15, 8.55, "2021-07-25")
        with tempfile.TemporaryDirectory() as d:
            ctx = make_ctx([p])
            ctx.cache_dir = Path(d)
            with mock.patch.object(http, "get", side_effect=http.SourceDown("reset")), \
                    mock.patch.object(effis, "TILE_DEG", 20.0):
                self.assertEqual(l6_effis.run(ctx)[p.key], (0, "n/a:service"))


if __name__ == "__main__":
    unittest.main()
