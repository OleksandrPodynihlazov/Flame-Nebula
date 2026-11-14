"""L4: land cover under the hotspot, ESA CCI Land Cover (300 m, yearly 1992-2020) from Planetary Computer.

Urban 190, bare 200-202, water 210, snow/ice 220 refute a landscape fire; vegetated and cropland classes
(10-180) mildly support it. Years after 2020 use the 2020 map. The Italy window is cached per year.
"""

import math
from pathlib import Path

import numpy as np

from confidence import config
from confidence.sources import http, pc

NAME = "L4"
COLLECTION = "esa-cci-lc"
FIRST_YEAR, LAST_YEAR = 1992, 2020
REFUTE = {190: "urban", 200: "bare", 201: "bare", 202: "bare", 210: "water", 220: "snow"}
RETRIES = 5
RETRY_DELAY = 2.0   # seconds, doubled per attempt


def save_cache(path, cls, geotransform):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, cls=cls, gt=np.array(geotransform, dtype=float))


def load_cache(path):
    with np.load(path) as d:
        return d["cls"], tuple(d["gt"])


def mosaic(hrefs, bbox):
    """Read the bbox window from tiles that share one global grid. Returns (uint8 array, GDAL geotransform)."""
    import rasterio
    from rasterio.windows import Window, from_bounds

    w, s, e, n = bbox
    with rasterio.open(hrefs[0]) as src:
        res = src.res[0]
        left, top = src.bounds.left, src.bounds.top
    x0 = left + math.floor(round((w - left) / res, 6)) * res
    y0 = top - math.floor(round((top - n) / res, 6)) * res
    width, height = math.ceil(round((e - x0) / res, 6)), math.ceil(round((y0 - s) / res, 6))
    out = np.zeros((height, width), np.uint8)
    for href in hrefs:
        with rasterio.open(href) as src:
            win = from_bounds(x0, y0 - height * res, x0 + width * res, y0, src.transform)
            win = win.round_offsets().round_lengths()
            try:
                win = win.intersection(Window(0, 0, src.width, src.height))
            except Exception:  # no overlap
                continue
            data = src.read(1, window=win)
            col = round((src.transform.c + win.col_off * res - x0) / res)
            row = round((y0 - (src.transform.f - win.row_off * res)) / res)
            out[row:row + data.shape[0], col:col + data.shape[1]] = np.maximum(
                out[row:row + data.shape[0], col:col + data.shape[1]], data)
    return out, (x0, res, 0.0, y0, 0.0, -res)


def fetch_year(year, cache_path):
    items = pc.search(COLLECTION, config.ITALY_BBOX, f"{year}-01-01/{year}-12-31")
    if not items:
        raise LookupError(f"no {COLLECTION} items for {year}")
    from rasterio.errors import RasterioIOError
    hrefs = [pc.sign(i["assets"]["lccs_class"]["href"]) for i in items]
    cls, gt = http.with_retries(lambda: mosaic(hrefs, config.ITALY_BBOX), retries=RETRIES, delay=RETRY_DELAY,
                                retry_on=(RasterioIOError,))
    save_cache(cache_path, cls, gt)
    return cls, gt


def _classify(code):
    if code in REFUTE:
        return (-1, REFUTE[code])
    if 10 <= code <= 180:
        return (1, f"veg:{code}")
    return (0, "lc:nodata")


def _sample(cls, gt, lat, lon):
    col = math.floor((lon - gt[0]) / gt[1])
    row = math.floor((lat - gt[3]) / gt[5])
    if 0 <= row < cls.shape[0] and 0 <= col < cls.shape[1]:
        return int(cls[row, col])
    return 0


def run(ctx):
    maps, failed = {}, {}
    out = {}
    for h in ctx.hotspots:
        y = min(max(h.date.year, FIRST_YEAR), LAST_YEAR)
        if y not in maps and y not in failed:
            path = Path(ctx.cache_dir) / NAME / f"lc_{y}.npz"
            try:
                maps[y] = load_cache(path) if path.exists() else fetch_year(y, path)
            except http.SourceDown:
                failed[y] = "n/a:service"
            except LookupError:
                failed[y] = "n/a:no-data"
            except Exception as e:  # rasterio/GDAL read errors
                if type(e).__module__.startswith("rasterio"):
                    failed[y] = "n/a:service"
                else:
                    raise
        if y in failed:
            out[h.key] = (0, failed[y])
            continue
        cls, gt = maps[y]
        out[h.key] = _classify(_sample(cls, gt, h.lat, h.lon))
    return out
