"""EFFIS burnt-area polygons (Copernicus EMS, >= ~30 ha, 2016+) via the public WFS, cached per 1-degree tile.

The host resets connections often, so every tile is retried; tiles that still fail are returned in `failed`
and the level marks points inside them n/a instead of 'no polygon'.
"""

import datetime as dt
import json
import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from confidence.sources import http

WFS = "https://maps.effis.emergency.copernicus.eu/effis"
TYPENAME = "ms:modis.ba.poly"
TILE_DEG = 1.0
NS = {"gml": "http://www.opengis.net/gml", "ms": "http://mapserver.gis.umn.edu/mapserver"}


@dataclass
class Poly:
    id: str
    firedate: dt.date
    finaldate: dt.date
    area_ha: float
    rings: list      # list of rings, each a list of (lat, lon)
    bbox: tuple      # (w, s, e, n)


def _date(text):
    return dt.date.fromisoformat(text.strip()[:10])


def _poly(pid, firedate, finaldate, area, rings):
    lats = [p[0] for r in rings for p in r]
    lons = [p[1] for r in rings for p in r]
    return Poly(pid, firedate, finaldate, area, rings, (min(lons), min(lats), max(lons), max(lats)))


def parse_gml(data):
    root = ET.fromstring(data)
    out = []
    for feat in root.iter(f"{{{NS['ms']}}}modis.ba.poly"):
        rings = []
        for ext in feat.iter(f"{{{NS['gml']}}}exterior"):
            for pl in ext.iter(f"{{{NS['gml']}}}posList"):
                v = [float(x) for x in pl.text.split()]
                rings.append([(v[i], v[i + 1]) for i in range(0, len(v) - 1, 2)])   # WFS 1.1.0 EPSG:4326 = lat lon
        if not rings:
            continue
        get = lambda tag: (feat.findtext(f"ms:{tag}", default="", namespaces=NS) or "").strip()
        out.append(_poly(get("id"), _date(get("FIREDATE")), _date(get("FINALDATE") or get("FIREDATE")),
                         float(get("AREA_HA") or 0), rings))
    return out


def _to_json(p):
    return {"id": p.id, "firedate": p.firedate.isoformat(), "finaldate": p.finaldate.isoformat(),
            "area_ha": p.area_ha, "rings": p.rings}


def _from_json(d):
    return _poly(d["id"], _date(d["firedate"]), _date(d["finaldate"]), d["area_ha"],
                 [[tuple(pt) for pt in r] for r in d["rings"]])


def tiles(bbox):
    w, s, e, n = bbox
    lat = math.floor(s / TILE_DEG) * TILE_DEG
    while lat < n:
        lon = math.floor(w / TILE_DEG) * TILE_DEG
        while lon < e:
            yield (lon, lat, lon + TILE_DEG, lat + TILE_DEG)
            lon += TILE_DEG
        lat += TILE_DEG


def fetch_polygons(bbox, cache_dir, only_tiles=None):
    """Returns (polygons deduplicated by id, failed tile bboxes). only_tiles limits the 1-degree tiles requested."""
    cache = Path(cache_dir) / "L6"
    cache.mkdir(parents=True, exist_ok=True)
    by_id, failed = {}, []
    for t in tiles(bbox):
        if only_tiles is not None and t not in only_tiles:
            continue
        path = cache / f"tile_{t[1]:g}_{t[0]:g}.json"
        if path.exists():
            polys = [_from_json(d) for d in json.loads(path.read_text())]
        else:
            url = (f"{WFS}?service=WFS&version=1.1.0&request=GetFeature&typename={TYPENAME}&maxfeatures=10000"
                   f"&bbox={t[1]},{t[0]},{t[3]},{t[2]},EPSG:4326")
            try:
                polys = parse_gml(http.get(url, retries=6, timeout=120))
            except http.SourceDown:
                failed.append(t)
                continue
            path.write_text(json.dumps([_to_json(p) for p in polys]))
        for p in polys:
            by_id[p.id] = p
    return list(by_id.values()), failed
