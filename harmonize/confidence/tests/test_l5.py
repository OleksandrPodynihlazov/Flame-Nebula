import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from confidence.levels import l5_mcd64
from confidence.sources import http
from confidence.tests.helpers import hs
from confidence.tests.test_levels_cheap import make_ctx

GT = (0.0, 0.01, 0.0, 41.0, 0.0, -0.01)   # 0.01 deg pixels, origin lon 0 lat 41 (EPSG:4326 for the test)
SHAPE = (200, 200)


def doy(iso):
    d = dt.date.fromisoformat(iso)
    return d.timetuple().tm_yday


class L5Test(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name)
        self.dir = self.cache / "L5"
        self.dir.mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def burned(self, yyyymm, pixels):
        """pixels: list of (row, col, doy). Writes the items list and a sparse tile cache."""
        year = int(yyyymm[:4])
        items_path = self.dir / f"items_{year}.json"
        items = json.loads(items_path.read_text()) if items_path.exists() else {}
        items[f"h00v00_{yyyymm}"] = "https://example.invalid/x.tif"
        items_path.write_text(json.dumps(items))
        rows, cols, doys = zip(*pixels) if pixels else ((), (), ())
        l5_mcd64.save_tile(self.dir / f"h00v00_{yyyymm}.npz", rows, cols, doys, GT, "EPSG:4326", SHAPE)

    def ctx(self, points):
        c = make_ctx(points)
        c.cache_dir = self.cache
        return c

    # point lat 40.505, lon 0.505 -> row 49, col 50
    def test_l5_hit_within_16_days(self):
        self.burned("200807", [(49, 50, doy("2008-07-30"))])
        self.burned("200808", [])
        p = hs(40.505, 0.505, "2008-07-24")
        self.assertEqual(l5_mcd64.run(self.ctx([p]))[p.key], (1, "scar:mcd64(partial)"))

    def test_l5_miss_20_days(self):
        self.burned("200807", [])
        self.burned("200808", [(49, 50, doy("2008-08-13"))])
        p = hs(40.505, 0.505, "2008-07-24")
        self.assertEqual(l5_mcd64.run(self.ctx([p]))[p.key], (0, "scar:none"))

    def test_l5_dec30_uses_january(self):
        self.burned("200812", [])
        self.burned("200901", [(49, 50, doy("2009-01-05"))])
        p = hs(40.505, 0.505, "2008-12-30")
        self.assertEqual(l5_mcd64.run(self.ctx([p]))[p.key][0], 1)

    def test_l5_neighbour_pixel_counts(self):
        self.burned("200807", [(50, 51, doy("2008-07-24"))])
        self.burned("200808", [])
        p = hs(40.505, 0.505, "2008-07-24")
        self.assertEqual(l5_mcd64.run(self.ctx([p]))[p.key][0], 1)

    def test_l5_two_pixels_away_does_not_count(self):
        self.burned("200807", [(52, 50, doy("2008-07-24"))])
        self.burned("200808", [])
        p = hs(40.505, 0.505, "2008-07-24")
        self.assertEqual(l5_mcd64.run(self.ctx([p]))[p.key][0], 0)

    def test_l5_pre_2000_11_na(self):
        p = hs(40.505, 0.505, "2000-10-20")
        self.assertEqual(l5_mcd64.run(self.ctx([p]))[p.key], (0, "n/a:pre-2000-11"))

    def test_fetch_tile_retries_connection_reset(self):
        import numpy as np
        import rasterio
        from rasterio.errors import RasterioIOError
        from confidence.tests.test_pc_l4 import write_tif

        src = self.cache / "src.tif"
        write_tif(src, np.array([[0, 200], [0, 0]], np.int16), 0.0, 41.0, 0.01)
        real_open = rasterio.open
        calls = []

        def flaky(path, *a, **k):
            calls.append(path)
            if len(calls) < 3:
                raise RasterioIOError("CURL error: Recv failure: Connection reset by peer")
            return real_open(path, *a, **k)

        with mock.patch.object(l5_mcd64.pc, "sign", side_effect=lambda h: h), \
                mock.patch("rasterio.open", flaky), mock.patch.object(l5_mcd64, "RETRY_DELAY", 0):
            l5_mcd64.fetch_tile(str(src), self.dir / "t.npz")
        self.assertEqual(len(calls), 3)
        self.assertEqual(l5_mcd64.load_tile(self.dir / "t.npz")["pix"], {(0, 1): 200})

    def test_l5_service_down_is_na(self):
        p = hs(40.505, 0.505, "2008-07-24")
        with mock.patch.object(l5_mcd64.pc, "search", side_effect=http.SourceDown("down")):
            self.assertEqual(l5_mcd64.run(self.ctx([p]))[p.key], (0, "n/a:service"))


if __name__ == "__main__":
    unittest.main()
