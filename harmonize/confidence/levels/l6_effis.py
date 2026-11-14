"""L6: the hotspot lies in (or within 1 km of) an EFFIS burnt-area polygon whose dates match (+/-2 days).

EFFIS polygons are mapped from MODIS 250 m / Sentinel-2 reflectance (burn scar), a different signal from the
thermal hotspot. The public WFS serves 2016 onward; earlier rows are n/a.
"""

import datetime as dt
import math
from collections import defaultdict

from confidence import config
from confidence.sources import effis

NAME = "L6"
START = dt.date(2016, 1, 1)
SLACK_DAYS = 2
BUFFER_KM = 1.0
GRID = 0.1


def _inside(lat, lon, ring):
    inside = False
    n = len(ring)
    for i in range(n):
        y1, x1 = ring[i]
        y2, x2 = ring[(i + 1) % n]
        if (y1 > lat) != (y2 > lat):
            x = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if x > lon:
                inside = not inside
    return inside


def _dist_km(lat, lon, ring):
    kx = 111.32 * math.cos(math.radians(lat))
    ky = 110.57
    px, py = lon * kx, lat * ky
    best = float("inf")
    for i in range(len(ring) - 1):
        ay, ax = ring[i][0] * ky, ring[i][1] * kx
        by, bx = ring[i + 1][0] * ky, ring[i + 1][1] * kx
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
        best = min(best, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
    return best


def _cells(bbox, pad):
    w, s, e, n = bbox
    for gy in range(math.floor((s - pad) / GRID), math.floor((n + pad) / GRID) + 1):
        for gx in range(math.floor((w - pad) / GRID), math.floor((e + pad) / GRID) + 1):
            yield (gy, gx)


def run(ctx):
    out, todo = {}, []
    for h in ctx.hotspots:
        if h.date < START:
            out[h.key] = (0, "n/a:effis-2016+")
        else:
            todo.append(h)
    if not todo:
        return out
    td = effis.TILE_DEG
    need = {(math.floor(h.lon / td) * td, math.floor(h.lat / td) * td,
             math.floor(h.lon / td) * td + td, math.floor(h.lat / td) * td + td) for h in todo}
    polys, failed = effis.fetch_polygons(ctx.bbox, ctx.cache_dir, only_tiles=need)
    index = defaultdict(list)
    pad = BUFFER_KM / 80.0   # degrees, generous at Italian latitudes
    for p in polys:
        for c in _cells(p.bbox, pad):
            index[c].append(p)
    slack = dt.timedelta(days=SLACK_DAYS)
    for h in todo:
        match = None
        for p in index.get((math.floor(h.lat / GRID), math.floor(h.lon / GRID)), ()):
            if not (p.firedate - slack <= h.date <= p.finaldate + slack):
                continue
            if any(_inside(h.lat, h.lon, r) or _dist_km(h.lat, h.lon, r) <= BUFFER_KM for r in p.rings):
                match = p
                break
        if match:
            out[h.key] = (1, f"effis:{match.id}:{match.area_ha:g}ha")
        elif any(w <= h.lon < e and s <= h.lat < n for w, s, e, n in failed):
            out[h.key] = (0, "n/a:service")
        else:
            out[h.key] = (0, "effis:none")
    return out
