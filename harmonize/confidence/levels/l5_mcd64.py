"""L5: MODIS burned area MCD64A1 v6.1 (500 m, monthly, burn day of year) from Planetary Computer.

Supports when any pixel in the 3x3 window around the hotspot burned within +/-16 days of the detection.
Partial independence: MCD64A1 uses active-fire maps to train its classifier (Giglio et al. 2018), so the weight
is reduced and the reason is labelled '(partial)'. Burned pixels are cached sparsely per tile and month.
"""

import datetime as dt
import json
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from confidence import config
from confidence.sources import http, pc

NAME = "L5"
COLLECTION = "modis-64A1-061"
WINDOW_DAYS = 16
START = dt.date(2000, 11, 1)
THREADS = 4
RETRIES = 5
RETRY_DELAY = 2.0   # seconds, doubled per attempt (blob storage resets connections intermittently)


def save_tile(path, rows, cols, doys, gt, crs, shape):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, rows=np.asarray(rows, np.int32), cols=np.asarray(cols, np.int32),
                        doy=np.asarray(doys, np.int16), gt=np.asarray(gt, float), crs=np.array(str(crs)),
                        shape=np.asarray(shape, np.int32))


def load_tile(path):
    with np.load(path) as d:
        pix = dict(zip(zip(d["rows"].tolist(), d["cols"].tolist()), d["doy"].tolist()))
        return {"pix": pix, "gt": tuple(d["gt"]), "crs": str(d["crs"]), "shape": tuple(d["shape"])}


def month_hrefs(year, cache_dir, bbox=config.ITALY_BBOX):
    """{'h18v04_200807': href} for every tile-month intersecting Italy in that year (cached)."""
    path = Path(cache_dir) / NAME / f"items_{year}.json"
    if path.exists():
        return json.loads(path.read_text())
    out = {}
    for item in pc.search(COLLECTION, bbox, f"{year}-01-01/{year}-12-31"):
        tile = item["id"].split(".")[2]
        when = item["properties"].get("start_datetime") or item["properties"]["datetime"]
        out[f"{tile}_{when[:4]}{when[5:7]}"] = item["assets"]["Burn_Date"]["href"]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out))
    return out


def fetch_tile(href, path):
    import rasterio
    from rasterio.errors import RasterioIOError

    def _read():
        with rasterio.open(pc.sign(href)) as src:
            a = src.read(1)
            return a, src.transform.to_gdal(), src.crs.to_wkt()

    a, gt, crs = http.with_retries(_read, retries=RETRIES, delay=RETRY_DELAY, retry_on=(RasterioIOError,))
    rows, cols = np.nonzero(a > 0)
    save_tile(path, rows, cols, a[rows, cols], gt, crs, a.shape)


def _months(date):
    a, b = date - dt.timedelta(days=WINDOW_DAYS), date + dt.timedelta(days=WINDOW_DAYS)
    y, m, out = a.year, a.month, []
    while (y, m) <= (b.year, b.month):
        out.append(f"{y}{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def run(ctx):
    cache = Path(ctx.cache_dir) / NAME
    todo = [h for h in ctx.hotspots if h.date >= START]
    out = {h.key: (0, "n/a:pre-2000-11") for h in ctx.hotspots if h.date < START}
    need = {h.key: _months(h.date) for h in todo}

    hrefs, failed_years = {}, set()
    for year in sorted({int(m[:4]) for ms in need.values() for m in ms}):
        try:
            hrefs.update(month_hrefs(year, ctx.cache_dir, ctx.bbox))
        except http.SourceDown:
            failed_years.add(year)
    months_needed = {m for ms in need.values() for m in ms}
    tile_keys = [k for k in hrefs if k.split("_")[1] in months_needed]

    failed_tiles = set()
    missing = [k for k in tile_keys if not (cache / f"{k}.npz").exists()]

    def _fetch(k):
        try:
            fetch_tile(hrefs[k], cache / f"{k}.npz")
        except Exception as e:  # SourceDown, rasterio/GDAL errors
            if isinstance(e, http.SourceDown) or type(e).__module__.startswith("rasterio"):
                return k
            raise
        return None

    if missing:
        print(f"L5: downloading {len(missing)} MCD64A1 tile-months", flush=True)
        with ThreadPoolExecutor(THREADS) as pool:
            failed_tiles = {k for k in pool.map(_fetch, missing) if k}

    tiles = {k: load_tile(cache / f"{k}.npz") for k in tile_keys if k not in failed_tiles}
    by_month = {}
    for k in tiles:
        by_month.setdefault(k.split("_")[1], []).append(k)

    xy = {}
    for crs in {t["crs"] for t in tiles.values()}:
        from pyproj import Transformer
        tr = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
        xs, ys = tr.transform(np.array([h.lon for h in todo]), np.array([h.lat for h in todo]))
        xy[crs] = {h.key: (x, y) for h, x, y in zip(todo, xs.tolist(), ys.tolist())}

    for h in todo:
        hit, unknown = False, False
        for m in need[h.key]:
            if int(m[:4]) in failed_years or any(k.split("_")[1] == m for k in failed_tiles):
                unknown = True
            jan1 = dt.date(int(m[:4]), 1, 1)
            for k in by_month.get(m, ()):
                t = tiles[k]
                x, y = xy[t["crs"]][h.key]
                gt = t["gt"]
                col, row = math.floor((x - gt[0]) / gt[1]), math.floor((y - gt[3]) / gt[5])
                if not (0 <= row < t["shape"][0] and 0 <= col < t["shape"][1]):
                    continue
                for dr in (-1, 0, 1):
                    for dc in (-1, 0, 1):
                        d = t["pix"].get((row + dr, col + dc))
                        if d and abs((jan1 + dt.timedelta(days=d - 1) - h.date).days) <= WINDOW_DAYS:
                            hit = True
                if hit:
                    break
            if hit:
                break
        if hit:
            out[h.key] = (1, "scar:mcd64(partial)")
        else:
            out[h.key] = (0, "n/a:service") if unknown else (0, "scar:none")
    return out
