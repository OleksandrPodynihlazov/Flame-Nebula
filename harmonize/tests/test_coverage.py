"""Coverage table: one row per satellite x day, ok / partial / missing (decision I4, research/07 §6).

    python3 -m unittest discover -s harmonize/tests -v
"""

import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import coverage_table as cov  # noqa: E402
from pgfixture import PG, docker_ok  # noqa: E402

D = dt.date
setUpModule, tearDownModule = PG.start, PG.stop


def status_map(rows):
    return {(r[0], r[1]): r[2] for r in rows}


class Build(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = status_map(cov.build(until=D(2025, 12, 31)))

    def test_dense_one_row_per_operating_day(self):
        terra_nov_2000 = [k for k in self.rows if k[0] == "Terra" and k[1] < D(2000, 12, 1)]
        self.assertEqual(len(terra_nov_2000), 30)

    def test_nothing_before_a_platform_starts(self):
        self.assertNotIn(("N", D(2012, 1, 19)), self.rows)
        self.assertIn(("N", D(2012, 1, 20)), self.rows)
        self.assertNotIn(("Aqua", D(2002, 7, 3)), self.rows)
        self.assertNotIn(("Terra", D(2000, 10, 31)), self.rows)

    def test_nothing_after_until(self):
        self.assertFalse([k for k in self.rows if k[1] > D(2025, 12, 31)])

    def test_platform_end_is_respected(self):
        late = status_map(cov.build(until=D(2026, 12, 31)))
        self.assertIn(("N", D(2026, 11, 1)), late)
        self.assertNotIn(("N", D(2026, 11, 3)), late)

    def test_known_gaps(self):
        r = self.rows
        self.assertEqual(r[("Terra", D(2001, 6, 20))], "missing")     # FIRMS Readme, bounds from Italy data
        self.assertEqual(r[("Terra", D(2001, 7, 4))], "ok")
        self.assertEqual(r[("N", D(2022, 8, 1))], "missing")          # S-NPP safe mode 2022
        self.assertEqual(r[("N", D(2022, 8, 15))], "partial")
        self.assertEqual(r[("Aqua", D(2020, 8, 20))], "partial")      # Aqua FMU outage
        self.assertEqual(r[("Terra", D(2020, 8, 20))], "ok")          # only Aqua was affected
        self.assertEqual(r[("N", D(2015, 7, 1))], "ok")

    def test_missing_beats_partial_when_gaps_overlap(self):
        gaps = [cov.Gap(("Terra",), D(2001, 1, 1), D(2001, 1, 10), "partial", "a"),
                cov.Gap(("Terra",), D(2001, 1, 5), D(2001, 1, 5), "missing", "b")]
        rows = {(r[0], r[1]): (r[2], r[3]) for r in cov.build(until=D(2001, 1, 31), gaps=gaps)}
        self.assertEqual(rows[("Terra", D(2001, 1, 5))][0], "missing")
        self.assertIn("a", rows[("Terra", D(2001, 1, 5))][1])
        self.assertIn("b", rows[("Terra", D(2001, 1, 5))][1])
        self.assertEqual(rows[("Terra", D(2001, 1, 4))][0], "partial")


@unittest.skipUnless(docker_ok(), "docker not available")
class Write(unittest.TestCase):
    def setUp(self):
        PG.reset()

    def test_writes_every_row(self):
        rows = cov.build(until=D(2003, 12, 31))
        cov.write(PG.psql(), rows)
        self.assertEqual(int(PG.sql("SELECT count(*) FROM coverage")), len(rows))
        self.assertEqual(PG.sql("SELECT status FROM coverage WHERE satellite='Terra' AND day='2001-06-20'"),
                         "missing")

    def test_rerun_replaces_instead_of_duplicating(self):
        rows = cov.build(until=D(2003, 12, 31))
        cov.write(PG.psql(), rows)
        cov.write(PG.psql(), rows)
        self.assertEqual(int(PG.sql("SELECT count(*) FROM coverage")), len(rows))

    def test_edited_gap_list_is_reflected_on_rerun(self):
        cov.write(PG.psql(), cov.build(until=D(2001, 12, 31)))
        cov.write(PG.psql(), cov.build(until=D(2001, 12, 31), gaps=[]))
        self.assertEqual(PG.sql("SELECT status FROM coverage WHERE satellite='Terra' AND day='2001-06-20'"), "ok")

    def test_hotspots_table_is_not_touched(self):
        PG.insert_hotspots([{}])
        cov.write(PG.psql(), cov.build(until=D(2001, 12, 31)))
        self.assertEqual(PG.sql("SELECT count(*) FROM hotspots"), "1")


if __name__ == "__main__":
    unittest.main()
