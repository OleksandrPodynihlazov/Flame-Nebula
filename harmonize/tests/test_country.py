"""Country of every hotspot: archive file name first, then an existing level-0 region, then geometry."""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ingest" / "tests"))
import country  # noqa: E402
from pgfixture import PG, docker_ok  # noqa: E402

try:
    import shapely  # noqa: F401
    HAVE_SHAPELY = True
except ImportError:
    HAVE_SHAPELY = False

setUpModule, tearDownModule = PG.start, PG.stop

HEADER = ("latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,"
          "version,bright_t31,frp,daynight,type")


def archive_line(lat, lon, date="2008-08-01", time="0105", sat="Aqua"):
    return f"{lat},{lon},310.1,1.0,1.0,{date},{time},{sat},MODIS,80,6.03,290.0,12.5,D,0"


@unittest.skipUnless(docker_ok(), "docker not available")
class CountryTest(unittest.TestCase):
    def setUp(self):
        PG.reset()
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        country.ensure_table(PG.psql())

    def tearDown(self):
        self.tmp.cleanup()

    def archive(self, name, lines):
        p = self.dir / name
        p.write_text(HEADER + "\n" + "\n".join(lines) + "\n")
        return p

    def countries(self):
        return PG.sql("SELECT h.latitude || ':' || coalesce(c.country, '-') || ':' || c.how "
                      "FROM hotspot_country c JOIN hotspots h ON h.id = c.hotspot_id ORDER BY h.latitude")


class FromFiles(CountryTest):
    def test_archive_file_name_gives_the_country(self):
        PG.insert_hotspots([dict(latitude=41.5, longitude=12.5, acq_date="2008-08-01", acq_time=105)])
        n, skipped = country.from_files(PG.psql(), [self.archive("modis_2008_Italy.csv", [archive_line(41.5, 12.5)])])
        self.assertEqual((n, skipped), (1, []))
        self.assertEqual(self.countries(), "41.5:ITA:f")

    def test_viirs_and_multi_word_names_are_mapped(self):
        PG.insert_hotspots([dict(latitude=43.85, longitude=18.4, satellite="N", instrument="VIIRS",
                                 acq_date="2015-07-01", acq_time=1230)])
        f = self.archive("viirs-snpp_2015_Bosnia_and_Herzegovina.csv",
                         [archive_line(43.85, 18.4, "2015-07-01", "1230", "N")])
        country.from_files(PG.psql(), [f])
        self.assertEqual(self.countries(), "43.85:BIH:f")

    def test_unknown_country_name_is_skipped_and_reported(self):
        PG.insert_hotspots([dict(latitude=41.5, longitude=12.5, acq_date="2008-08-01", acq_time=105)])
        f = self.archive("modis_2008_Atlantis.csv", [archive_line(41.5, 12.5)])
        self.assertEqual(country.from_files(PG.psql(), [f]), (0, [f.name]))
        self.assertEqual(self.countries(), "")

    def test_point_in_two_files_keeps_the_first_country(self):
        PG.insert_hotspots([dict(latitude=45.9, longitude=6.9, acq_date="2008-08-01", acq_time=105)])
        a = self.archive("modis_2008_France.csv", [archive_line(45.9, 6.9)])
        b = self.archive("modis_2008_Italy.csv", [archive_line(45.9, 6.9)])
        country.from_files(PG.psql(), [a, b])
        self.assertEqual(self.countries(), "45.9:FRA:f")

    def test_rerun_adds_nothing(self):
        PG.insert_hotspots([dict(latitude=41.5, longitude=12.5, acq_date="2008-08-01", acq_time=105)])
        f = self.archive("modis_2008_Italy.csv", [archive_line(41.5, 12.5)])
        country.from_files(PG.psql(), [f])
        self.assertEqual(country.from_files(PG.psql(), [f])[0], 0)
        self.assertEqual(PG.sql("SELECT count(*) FROM hotspot_country"), "1")

    def test_only_the_exact_detection_is_marked(self):
        PG.insert_hotspots([dict(latitude=41.5, longitude=12.5, acq_date="2008-08-01", acq_time=105),
                            dict(latitude=41.5, longitude=12.5, acq_date="2008-08-01", acq_time=1250)])
        n, _ = country.from_files(PG.psql(), [self.archive("modis_2008_Italy.csv", [archive_line(41.5, 12.5)])])
        self.assertEqual(n, 1)

    def test_rows_not_in_the_db_are_ignored(self):
        n, _ = country.from_files(PG.psql(), [self.archive("modis_2008_Italy.csv", [archive_line(41.5, 12.5)])])
        self.assertEqual(n, 0)


class FromRegions(CountryTest):
    def test_level0_region_is_copied(self):
        PG.insert_hotspots([dict(latitude=41.5, longitude=12.5)])
        PG.sql("CREATE TABLE regions (id int PRIMARY KEY, level smallint, country char(3));"
               "CREATE TABLE hotspot_regions (region_id int, hotspot_id bigint, how char(1));"
               "INSERT INTO regions VALUES (1, 0, 'ITA'), (2, 2, 'ITA');"
               "INSERT INTO hotspot_regions SELECT r, id, 'i' FROM hotspots, (VALUES (1), (2)) v(r);")
        self.assertEqual(country.from_regions(PG.psql()), 1)
        self.assertEqual(self.countries(), "41.5:ITA:r")

    def test_without_region_tables_nothing_happens(self):
        PG.insert_hotspots([dict(latitude=41.5, longitude=12.5)])
        self.assertEqual(country.from_regions(PG.psql()), 0)

    def test_file_country_is_never_overwritten(self):
        PG.insert_hotspots([dict(latitude=45.9, longitude=6.9, acq_date="2008-08-01", acq_time=105)])
        country.from_files(PG.psql(), [self.archive("modis_2008_France.csv", [archive_line(45.9, 6.9)])])
        PG.sql("CREATE TABLE regions (id int PRIMARY KEY, level smallint, country char(3));"
               "CREATE TABLE hotspot_regions (region_id int, hotspot_id bigint, how char(1));"
               "INSERT INTO regions VALUES (1, 0, 'ITA');"
               "INSERT INTO hotspot_regions SELECT 1, id, 'i' FROM hotspots;")
        country.from_regions(PG.psql())
        self.assertEqual(self.countries(), "45.9:FRA:f")


@unittest.skipUnless(HAVE_SHAPELY, "shapely not installed (use env/bin/python)")
class FromGeometry(CountryTest):
    def setUp(self):
        super().setUp()
        import regions_fixture
        self.adm0 = regions_fixture.write_fixture(self.dir)[0]

    def test_points_get_their_country_and_far_points_are_marked_checked(self):
        PG.insert_hotspots([dict(latitude=2.0, longitude=2.0, satellite="N20", instrument="VIIRS"),
                            dict(latitude=3.0, longitude=15.0, satellite="N20", instrument="VIIRS"),
                            dict(latitude=50.0, longitude=50.0, satellite="N20", instrument="VIIRS")])
        self.assertEqual(country.from_geometry(PG.psql(), self.adm0, countries=None, chunk=2), 3)
        self.assertEqual(self.countries(), "2:AAA:g\n3:BBB:g\n50:-:g")

    def test_scope_limits_the_countries(self):
        PG.insert_hotspots([dict(latitude=3.0, longitude=15.0, satellite="N20", instrument="VIIRS")])
        country.from_geometry(PG.psql(), self.adm0, countries={"AAA"}, chunk=10)
        self.assertEqual(self.countries(), "3:-:g")

    def test_only_points_without_a_country_are_processed(self):
        PG.insert_hotspots([dict(latitude=2.0, longitude=2.0, acq_date="2008-08-01", acq_time=105)])
        country.from_files(PG.psql(), [self.archive("modis_2008_France.csv", [archive_line(2.0, 2.0)])])
        self.assertEqual(country.from_geometry(PG.psql(), self.adm0, countries=None, chunk=10), 0)
        self.assertEqual(self.countries(), "2:FRA:f")


class Stale(CountryTest):
    def test_rebuilt_hotspots_table_clears_stale_countries(self):
        PG.insert_hotspots([dict(latitude=41.5, longitude=12.5, acq_date="2008-08-01", acq_time=105)])
        country.from_files(PG.psql(), [self.archive("modis_2008_Italy.csv", [archive_line(41.5, 12.5)])])
        PG.sql("DROP TABLE hotspots CASCADE")
        PG.reset_hotspots_only()
        country.ensure_table(PG.psql())
        self.assertEqual(PG.sql("SELECT count(*) FROM hotspot_country"), "0")


if __name__ == "__main__":
    unittest.main()
