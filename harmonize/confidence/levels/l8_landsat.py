"""L8: 30 m burn scar from Landsat Collection 2 Level 2 (Planetary Computer): dNBR = NBR_pre - NBR_post.

Runs on the top L8_TOP_N events by sum FRP per year (L7 years + --years), skipping events that L1 calls
non-fire. Pre scene: least cloudy within 60 days before the event; post scene: within 60 days after.
NBR = (NIR - SWIR2) / (NIR + SWIR2) on surface reflectance (DN * 0.0000275 - 0.2), QA bits 0,1,3,4 masked.
Mean dNBR within 500 m of the event's hotspots >= 0.10 supports (low-severity threshold, Key & Benson 2006).
Fully independent of active-fire data. Results are cached per event.
"""

import datetime as dt
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np

from confidence import config
from confidence.levels import l1_nonfire
from confidence.sources import http, pc

NAME = "L8"
COLLECTION = "landsat-c2-l2"
WINDOW_DAYS = 60
MAX_CLOUD = 40
RADIUS_M = 500
DNBR_MIN = 0.10
QA_MASK = 0b11011   # fill, dilated cloud, cloud, cloud shadow
PAD_DEG = 0.01


def valid(qa):
    return (np.asarray(qa).astype(np.uint16) & QA_MASK) == 0


def nbr(nir_dn, swir_dn, qa):
    nir = np.asarray(nir_dn, np.float64) * 0.0000275 - 0.2
    swir = np.asarray(swir_dn, np.float64) * 0.0000275 - 0.2
    ok = valid(qa) & (np.asarray(nir_dn) > 0) & (np.asarray(swir_dn) > 0) & ((nir + swir) > 0)
    out = np.full(nir.shape, np.nan, np.float32)
    out[ok] = ((nir - swir) / (nir + swir))[ok]
    return out


def find_scene(bbox, start, end):
    items = pc.search(COLLECTION, bbox, f"{start.isoformat()}/{end.isoformat()}",
                      query={"eo:cloud_cover": {"lt": MAX_CLOUD}})
    items = [i for i in items if all(k in i["assets"] for k in ("nir08", "swir22", "qa_pixel"))]
    return min(items, key=lambda i: i["properties"].get("eo:cloud_cover", 100)) if items else None


def read_nbr(item, bbox):
    import rasterio
    from rasterio.errors import RasterioIOError
    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds

    def _read():
        bands, gt, crs = {}, None, None
        for key in ("nir08", "swir22", "qa_pixel"):
            with rasterio.open(pc.sign(item["assets"][key]["href"])) as src:
                win = from_bounds(*transform_bounds("EPSG:4326", src.crs, *bbox), src.transform)
                win = win.round_offsets().round_lengths()
                bands[key] = src.read(1, window=win, boundless=True, fill_value=0)
                gt, crs = src.window_transform(win).to_gdal(), src.crs.to_wkt()
        return bands, gt, crs

    bands, gt, crs = http.with_retries(_read, retries=5, delay=2.0, retry_on=(RasterioIOError,))
    return nbr(bands["nir08"], bands["swir22"], bands["qa_pixel"]), gt, crs


def mean_near(arr, gt, crs, lat, lon, radius_m=RADIUS_M):
    from pyproj import CRS, Transformer
    c = CRS.from_user_input(crs)
    x, y = Transformer.from_crs("EPSG:4326", c, always_xy=True).transform(lon, lat)
    r = radius_m / 111320.0 if c.is_geographic else radius_m
    col, row = (x - gt[0]) / gt[1], (y - gt[3]) / gt[5]
    rp = r / abs(gt[1])
    r0, r1 = max(0, math.floor(row - rp)), min(arr.shape[0], math.ceil(row + rp) + 1)
    c0, c1 = max(0, math.floor(col - rp)), min(arr.shape[1], math.ceil(col + rp) + 1)
    if r0 >= r1 or c0 >= c1:
        return float("nan")
    rr, cc = np.mgrid[r0:r1, c0:c1]
    sub = arr[r0:r1, c0:c1][(rr + 0.5 - row) ** 2 + (cc + 0.5 - col) ** 2 <= rp ** 2]
    sub = sub[np.isfinite(sub)]
    return float(sub.mean()) if sub.size else float("nan")


def _event_dnbr(ev, members):
    w, s, e, n = ev.bbox
    bbox = (w - PAD_DEG, s - PAD_DEG, e + PAD_DEG, n + PAD_DEG)
    pre = find_scene(bbox, ev.start - dt.timedelta(days=WINDOW_DAYS), ev.start - dt.timedelta(days=1))
    post = find_scene(bbox, ev.end + dt.timedelta(days=1), ev.end + dt.timedelta(days=WINDOW_DAYS))
    if not pre or not post:
        return None, "n/a:no-clear-scene"
    (a, ga, ca), (b, gb, cb) = read_nbr(pre, bbox), read_nbr(post, bbox)
    vals = []
    for h in members:
        d = mean_near(a, ga, ca, h.lat, h.lon) - mean_near(b, gb, cb, h.lat, h.lon)
        if math.isfinite(d):
            vals.append(d)
    if not vals:
        return None, "n/a:no-clear-pixels"
    d = sum(vals) / len(vals)
    return round(d, 2), f"dnbr:{d:.2f}"


def run(ctx):
    years = set(config.L7_YEARS) | set(ctx.years or ())
    l1 = l1_nonfire.run(ctx)
    members = defaultdict(list)
    for h in ctx.hotspots:
        members[ctx.event_of.get(h.key)].append(h)

    status, per_year = {}, defaultdict(list)
    for eid, ev in ctx.events.items():
        m = members.get(eid, [])
        if ev.start.year not in years:
            status[eid] = (0, "n/a:not-in-l7-years")
        elif sum(l1[h.key][0] < 0 for h in m) * 2 > len(m):
            status[eid] = (0, "n/a:non-fire-event")
        else:
            per_year[ev.start.year].append(ev)
    for year, evs in per_year.items():
        evs.sort(key=lambda e: -e.frp_sum)
        for ev in evs[config.L8_TOP_N:]:
            status[ev.id] = (0, "n/a:not-top-event")
        for ev in evs[:config.L8_TOP_N]:
            path = Path(ctx.cache_dir) / NAME / f"{ev.id}.json"
            if path.exists():
                cached = json.loads(path.read_text())
                d, reason = cached["dnbr"], cached["reason"]
            else:
                try:
                    d, reason = _event_dnbr(ev, members[ev.id])
                except http.SourceDown:
                    status[ev.id] = (0, "n/a:service")
                    continue
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps({"dnbr": d, "reason": reason}))
            if d is not None:
                ctx.event_signals.setdefault(ev.id, {})["l8_dnbr"] = d
            status[ev.id] = (1 if d is not None and d >= DNBR_MIN else 0, reason)
    return {h.key: status.get(ctx.event_of.get(h.key), (0, "n/a:no-event")) for h in ctx.hotspots}
