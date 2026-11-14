import unittest

from confidence import config, score

K = ("Terra", "2008-07-24", "1200", "40.0000", "9.0000")


def na_all():
    return {lvl: {K: (0, "n/a:test")} for lvl in config.LEVEL_ORDER}


class ScoreTest(unittest.TestCase):
    def test_score_all_na_is_50_unverified(self):
        r = score.combine(na_all())[K]
        self.assertEqual(r.score, 50)
        self.assertEqual(r.cls, "unverified")

    def test_score_nonfire_class_override(self):
        s = na_all()
        s["L1"] = {K: (-1, "static")}
        r = score.combine(s)[K]
        self.assertEqual(r.score, 10)
        self.assertEqual(r.cls, "non_fire:static")
        self.assertIn("L1:static", r.reasons)

    def test_score_volcano_class(self):
        s = na_all()
        s["L1"] = {K: (-1, "volcano:Etna")}
        self.assertEqual(score.combine(s)[K].cls, "non_fire:volcano")

    def test_score_clamped(self):
        s = {lvl: {K: (1, "x")} for lvl in config.LEVEL_ORDER}
        r = score.combine(s)[K]
        self.assertEqual(r.score, 100)
        self.assertEqual(r.cls, "confirmed")

    def test_score_l4_uses_split_weights(self):
        s = na_all()
        s["L4"] = {K: (1, "veg:10")}
        self.assertEqual(score.combine(s)[K].score, 55)
        s["L4"] = {K: (-1, "bare")}
        self.assertEqual(score.combine(s)[K].score, 40)

    def test_score_urban_override_only_without_support(self):
        s = na_all()
        s["L4"] = {K: (-1, "urban")}
        self.assertEqual(score.combine(s)[K].cls, "non_fire:urban")
        s["L6"] = {K: (1, "effis:1:100ha")}
        r = score.combine(s)[K]
        self.assertEqual(r.cls, "likely")
        self.assertEqual(r.score, 65)

    def test_score_water_is_offshore(self):
        s = na_all()
        s["L4"] = {K: (-1, "water")}
        self.assertEqual(score.combine(s)[K].cls, "non_fire:offshore")

    def test_missing_level_counts_as_zero(self):
        r = score.combine({"L0": {K: (1, "conf:high")}})[K]
        self.assertEqual(r.score, 55)
        self.assertEqual(r.signals["L3"], 0)

    def test_thresholds(self):
        s = na_all()
        s["L6"] = {K: (1, "e")}
        s["L5"] = {K: (1, "m")}
        self.assertEqual(score.combine(s)[K].cls, "confirmed")  # 50+25+15 = 90
        s = na_all()
        s["L0"] = {K: (-1, "conf:low")}
        s["L4"] = {K: (-1, "bare")}
        self.assertEqual(score.combine(s)[K].cls, "doubtful")    # 50-5-10 = 35


if __name__ == "__main__":
    unittest.main()
