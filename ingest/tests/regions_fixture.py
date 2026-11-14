"""Tiny synthetic world for region tests, written in the geoBoundaries CGAZ file layout.

    AAA  0..10 x 0..10, with a hole 4..5 x 4..5     EEE  4..5 x 4..5 (enclave in the hole)
    BBB 10..20 x 0..10                               A1   0..5 x 0..10 (ADM1 of AAA, no hole)
    A2   5..10 x 0..10 (ADM1 of AAA)                 A1a  0..5 x 0..5, A1b 0..5 x 5..10 (ADM2 of A1)

Coordinates are degrees, [lon, lat].
"""

import json
from pathlib import Path


def box(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]


# level -> list of (properties, geometry). ADM0 has no shapeID, as in the real CGAZ files.
FEATURES = {
    0: [
        ({"shapeGroup": "AAA", "shapeType": "ADM0", "shapeName": "Aland"},
         {"type": "Polygon", "coordinates": [box(0, 0, 10, 10), box(4, 4, 5, 5)]}),
        ({"shapeGroup": "EEE", "shapeType": "ADM0", "shapeName": "Enclavia"},
         {"type": "Polygon", "coordinates": [box(4, 4, 5, 5)]}),
        ({"shapeGroup": "BBB", "shapeType": "ADM0", "shapeName": "Bland"},
         {"type": "Polygon", "coordinates": [box(10, 0, 20, 10)]}),
    ],
    1: [
        ({"shapeName": "A One", "shapeID": "A1", "shapeGroup": "AAA", "shapeType": "ADM1"},
         {"type": "Polygon", "coordinates": [box(0, 0, 5, 10)]}),
        ({"shapeName": "A Two", "shapeID": "A2", "shapeGroup": "AAA", "shapeType": "ADM1"},
         {"type": "Polygon", "coordinates": [box(5, 0, 10, 10)]}),
    ],
    2: [
        ({"shapeName": "A One South", "shapeID": "A1a", "shapeGroup": "AAA", "shapeType": "ADM2"},
         {"type": "Polygon", "coordinates": [box(0, 0, 5, 5)]}),
        ({"shapeName": None, "shapeID": "A1b", "shapeGroup": "AAA", "shapeType": "ADM2"},
         {"type": "MultiPolygon", "coordinates": [[box(0, 5, 5, 10)]]}),
        # CGAZ copies an ADM1 unit into ADM2 (same shapeID) where a country has no ADM2
        ({"shapeName": "A Two", "shapeID": "A2", "shapeGroup": "AAA", "shapeType": "ADM2"},
         {"type": "Polygon", "coordinates": [box(5, 0, 10, 10)]}),
    ],
}


def gdal_geojson(features):
    """Same line layout as the CGAZ files: header lines, one feature per line, footer."""
    lines = ['{', '"type": "FeatureCollection",',
             '"crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" } },',
             '"features": [']
    feats = [json.dumps({"type": "Feature", "properties": p, "geometry": g}) for p, g in features]
    lines += [f + ("," if i < len(feats) - 1 else "") for i, f in enumerate(feats)]
    lines += [']', '}']
    return "\n".join(lines) + "\n"


def write_fixture(directory):
    """Write geoBoundariesCGAZ_ADM{0,1,2}.geojson into directory; return {level: path}."""
    directory = Path(directory)
    paths = {}
    for level, feats in FEATURES.items():
        p = directory / f"geoBoundariesCGAZ_ADM{level}.geojson"
        p.write_text(gdal_geojson(feats))
        paths[level] = p
    return paths
