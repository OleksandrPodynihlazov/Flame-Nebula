"""Live checks against the real FIRMS servers. Skipped unless explicitly enabled:

    FIRMS_LIVE=1 python3 -m unittest ingest/tests/test_live.py -v          # archive, no key (~4 MB)
    FIRMS_LIVE=1 FIRMS_MAP_KEY=... python3 -m unittest ingest/tests/test_live.py -v   # + REST API

Expected numbers are the golden references from PLAN-0900.md and research/04-italy-aoi.md.
If they ever stop matching, FIRMS changed the archive: see ingest/RUNBOOK.md.
"""

import collections
import csv
import datetime as dt
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import firms_api_fetch as api  # noqa: E402
import firms_archive_fetch as archive  # noqa: E402

LIVE = os.environ.get("FIRMS_LIVE") == "1"
ITALY_2001_MONTHLY = [3, 19, 56, 78, 85, 102, 917, 1134, 511, 245, 81, 26]  # total 3,257


def read_rows(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


@unittest.skipUnless(LIVE, "set FIRMS_LIVE=1 to hit the real FIRMS archive")
class LiveArchive(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name)
        failures = archive.run(sensor="modis", years=[2001, 2007], countries=["Italy"], out_dir=cls.out, log=lambda m: None)
        failures += archive.run(sensor="viirs-snpp", years=[2012], countries=["Italy"], out_dir=cls.out, log=lambda m: None)
        assert not failures, failures

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_italy_modis_2001_matches_acceptance_numbers(self):
        rows = read_rows(self.out / "modis_2001_Italy.csv")
        monthly = collections.Counter(int(r["acq_date"][5:7]) for r in rows)
        self.assertEqual(len(rows), 3257)
        self.assertEqual([monthly[m] for m in range(1, 13)], ITALY_2001_MONTHLY)
        self.assertEqual({r["satellite"] for r in rows}, {"Terra"})  # Aqua joins in July 2002

    def test_italy_modis_2007_record_year(self):
        self.assertEqual(len(read_rows(self.out / "modis_2007_Italy.csv")), 9134)

    def test_italy_viirs_2012_starts_on_first_viirs_day(self):
        rows = read_rows(self.out / "viirs-snpp_2012_Italy.csv")
        self.assertEqual(min(r["acq_date"] for r in rows), "2012-01-20")
        self.assertEqual({r["confidence"] for r in rows}, {"l", "n", "h"})


@unittest.skipUnless(LIVE and os.environ.get(api.KEY_ENV), "set FIRMS_LIVE=1 and FIRMS_MAP_KEY to hit the REST API")
class LiveApi(unittest.TestCase):
    def test_availability_lists_products(self):
        key = api.get_key()
        body = api.http_get(f"{api.BASE_URL}/api/data_availability/csv/{key}/ALL", key=key).decode()
        self.assertTrue(body.startswith("data_id"), body[:200])
        self.assertIn("MODIS_NRT", body)

    def test_recent_nrt_fetch_passes_validation(self):
        day = dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=3)
        with tempfile.TemporaryDirectory() as out:
            merged = api.fetch_range(key=api.get_key(), source="MODIS_NRT", bbox=api.ITALY_BBOX, start=day, end=day,
                                     out_dir=Path(out), log=lambda m: None)
            self.assertTrue(merged.exists())


if __name__ == "__main__":
    unittest.main()
