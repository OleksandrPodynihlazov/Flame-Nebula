"""Point -> region geometry over geoBoundaries CGAZ boundaries (ADM0/1/2). Pure, no DB.

Needs shapely (ingest/requirements.txt). Used by load_regions.py; design in
docs/superpowers/specs/2026-11-14-region-filter-design.md §3.

Rules:
  * ADM0: the unit containing the point; else the nearest one within `coast_km`
    (coast, offshore); else nothing.
  * Lower levels: only units whose parent is the point's deepest assignment so far,
    so the hierarchy stays consistent. Containing unit, else the nearest of them.
  * Several containing units (a point on a shared border): the smallest source_id.
"""

import json
import math
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import shape

UNNAMED = "(unnamed)"
EARTH_KM = 6371.0088
KM_PER_DEG = 111.32


@dataclass
class Region:
    source_id: str      # ADM1/2: shapeID; ADM0 (no shapeID in CGAZ): "<ISO3>-ADM0"
    level: int
    country: str        # ISO 3166-1 alpha-3 (shapeGroup)
    name: str
    geom: object
    parent: str | None = None   # source_id of the parent unit


def norm_name(name: str) -> str:
    """Search key, same rule as api/lib/names.js: NFKD, drop marks, lower-case."""
    return "".join(c for c in unicodedata.normalize("NFKD", name)
                   if not unicodedata.category(c).startswith("M")).lower()


_GROUP = re.compile(r'"shapeGroup":\s*"([^"]*)"')


def read_level(path: Path, level: int, tolerance: float = 0.001, countries=None) -> list[Region]:
    """Stream a CGAZ GeoJSON file (one feature per line) into Regions.

    `countries` (set of ISO3 codes, None = all) is checked on the start of the line, before the
    expensive JSON and geometry parsing, so a small scope reads a big file quickly."""
    out = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            s = line.strip().rstrip(",")
            if not (s.startswith("{") and '"Feature"' in s[:40]):
                continue
            if countries is not None:
                m = _GROUP.search(s, 0, 600)
                if m and m.group(1) not in countries:
                    continue
            feat = json.loads(s)
            if feat.get("type") != "Feature" or not feat.get("geometry"):
                continue
            props = feat["properties"]
            country = props["shapeGroup"]
            if countries is not None and country not in countries:
                continue
            geom = shape(feat["geometry"])
            if tolerance:
                geom = shapely.simplify(geom, tolerance, preserve_topology=True)
            out.append(Region(source_id=props.get("shapeID") or f"{country}-ADM{level}", level=level,
                              country=country, name=props.get("shapeName") or UNNAMED, geom=geom))
    return out


def read_levels(paths: dict, tolerance: float = 0.001, countries=None) -> list[Region]:
    """Read {level: path} top-down, drop copies, link parents.

    CGAZ copies a country's ADM1 units into ADM2 (same shapeID) where the country has no ADM2
    (334 units: Malta, Libya, Andorra, ...). A copy is not a lower level, so it is dropped."""
    regions, seen = [], set()
    for level in sorted(paths):
        for r in read_level(paths[level], level, tolerance, countries):
            if r.source_id not in seen:
                seen.add(r.source_id)
                regions.append(r)
    link_parents(regions)
    return regions


def outline(geom, tolerance: float = 0.01) -> str:
    """Simplified GeoJSON geometry for the map."""
    return shapely.to_geojson(shapely.simplify(geom, tolerance, preserve_topology=True))


def _by_level(regions):
    levels = {}
    for r in regions:
        levels.setdefault(r.level, []).append(r)
    return dict(sorted(levels.items()))


def _containing(units, pts):
    """{point index: unit index} for units containing points; ties -> smallest source_id.
    The tree is over the points so the (big) polygons are the prepared side."""
    if not len(pts) or not units:
        return {}
    ui, pi = shapely.STRtree(pts).query([u.geom for u in units], predicate="intersects")
    best = {}
    for u, p in zip(ui.tolist(), pi.tolist()):
        b = best.get(p)
        if b is None or units[u].source_id < units[b].source_id:
            best[p] = u
    return best


def _haversine_km(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


def _nearest_among(units, idx, pt):
    """Index (into units) of the unit nearest to pt among units[idx]; ties -> smallest source_id."""
    idx = sorted(idx, key=lambda i: units[i].source_id)
    d = shapely.distance(np.array([units[i].geom for i in idx], dtype=object), pt)
    return idx[int(np.argmin(d))]


def link_parents(regions: list[Region]) -> None:
    """Set .parent to the unit of the deepest existing level above, same country, that holds
    the child's point_on_surface (else the nearest such unit)."""
    levels = _by_level(regions)
    order = list(levels)
    for li, lvl in enumerate(order):
        children = levels[lvl]
        for c in children:
            c.parent = None
        if li == 0:
            continue
        pending = list(range(len(children)))
        for plvl in reversed(order[:li]):
            if not pending:
                break
            parents = levels[plvl]
            by_country = {}
            for i, p in enumerate(parents):
                by_country.setdefault(p.country, []).append(i)
            todo = [i for i in pending if children[i].country in by_country]
            if not todo:
                continue
            pts = shapely.point_on_surface(np.array([children[i].geom for i in todo], dtype=object))
            # containment, restricted to the same country
            ui, pi = shapely.STRtree(pts).query([p.geom for p in parents], predicate="intersects")
            best = {}
            for u, k in zip(ui.tolist(), pi.tolist()):
                if parents[u].country != children[todo[k]].country:
                    continue
                b = best.get(k)
                if b is None or parents[u].source_id < parents[b].source_id:
                    best[k] = u
            for k, i in enumerate(todo):
                u = best.get(k)
                if u is None:
                    u = _nearest_among(parents, by_country[children[i].country], pts[k])
                children[i].parent = parents[u].source_id
            done = set(todo)
            pending = [i for i in pending if i not in done]


def assign(regions: list[Region], lons, lats, coast_km: float = 25.0) -> list[tuple[int, str, str]]:
    """(point index, region source_id, how) with how 'i' (inside) or 'n' (nearest).
    At most one tuple per point per level."""
    lons = np.asarray(lons, dtype=float)
    lats = np.asarray(lats, dtype=float)
    pts = shapely.points(lons, lats)
    n = len(pts)
    current = [None] * n            # deepest assigned source_id per point
    rows = []
    for depth, units in enumerate(_by_level(regions).values()):
        if depth == 0:
            allowed = list(range(n))
            choice = _containing(units, pts)
            how = {p: "i" for p in choice}
            missing = [p for p in allowed if p not in choice]
            if missing:
                tree = shapely.STRtree([u.geom for u in units])
                max_lat = min(max(abs(lats[p]) for p in missing), 85.0)
                max_deg = coast_km / (KM_PER_DEG * math.cos(math.radians(max_lat)))
                pi, ui = tree.query_nearest(pts[missing], max_distance=max_deg, all_matches=True)
                cand = {}
                for k, u in zip(pi.tolist(), ui.tolist()):
                    cand.setdefault(missing[k], []).append(u)
                for p, us in cand.items():
                    u = _nearest_among(units, us, pts[p])
                    (x0, y0), (x1, y1) = shapely.get_coordinates(shapely.shortest_line(pts[p], units[u].geom))
                    if _haversine_km(x0, y0, x1, y1) <= coast_km:
                        choice[p], how[p] = u, "n"
        else:
            children = {}
            for i, u in enumerate(units):
                children.setdefault(u.parent, []).append(i)
            allowed = [p for p in range(n) if current[p] is not None and current[p] in children]
            if not allowed:
                continue
            sub = _containing(units, pts[allowed])
            choice, how = {}, {}
            for k, u in sub.items():
                p = allowed[k]
                if units[u].parent == current[p]:
                    choice[p], how[p] = u, "i"
            # containing units of another parent are ignored; retry within the parent only
            for p in allowed:
                if p in choice:
                    continue
                own = children[current[p]]
                inside = [u for u in own if shapely.intersects(units[u].geom, pts[p])]
                if inside:
                    choice[p], how[p] = min(inside, key=lambda u: units[u].source_id), "i"
                else:
                    choice[p], how[p] = _nearest_among(units, own, pts[p]), "n"
        for p, u in choice.items():
            rows.append((p, units[u].source_id, how[p]))
            current[p] = units[u].source_id
    rows.sort(key=lambda r: r[0])
    return rows
