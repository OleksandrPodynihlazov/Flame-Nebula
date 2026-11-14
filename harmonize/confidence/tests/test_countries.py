"""Levels use the country's bbox from Ctx instead of Italy's, and only fetch what the points need."""

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from confidence.levels import l1_nonfire, l4_landcover, l5_mcd64, l6_effis
from confidence.sources import earthdata, effis, http
from confidence.tests.helpers import hs
from confidence.tests.test_levels_cheap import make_ctx

CANARY = (-18.3, 27.5, -13.3, 29.5)
FIXTURE = Path(__file__).parent / "fixtures" / "effis_small.xml"


class CountryBboxTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def ctx(self, points, bbox):
        c = make_ctx(points)
        c.cache_dir = Path(self.tmp.name)
        c.bbox = bbox
        return c

    def test_ctx_defaults_to_italy(self):
        from confidence import config
        self.assertEqual(make_ctx([hs(40.0, 9.0)]).bbox, config.ITALY_BBOX)

    def test_l4_searches_country_bbox(self):
        seen = []
        p = hs(28.6, -17.9)
        with mock.patch.object(l4_landcover.pc, "search", side_effect=lambda c, b, d: seen.append(b) or []):
            l4_landcover.run(self.ctx([p], CANARY))
        self.assertEqual(seen[0], CANARY)

    def test_l5_searches_country_bbox(self):
        seen = []

        def search(c, b, d):
            seen.append(b)
            raise http.SourceDown("stop")

        with mock.patch.object(l5_mcd64.pc, "search", search):
            l5_mcd64.run(self.ctx([hs(28.6, -17.9, "2008-07-24")], CANARY))
        self.assertEqual(seen[0], CANARY)

    def test_effis_fetches_only_tiles_with_points(self):
        with mock.patch.object(http, "get", return_value=FIXTURE.read_bytes()) as g:
            effis.fetch_polygons((8.2, 40.1, 9.8, 41.9), Path(self.tmp.name), only_tiles={(8.0, 40.0, 9.0, 41.0)})
        self.assertEqual(g.call_count, 1)

    def test_l6_requests_tiles_of_post_2016_points(self):
        seen = {}

        def fetch(bbox, cache_dir, only_tiles=None):
            seen["bbox"], seen["tiles"] = bbox, only_tiles
            return [], []

        pts = [hs(28.6, -17.9, "2021-09-20"), hs(28.1, -15.5, "2008-07-24")]
        with mock.patch.object(effis, "fetch_polygons", fetch):
            l6_effis.run(self.ctx(pts, CANARY))
        self.assertEqual(seen["bbox"], CANARY)
        self.assertEqual(seen["tiles"], {(-18.0, 28.0, -17.0, 29.0)})

    def test_earthdata_cells_for_bbox(self):
        self.assertEqual(earthdata.cells((8.2, 40.1, 9.8, 41.9)), [(40.5, 8.5), (40.5, 9.5), (41.5, 8.5), (41.5, 9.5)])

    def test_l1_volcano_la_palma(self):
        p = hs(28.613, -17.90)   # Tajogaite 2021 lava field
        self.assertEqual(l1_nonfire.run(make_ctx([p]))[p.key], (-1, "volcano:La Palma"))


if __name__ == "__main__":
    unittest.main()
