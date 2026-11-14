import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
import rasterio
from rasterio.transform import from_origin

from confidence.levels import l4_landcover
from confidence.sources import http, pc
from confidence.tests.helpers import hs
from confidence.tests.test_levels_cheap import make_ctx


def write_tif(path, array, west, north, res):
    with rasterio.open(path, "w", driver="GTiff", height=array.shape[0], width=array.shape[1], count=1,
                       dtype=array.dtype, crs="EPSG:4326", transform=from_origin(west, north, res, res)) as dst:
        dst.write(array, 1)


class HttpTest(unittest.TestCase):
    def test_retries_then_source_down(self):
        calls = []

        def boom(*a, **k):
            calls.append(1)
            raise ConnectionResetError("reset")

        with mock.patch("urllib.request.urlopen", boom):
            with self.assertRaises(http.SourceDown):
                http.get("https://example.invalid/x", retries=3, backoff=0)
        self.assertEqual(len(calls), 3)


class PcTest(unittest.TestCase):
    def setUp(self):
        pc._tokens.clear()

    def test_sign_caches_token(self):
        token = json.dumps({"token": "sv=1&sig=abc", "msft:expiry": "2099-01-01T00:00:00Z"}).encode()
        with mock.patch.object(http, "get", return_value=token) as g:
            a = pc.sign("https://acct.blob.core.windows.net/c/a.tif", "esa-cci-lc")
            b = pc.sign("https://acct.blob.core.windows.net/c/b.tif", "esa-cci-lc")
        self.assertEqual(a, "https://acct.blob.core.windows.net/c/a.tif?sv=1&sig=abc")
        self.assertTrue(b.endswith("b.tif?sv=1&sig=abc"))
        self.assertEqual(g.call_count, 1)

    def test_search_follows_next_page(self):
        p1 = {"features": [{"id": "a"}], "links": [{"rel": "next", "body": {"token": "t2"}}]}
        p2 = {"features": [{"id": "b"}], "links": []}
        with mock.patch.object(http, "get", side_effect=[json.dumps(p1).encode(), json.dumps(p2).encode()]):
            items = pc.search("esa-cci-lc", (6.0, 35.0, 18.0, 47.0), "2008-01-01/2008-12-31")
        self.assertEqual([i["id"] for i in items], ["a", "b"])


class L4Test(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_mosaic_two_tiles(self):
        bbox = (0.0, 0.0, 2.0, 1.0)  # w,s,e,n
        write_tif(self.dir / "a.tif", np.full((4, 4), 10, np.uint8), 0.0, 1.0, 0.25)
        write_tif(self.dir / "b.tif", np.full((4, 4), 190, np.uint8), 1.0, 1.0, 0.25)
        arr, transform = l4_landcover.mosaic([str(self.dir / "a.tif"), str(self.dir / "b.tif")], bbox)
        self.assertEqual(arr.shape, (4, 8))
        self.assertEqual(int(arr[0, 0]), 10)
        self.assertEqual(int(arr[0, 7]), 190)

    def test_l4_classes_from_cache(self):
        cls = np.array([[190, 210, 50], [200, 10, 0]], np.uint8)       # rows north->south, 1 deg cells
        l4_landcover.save_cache(self.dir / "L4" / "lc_2008.npz", cls, (0.0, 1.0, 0.0, 2.0, 0.0, -1.0))
        pts = {"urban": hs(1.5, 0.5), "water": hs(1.5, 1.5), "tree": hs(1.5, 2.5),
               "bare": hs(0.5, 0.5), "crop": hs(0.5, 1.5), "nodata": hs(0.5, 2.5)}
        ctx = make_ctx(list(pts.values()))
        ctx.cache_dir = self.dir
        out = l4_landcover.run(ctx)
        self.assertEqual(out[pts["urban"].key], (-1, "urban"))
        self.assertEqual(out[pts["water"].key], (-1, "water"))
        self.assertEqual(out[pts["tree"].key], (1, "veg:50"))
        self.assertEqual(out[pts["bare"].key], (-1, "bare"))
        self.assertEqual(out[pts["crop"].key], (1, "veg:10"))
        self.assertEqual(out[pts["nodata"].key], (0, "lc:nodata"))

    def test_l4_year_clamped_to_2020(self):
        cls = np.array([[60]], np.uint8)
        l4_landcover.save_cache(self.dir / "L4" / "lc_2020.npz", cls, (0.0, 1.0, 0.0, 1.0, 0.0, -1.0))
        p = hs(0.5, 0.5, "2024-07-01")
        ctx = make_ctx([p])
        ctx.cache_dir = self.dir
        self.assertEqual(l4_landcover.run(ctx)[p.key], (1, "veg:60"))

    def test_l4_service_down_is_na(self):
        p = hs(40.0, 9.0)
        ctx = make_ctx([p])
        ctx.cache_dir = self.dir
        with mock.patch.object(pc, "search", side_effect=http.SourceDown("down")):
            self.assertEqual(l4_landcover.run(ctx)[p.key], (0, "n/a:service"))


if __name__ == "__main__":
    unittest.main()
