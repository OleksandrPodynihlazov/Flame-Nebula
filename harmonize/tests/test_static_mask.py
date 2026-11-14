"""Static-source mask (decision I6, research/03 §3, 07 §8.3): one spatial mask built from S-NPP,
applied to every satellite, independent of the product `type` field (which breaks at 2018)."""

import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import static_mask as sm  # noqa: E402
from pgfixture import PG, docker_ok  # noqa: E402

setUpModule, tearDownModule = PG.start, PG.stop


def persistent(lat, lon, years, days=16, satellite="N", type_=2, rows_per_day=1):
    """Detections on `days` distinct days in each of `years` at one point."""
    out = []
    for y in years:
        for d in range(days):
            for _ in range(rows_per_day):
                out.append(dict(latitude=lat, longitude=lon, satellite=satellite,
                                instrument="VIIRS" if satellite == "N" else "MODIS", type=type_,
                                acq_date=(dt.date(y, 1, 1) + dt.timedelta(days=d * 7)).isoformat()))
    return out


@unittest.skipUnless(docker_ok(), "docker not available")
class Mask(unittest.TestCase):
    def setUp(self):
        PG.reset()

    def cells(self):
        return {tuple(map(str, r.split("|")[:2])): r.split("|")[2:]
                for r in PG.sql("SELECT cell_lat, cell_lon, category, core FROM static_mask").splitlines()}

    def build(self):
        sm.build(PG.psql())

    def test_persistent_cell_is_masked_with_its_neighbours(self):
        PG.insert_hotspots(persistent(41.005, 12.005, [2013, 2014, 2015]))
        self.build()
        c = self.cells()
        self.assertEqual(c[("4100", "1200")], ["static", "t"])
        self.assertEqual(c[("4101", "1201")], ["static", "f"])   # dilation: MODIS pixel centres jitter ~1 km
        self.assertEqual(c[("4099", "1199")], ["static", "f"])
        self.assertNotIn(("4102", "1200"), c)

    def test_two_years_are_not_enough(self):
        PG.insert_hotspots(persistent(41.005, 12.005, [2013, 2014]))
        self.build()
        self.assertEqual(self.cells(), {})

    def test_fifteen_days_a_year_are_not_enough(self):
        PG.insert_hotspots(persistent(41.005, 12.005, [2013, 2014, 2015], days=15))
        self.build()
        self.assertEqual(self.cells(), {})

    def test_days_not_rows_are_counted(self):
        PG.insert_hotspots(persistent(41.005, 12.005, [2013, 2014, 2015], days=1, rows_per_day=20))
        self.build()
        self.assertEqual(self.cells(), {})

    def test_volcano_cells_get_their_own_category(self):
        PG.insert_hotspots(persistent(37.75, 15.0, [2013, 2014, 2015], type_=1))
        self.build()
        self.assertEqual(self.cells()[("3775", "1500")], ["volcano", "t"])

    def test_only_the_source_satellite_builds_the_mask(self):
        PG.insert_hotspots(persistent(41.005, 12.005, [2013, 2014, 2015], satellite="Terra"))
        self.build()
        self.assertEqual(self.cells(), {})

    def test_rebuild_replaces_instead_of_duplicating(self):
        PG.insert_hotspots(persistent(41.005, 12.005, [2013, 2014, 2015]))
        self.build()
        self.build()
        self.assertEqual(PG.sql("SELECT count(*) FROM static_mask"), "9")

    def test_hotspots_are_not_modified(self):
        PG.insert_hotspots(persistent(41.005, 12.005, [2013, 2014, 2015]))
        self.build()
        self.assertEqual(PG.sql("SELECT count(*) FROM hotspots"), str(16 * 3))


@unittest.skipUnless(docker_ok(), "docker not available")
class FlaggedView(unittest.TestCase):
    def setUp(self):
        PG.reset()
        PG.insert_hotspots(persistent(41.005, 12.005, [2013, 2014, 2015]))
        PG.insert_hotspots([
            dict(latitude=41.0155, longitude=12.0155, satellite="Aqua", acq_date="2005-07-01"),   # neighbour cell
            dict(latitude=43.5, longitude=11.5, satellite="Aqua", acq_date="2005-07-01"),         # open country
            dict(latitude=40.0, longitude=13.0, satellite="Aqua", acq_date="2005-07-01", type=3),  # offshore
        ])
        sm.build(PG.psql())

    def flag(self, lat):
        return PG.sql(f"SELECT coalesce(mask_category,'-'), is_burning FROM hotspots_flagged "
                      f"WHERE satellite='Aqua' AND latitude={lat}")

    def test_modis_point_next_to_a_static_source_is_not_burning(self):
        self.assertEqual(self.flag(41.0155), "static|f")

    def test_ordinary_point_is_burning(self):
        self.assertEqual(self.flag(43.5), "-|t")

    def test_offshore_point_is_not_burning(self):
        self.assertEqual(self.flag(40.0), "-|f")

    def test_view_has_one_row_per_hotspot(self):
        self.assertEqual(PG.sql("SELECT count(*) FROM hotspots_flagged"), PG.sql("SELECT count(*) FROM hotspots"))


if __name__ == "__main__":
    unittest.main()
