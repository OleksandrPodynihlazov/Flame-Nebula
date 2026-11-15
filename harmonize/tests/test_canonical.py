"""Canonical per-hotspot fields (research/02 §C): both sensors reduced to one form, in one place, below the API.

MODIS confidence is a number 0-100, VIIRS a class l/n/h. The view gives every row the same
`confidence_level` (low/nominal/high) and keeps the raw MODIS number as `confidence_pct`.
Satellite spellings (archive Terra/Aqua/N, API T/A/N20/N21) become one `platform` enum.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import canonical  # noqa: E402
from pgfixture import PG, REPO, docker_ok  # noqa: E402

setUpModule, tearDownModule = PG.start, PG.stop


class InitOrder(unittest.TestCase):
    def test_view_file_runs_after_the_table(self):
        files = sorted(p.name for p in (REPO / "db" / "init").glob("*.sql"))
        self.assertLess(files.index("hotspots-init.sql"), files.index(canonical.SQL.name))


@unittest.skipUnless(docker_ok(), "docker not available")
class Canonical(unittest.TestCase):
    def setUp(self):
        PG.reset()

    def rows(self):
        out = PG.sql("SELECT confidence, satellite, confidence_level, confidence_pct, platform "
                     "FROM hotspots_canonical ORDER BY acq_time")
        return [r.split("|") for r in out.splitlines()]

    def test_modis_number_is_binned_and_kept(self):
        PG.insert_hotspots([dict(confidence=c, acq_time=i) for i, c in enumerate(["29", "30", "79", "80", "100", "0"])])
        canonical.build(PG.psql())
        got = [(r[2], r[3]) for r in self.rows()]
        self.assertEqual(got, [("low", "29"), ("nominal", "30"), ("nominal", "79"), ("high", "80"),
                               ("high", "100"), ("low", "0")])

    def test_viirs_class_is_spelled_out_and_has_no_percent(self):
        PG.insert_hotspots([dict(confidence=c, satellite="N", instrument="VIIRS", acq_time=i)
                            for i, c in enumerate(["l", "n", "h"])])
        canonical.build(PG.psql())
        self.assertEqual([(r[2], r[3]) for r in self.rows()], [("low", ""), ("nominal", ""), ("high", "")])

    def test_missing_confidence_stays_null(self):
        PG.insert_hotspots([dict(confidence=None)])
        canonical.build(PG.psql())
        self.assertEqual(self.rows()[0][2:4], ["", ""])

    def test_platform_from_every_spelling(self):
        sats = ["Terra", "Aqua", "N", "N20", "N21", "T", "A"]
        PG.insert_hotspots([dict(satellite=s, acq_time=i) for i, s in enumerate(sats)])
        canonical.build(PG.psql())
        self.assertEqual([r[4] for r in self.rows()], ["terra", "aqua", "snpp", "noaa20", "noaa21", "terra", "aqua"])

    def test_rebuild_is_safe(self):
        PG.insert_hotspots([dict(confidence="85")])
        canonical.build(PG.psql())
        canonical.build(PG.psql())
        self.assertEqual(self.rows()[0][2], "high")


if __name__ == "__main__":
    unittest.main()
