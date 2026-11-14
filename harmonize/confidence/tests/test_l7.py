import datetime as dt
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import h5py
import numpy as np

from confidence.levels import l7_smoke_co
from confidence.sources import earthdata, http
from confidence.tests.helpers import hs
from confidence.tests.test_levels_cheap import make_ctx

CELL = (40.5, 8.5)


def big_event(date="2008-07-24", n=12):
    return [hs(40.2 + i * 0.002, 8.55, date, frp=60.0) for i in range(n)]


def series(values_by_day):
    """values_by_day: {date: value} -> fake daily_values(product, day, cache_dir)."""
    def fake(product, day, cache_dir):
        v = values_by_day.get(product, {}).get(day)
        return {} if v is None else {CELL: v}
    return fake


def flat_with_spike(center, spike, base=2.0e18, jitter=0.05e18):
    out = {}
    for d in range(-15, 16):
        day = center + dt.timedelta(days=d)
        out[day] = base + (jitter if d % 2 else -jitter)
    out[center] = spike
    return out


class AnomalyTest(unittest.TestCase):
    def test_anomaly_rule(self):
        base = [2.0, 2.1, 1.9, 2.0, 2.05, 1.95, 2.0, 2.1, 1.9, 2.0]
        self.assertTrue(l7_smoke_co.is_anomaly(3.0, base))
        self.assertFalse(l7_smoke_co.is_anomaly(2.05, base))   # threshold = 2.0 + 2 * 0.05
        self.assertIsNone(l7_smoke_co.is_anomaly(3.0, base[:5]))   # too few baseline days


class L7Test(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def ctx(self, pts):
        c = make_ctx(pts)
        c.cache_dir = Path(self.tmp.name)
        return c

    def test_no_token_is_na(self):
        pts = big_event()
        with mock.patch.dict(os.environ, {}, clear=True):
            out = l7_smoke_co.run(self.ctx(pts))
        self.assertEqual(out[pts[0].key], (0, "n/a:no-token"))

    def test_small_event_skipped(self):
        pts = big_event(n=3)
        for p in pts:
            object.__setattr__(p, "frp", 5.0)
        with mock.patch.dict(os.environ, {"EARTHDATA_TOKEN": "t"}):
            out = l7_smoke_co.run(self.ctx(pts))
        self.assertEqual(out[pts[0].key], (0, "n/a:small-event"))

    def test_year_outside_l7_years(self):
        pts = big_event("2010-07-24")
        with mock.patch.dict(os.environ, {"EARTHDATA_TOKEN": "t"}):
            out = l7_smoke_co.run(self.ctx(pts))
        self.assertEqual(out[pts[0].key], (0, "n/a:not-in-l7-years"))

    def test_co_spike_supports_whole_event(self):
        pts = big_event()
        day = dt.date(2008, 7, 24)
        fake = series({"MOPITT": flat_with_spike(day, 3.5e18)})
        with mock.patch.dict(os.environ, {"EARTHDATA_TOKEN": "t"}), \
                mock.patch.object(earthdata, "daily_values", fake):
            ctx = self.ctx(pts)
            out = l7_smoke_co.run(ctx)
        self.assertEqual(out[pts[0].key][0], 1)
        self.assertTrue(out[pts[-1].key][1].startswith("co:+"))
        self.assertIn("l7_co_z", ctx.event_signals[ctx.event_of[pts[0].key]])

    def test_uvai_needs_value_above_one(self):
        pts = big_event()
        day = dt.date(2008, 7, 24)
        low = {d: 0.1 for d in flat_with_spike(day, 0)}
        low[day] = 0.9                                   # anomalous but < 1 -> not smoke
        with mock.patch.dict(os.environ, {"EARTHDATA_TOKEN": "t"}), \
                mock.patch.object(earthdata, "daily_values", series({"OMI": low})):
            self.assertEqual(l7_smoke_co.run(self.ctx(pts))[pts[0].key][0], 0)
        low[day] = 2.5
        with mock.patch.dict(os.environ, {"EARTHDATA_TOKEN": "t"}), \
                mock.patch.object(earthdata, "daily_values", series({"OMI": low})):
            self.assertEqual(l7_smoke_co.run(self.ctx(pts))[pts[0].key], (1, "uvai:2.5"))

    def test_service_down_is_na(self):
        pts = big_event()
        with mock.patch.dict(os.environ, {"EARTHDATA_TOKEN": "t"}), \
                mock.patch.object(earthdata, "daily_values", side_effect=http.SourceDown("x")):
            self.assertEqual(l7_smoke_co.run(self.ctx(pts))[pts[0].key], (0, "n/a:service"))


class ReaderTest(unittest.TestCase):
    def test_read_mopitt_lon_lat_grid(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "m.he5"
            lon, lat = np.arange(-179.5, 180, 1.0), np.arange(-89.5, 90, 1.0)
            day = np.full((360, 180), -9999.0, np.float32)
            night = np.full((360, 180), -9999.0, np.float32)
            day[int(8.5 + 179.5), int(40.5 + 89.5)] = 2.0e18
            night[int(8.5 + 179.5), int(40.5 + 89.5)] = 3.0e18
            with h5py.File(path, "w") as f:
                g = f.create_group("HDFEOS/GRIDS/MOP03/Data Fields")
                g["Longitude"], g["Latitude"] = lon, lat
                g["RetrievedCOTotalColumnDay"], g["RetrievedCOTotalColumnNight"] = day, night
            vals = earthdata.read_cells("MOPITT", path, [CELL, (41.5, 9.5)])
        self.assertAlmostEqual(vals[CELL], 2.5e18, delta=1e15)
        self.assertNotIn((41.5, 9.5), vals)

    def test_read_omi_lat_lon_grid(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "o.he5"
            ai = np.full((180, 360), -1.2676506e30, np.float32)
            ai[int(40.5 + 89.5), int(8.5 + 179.5)] = 1.7
            with h5py.File(path, "w") as f:
                f["HDFEOS/GRIDS/Aerosol NearUV Grid/Data Fields/UVAerosolIndex"] = ai
            vals = earthdata.read_cells("OMI", path, [CELL, (41.5, 9.5)])
        self.assertAlmostEqual(vals[CELL], 1.7, places=5)
        self.assertNotIn((41.5, 9.5), vals)


class RedirectTest(unittest.TestCase):
    def test_auth_dropped_on_cross_host_redirect(self):
        import urllib.request
        h = earthdata.DropAuthOnRedirect()
        req = urllib.request.Request("https://data.gesdisc.earthdata.nasa.gov/x",
                                     headers={"Authorization": "Bearer t"})
        new = h.redirect_request(req, None, 302, "Found", {}, "https://bucket.s3.amazonaws.com/x?sig=1")
        self.assertNotIn("Authorization", new.headers)
        same = h.redirect_request(req, None, 302, "Found", {}, "https://data.gesdisc.earthdata.nasa.gov/y")
        self.assertIn("Authorization", same.headers)


if __name__ == "__main__":
    unittest.main()
