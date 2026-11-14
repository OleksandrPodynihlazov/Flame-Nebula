"""Geometry core for regions: reading CGAZ files, hierarchy, point -> region assignment. No DB.

    env/bin/python -m unittest ingest/tests/test_regions_geo.py -v
"""

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import regions_geo as rg  # noqa: E402
from regions_fixture import write_fixture  # noqa: E402


class NormName(unittest.TestCase):
    def test_norm_name(self):
        # same pairs as api/test/names.test.js: Python and JS must agree
        for raw, want in [("Sicilia", "sicilia"), ("Île-de-France", "ile-de-france"),
                          ("Łódź", "łodz"), ("Valle d'Aosta", "valle d'aosta")]:
            self.assertEqual(rg.norm_name(raw), want)


class World(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        cls.paths = write_fixture(cls.tmp)
        cls.regions = rg.read_levels(cls.paths)
        cls.by_id = {r.source_id: r for r in cls.regions}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def assign_one(self, lon, lat, coast_km=25.0):
        return {(self.by_id[sid].level, sid, how) for _, sid, how in rg.assign(self.regions, [lon], [lat], coast_km)}


class ReadLevel(World):
    def test_read_level_streams_gdal_lines(self):
        adm0 = rg.read_level(self.paths[0], 0)
        self.assertEqual([r.source_id for r in adm0], ["AAA-ADM0", "EEE-ADM0", "BBB-ADM0"])
        self.assertEqual((adm0[0].level, adm0[0].country, adm0[0].name), (0, "AAA", "Aland"))
        adm2 = rg.read_level(self.paths[2], 2, tolerance=0)  # simplify may turn a 1-part Multi into Polygon
        self.assertEqual([r.source_id for r in adm2], ["A1a", "A1b", "A2"])
        self.assertEqual(adm2[1].geom.geom_type, "MultiPolygon")

    def test_read_levels_drops_lower_level_copies(self):
        ids = [r.source_id for r in self.regions]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(ids), 7)
        self.assertEqual(self.by_id["A2"].level, 1)

    def test_null_name_becomes_unnamed(self):
        self.assertEqual(self.by_id["A1b"].name, "(unnamed)")


class LinkParents(World):
    def test_link_parents(self):
        self.assertIsNone(self.by_id["AAA-ADM0"].parent)
        self.assertEqual(self.by_id["A1"].parent, "AAA-ADM0")
        self.assertEqual(self.by_id["A2"].parent, "AAA-ADM0")
        self.assertEqual(self.by_id["A1a"].parent, "A1")
        self.assertEqual(self.by_id["A1b"].parent, "A1")


class CountryScope(World):
    def test_read_level_keeps_only_requested_countries(self):
        got = rg.read_level(self.paths[0], 0, countries={"AAA", "BBB"})
        self.assertEqual([r.source_id for r in got], ["AAA-ADM0", "BBB-ADM0"])

    def test_read_levels_with_scope_keeps_the_hierarchy(self):
        regs = rg.read_levels(self.paths, countries={"AAA"})
        self.assertEqual({r.country for r in regs}, {"AAA"})
        self.assertEqual(sorted(r.source_id for r in regs), ["A1", "A1a", "A1b", "A2", "AAA-ADM0"])
        self.assertEqual({r.source_id: r.parent for r in regs}["A1a"], "A1")

    def test_filtered_out_features_are_not_parsed(self):
        # the scope check reads only the start of the line: a broken feature outside it costs nothing
        p = self.tmp / "scoped.geojson"
        good = '{ "type": "Feature", "properties": { "shapeGroup": "AAA", "shapeType": "ADM0", "shapeName": "Aland" }, ' \
               '"geometry": { "type": "Polygon", "coordinates": [[[0,0],[1,0],[1,1],[0,0]]] } },'
        broken = '{ "type": "Feature", "properties": { "shapeGroup": "ZZZ", "shapeType": "ADM0", "shapeName": "Zed" }, "geometry": { BROKEN'
        p.write_text("\n".join(['{', '"features": [', good, broken, ']', '}']) + "\n")
        self.assertEqual([r.source_id for r in rg.read_level(p, 0, countries={"AAA"})], ["AAA-ADM0"])
        with self.assertRaises(ValueError):          # without a scope the broken line is parsed (and fails)
            rg.read_level(p, 0)


class Outline(World):
    def test_outline_is_geojson_geometry(self):
        g = json.loads(rg.outline(self.by_id["AAA-ADM0"].geom))
        self.assertEqual(g["type"], "Polygon")
        self.assertEqual(len(g["coordinates"]), 2)  # the hole survives simplification


class Assign(World):
    def test_inside(self):
        self.assertEqual(self.assign_one(2, 2), {(0, "AAA-ADM0", "i"), (1, "A1", "i"), (2, "A1a", "i")})

    def test_enclave_belongs_only_to_enclave(self):
        self.assertEqual(self.assign_one(4.5, 4.5), {(0, "EEE-ADM0", "i")})

    def test_coast_nearest_within_limit(self):
        self.assertEqual(self.assign_one(-0.1, 2), {(0, "AAA-ADM0", "n"), (1, "A1", "n"), (2, "A1a", "n")})

    def test_coast_beyond_limit_unassigned(self):
        self.assertEqual(self.assign_one(-1, 5), set())

    def test_coast_limit_is_in_km(self):
        # 0.1 deg of longitude at lat 2 is ~11.1 km
        self.assertEqual(self.assign_one(-0.1, 2, coast_km=10), set())
        self.assertIn((0, "AAA-ADM0", "n"), self.assign_one(-0.1, 2, coast_km=12))

    def test_point_on_shared_border_gets_one_unit(self):
        got = self.assign_one(10, 5)
        self.assertEqual({t for t in got if t[0] == 0}, {(0, "AAA-ADM0", "i")})
        self.assertEqual(len({t[0] for t in got}), len(got))  # at most one unit per level

    def test_many_points_keep_their_index(self):
        rows = rg.assign(self.regions, [2, -1, 4.5], [2, 5, 4.5])
        self.assertEqual(sorted({i for i, _, _ in rows}), [0, 2])
        self.assertEqual({sid for i, sid, _ in rows if i == 2}, {"EEE-ADM0"})


if __name__ == "__main__":
    unittest.main()
