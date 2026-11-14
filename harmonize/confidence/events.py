"""Group hotspots into fire events: connected components of detections within max_km and max_days.

Clustering runs separately per sensor family (MODIS, VIIRS), so cross-sensor agreement stays an independent level (L3).
"""

import datetime as dt
import math
from collections import defaultdict
from dataclasses import dataclass, field

from confidence import config

CELL_DEG = 0.02
EARTH_KM = 6371.0


@dataclass
class Event:
    id: str
    family: str
    start: dt.date
    end: dt.date
    n: int
    frp_sum: float
    lat: float
    lon: float
    bbox: tuple          # (w, s, e, n)
    platforms: set = field(default_factory=set)
    members: list = field(default_factory=list)


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


class _UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))

    def find(self, i):
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[max(ra, rb)] = min(ra, rb)


def _cell(lat, lon):
    return (math.floor(lat / CELL_DEG), math.floor(lon / CELL_DEG))


def _components(points, max_km, max_days):
    """points: list of Hotspot of one family. Returns a root index per point."""
    uf = _UnionFind(len(points))
    d_lat = math.ceil(max_km / 111.0 / CELL_DEG)
    d_lon = math.ceil(max_km / (111.0 * math.cos(math.radians(60))) / CELL_DEG)
    buckets = defaultdict(list)  # (ordinal day, cell) -> indices
    for i, p in enumerate(points):
        buckets[(p.date.toordinal(), _cell(p.lat, p.lon))].append(i)
    for (day, (cy, cx)), idxs in buckets.items():
        for dday in range(0, max_days + 1):
            for dy in range(-d_lat, d_lat + 1):
                for dx in range(-d_lon, d_lon + 1):
                    other = buckets.get((day - dday, (cy + dy, cx + dx)))
                    if not other:
                        continue
                    for i in idxs:
                        pi = points[i]
                        for j in other:
                            if j == i:
                                continue
                            pj = points[j]
                            if haversine_km(pi.lat, pi.lon, pj.lat, pj.lon) <= max_km:
                                uf.union(i, j)
    return [uf.find(i) for i in range(len(points))]


def cluster(hotspots, max_km=config.EVENT_MAX_KM, max_days=config.EVENT_MAX_DAYS):
    """Map hotspot key -> event id '{family}-{yyyymmdd of first detection}-{n}'."""
    event_of = {}
    for family in ("MODIS", "VIIRS"):
        points = [h for h in hotspots if h.sensor == family]
        roots = _components(points, max_km, max_days)
        groups = defaultdict(list)
        for p, r in zip(points, roots):
            groups[r].append(p)
        per_day = defaultdict(int)
        for members in sorted(groups.values(), key=lambda m: (min(p.date for p in m), min(p.key for p in m))):
            start = min(p.date for p in members)
            per_day[start] += 1
            eid = f"{family}-{start:%Y%m%d}-{per_day[start]}"
            for p in members:
                event_of[p.key] = eid
    return event_of


def summarize(hotspots, event_of):
    groups = defaultdict(list)
    for h in hotspots:
        if h.key in event_of:
            groups[event_of[h.key]].append(h)
    out = {}
    for eid, m in groups.items():
        lats, lons = [h.lat for h in m], [h.lon for h in m]
        out[eid] = Event(
            id=eid, family=m[0].sensor, start=min(h.date for h in m), end=max(h.date for h in m), n=len(m),
            frp_sum=sum(h.frp for h in m if h.frp is not None),
            lat=sum(lats) / len(m), lon=sum(lons) / len(m),
            bbox=(min(lons), min(lats), max(lons), max(lats)),
            platforms={h.platform for h in m}, members=[h.key for h in m],
        )
    return out
