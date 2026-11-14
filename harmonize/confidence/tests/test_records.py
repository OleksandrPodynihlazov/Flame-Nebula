import datetime as dt
import tempfile
import unittest
from pathlib import Path

from confidence import records

MODIS_HEADER = ("latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,"
                "confidence,version,bright_t31,frp,daynight,type")
VIIRS_HEADER = ("latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,"
                "confidence,version,bright_ti5,frp,daynight,type")


def write_raw(root, name, header, rows):
    d = Path(root) / "raw" / "firms_archive"
    d.mkdir(parents=True, exist_ok=True)
    (d / name).write_text(header + "\n" + "\n".join(rows) + "\n")


class RecordsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_modis_row_maps(self):
        write_raw(self.root, "modis_2008_Italy.csv", MODIS_HEADER, [
            "41.4350,13.1141,315.3,1.3,1.1,2008-01-02,105,Aqua,MODIS,85,6.2,285.4,21.7,D,0",
            "41.2216,14.6053,314,1.1,1.1,2008-01-02,1156,Terra,MODIS,25,6.2,278.4,18,N,2",
            "41.0000,14.0000,314,1.1,1.1,2008-01-03,1156,Terra,MODIS,50,6.2,278.4,,N,",
        ])
        hs, _ = records.load(self.root, [2008])
        self.assertEqual(len(hs), 3)
        a, b, c = hs
        self.assertEqual(a.sensor, "MODIS")
        self.assertEqual(a.platform, "aqua")
        self.assertEqual(a.conf_level, "high")
        self.assertEqual(a.hhmm, "0105")
        self.assertEqual(a.ts, dt.datetime(2008, 1, 2, 1, 5, tzinfo=dt.timezone.utc))
        self.assertEqual(a.frp, 21.7)
        self.assertEqual(a.type, 0)
        self.assertEqual(b.platform, "terra")
        self.assertEqual(b.conf_level, "low")
        self.assertEqual(b.type, 2)
        self.assertEqual(c.conf_level, "nominal")
        self.assertIsNone(c.frp)
        self.assertIsNone(c.type)

    def test_viirs_row_maps(self):
        write_raw(self.root, "viirs-snpp_2021_Italy.csv", VIIRS_HEADER, [
            "40.51845,17.20573,307.71,0.49,0.49,2021-01-01,0120,N,VIIRS,n,2,279.44,1.99,N,2",
            "40.5,17.2,307.71,0.49,0.49,2021-01-01,1201,N,VIIRS,h,2,279.44,1.99,D,0",
            "40.4,17.1,307.71,0.49,0.49,2021-01-01,1201,N,VIIRS,l,2,279.44,1.99,D,0",
        ])
        hs, _ = records.load(self.root, [2021])
        self.assertEqual([h.conf_level for h in hs], ["nominal", "high", "low"])
        self.assertEqual({h.sensor for h in hs}, {"VIIRS"})
        self.assertEqual({h.platform for h in hs}, {"snpp"})
        self.assertEqual(hs[0].hhmm, "0120")
        self.assertEqual(hs[0].scan, 0.49)

    def test_key_uses_raw_text(self):
        write_raw(self.root, "modis_2008_Italy.csv", MODIS_HEADER, [
            "41.4350,13.1100,315.3,1.3,1.1,2008-01-02,105,Aqua,MODIS,85,6.2,285.4,21.7,D,0",
        ])
        hs, _ = records.load(self.root, [2008])
        self.assertEqual(hs[0].key, ("Aqua", "2008-01-02", "0105", "41.4350", "13.1100"))
        self.assertEqual(hs[0].lat, 41.435)

    def test_missing_year_reported(self):
        write_raw(self.root, "modis_2008_Italy.csv", MODIS_HEADER, [
            "41.4350,13.1141,315.3,1.3,1.1,2008-01-02,105,Aqua,MODIS,85,6.2,285.4,21.7,D,0",
        ])
        hs, missing = records.load(self.root, [2008, 2009, 2013])
        self.assertEqual(len(hs), 1)
        self.assertEqual(missing["MODIS"], [2009, 2013])
        self.assertEqual(missing["VIIRS"], [2013])  # 2008/2009 are before the VIIRS era, not missing

    def test_country_files_selected(self):
        write_raw(self.root, "modis_2008_Italy.csv", MODIS_HEADER, [
            "41.4350,13.1141,315.3,1.3,1.1,2008-01-02,105,Aqua,MODIS,85,6.2,285.4,21.7,D,0",
        ])
        write_raw(self.root, "modis_2008_Spain.csv", MODIS_HEADER, [
            "40.0000,-3.7000,315.3,1.3,1.1,2008-01-02,105,Aqua,MODIS,85,6.2,285.4,21.7,D,0",
            "28.6100,-17.8700,315.3,1.3,1.1,2008-01-02,106,Aqua,MODIS,85,6.2,285.4,21.7,D,0",
        ])
        hs, missing = records.load(self.root, None, country="Spain")
        self.assertEqual([h.lon for h in hs], [-3.7, -17.87])   # Canary Islands are kept
        self.assertEqual(missing["MODIS"], [])
        self.assertEqual(len(records.load(self.root, [2008])[0]), 1)   # default country stays Italy

    def test_france_clipped_to_metropolitan(self):
        write_raw(self.root, "modis_2008_France.csv", MODIS_HEADER, [
            "44.0000,5.0000,315.3,1.3,1.1,2008-01-02,105,Aqua,MODIS,85,6.2,285.4,21.7,D,0",   # Provence
            "42.2000,9.1000,315.3,1.3,1.1,2008-01-02,106,Aqua,MODIS,85,6.2,285.4,21.7,D,0",   # Corsica
            "4.9000,-52.3000,315.3,1.3,1.1,2008-01-02,107,Aqua,MODIS,85,6.2,285.4,21.7,D,0",  # French Guiana
            "-21.2000,55.7000,315.3,1.3,1.1,2008-01-02,108,Aqua,MODIS,85,6.2,285.4,21.7,D,0", # Reunion
        ])
        hs, _ = records.load(self.root, [2008], country="France")
        self.assertEqual(sorted(h.lat for h in hs), [42.2, 44.0])

    def test_bbox_from_points(self):
        write_raw(self.root, "modis_2008_Spain.csv", MODIS_HEADER, [
            "40.0000,-3.7000,315.3,1.3,1.1,2008-01-02,105,Aqua,MODIS,85,6.2,285.4,21.7,D,0",
            "28.6100,-17.8700,315.3,1.3,1.1,2008-01-02,106,Aqua,MODIS,85,6.2,285.4,21.7,D,0",
        ])
        hs, _ = records.load(self.root, [2008], country="Spain")
        self.assertEqual(records.bbox(hs, pad=0.1), (-17.97, 28.51, -3.6, 40.1))

    def test_all_years_when_none(self):
        write_raw(self.root, "modis_2008_Italy.csv", MODIS_HEADER, [
            "41.4350,13.1141,315.3,1.3,1.1,2008-01-02,105,Aqua,MODIS,85,6.2,285.4,21.7,D,0",
        ])
        write_raw(self.root, "viirs-snpp_2021_Italy.csv", VIIRS_HEADER, [
            "40.5,17.2,307.71,0.49,0.49,2021-01-01,1201,N,VIIRS,h,2,279.44,1.99,D,0",
        ])
        hs, _ = records.load(self.root, None)
        self.assertEqual(sorted(h.sensor for h in hs), ["MODIS", "VIIRS"])


if __name__ == "__main__":
    unittest.main()
