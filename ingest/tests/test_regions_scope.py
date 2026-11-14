"""Which countries load_regions.py works on: the `europe` preset and --countries parsing. No DB.

    python3 -m unittest ingest/tests/test_regions_scope.py -v
"""

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import regions_scope as sc  # noqa: E402

ADM0 = Path(__file__).resolve().parents[2] / "data" / "raw" / "boundaries" / "geoBoundariesCGAZ_ADM0.geojson"


class Europe(unittest.TestCase):
    def test_europe_preset(self):
        self.assertEqual(len(sc.EUROPE), 45)
        for code in sc.EUROPE:
            self.assertRegex(code, r"^[A-Z]{3}$")
        self.assertLessEqual({"ITA", "FRA", "IRL", "UKR", "XKX", "CYP", "ISL", "VAT"}, sc.EUROPE)

    def test_transcontinental_countries_are_not_in_the_preset(self):
        # Russia alone has millions of Siberian detections; add it explicitly: --countries europe,RUS
        self.assertFalse({"RUS", "TUR", "KAZ", "GEO", "ARM", "AZE", "GRL"} & sc.EUROPE)

    @unittest.skipUnless(ADM0.exists(), "boundary files not downloaded (python3 ingest/boundaries_fetch.py)")
    def test_every_code_exists_in_the_real_adm0_file(self):
        codes = set(re.findall(r'"shapeGroup": "([A-Z0-9]{3})"', ADM0.read_text()))
        self.assertEqual(sc.EUROPE - codes, set())


class ParseCountries(unittest.TestCase):
    def test_all_means_no_filter(self):
        self.assertIsNone(sc.parse_countries("all"))
        self.assertIsNone(sc.parse_countries(" ALL "))

    def test_europe(self):
        self.assertEqual(sc.parse_countries("europe"), sc.EUROPE)

    def test_codes_any_case_with_spaces(self):
        self.assertEqual(sc.parse_countries("ita, Fra"), {"ITA", "FRA"})

    def test_preset_plus_extra_codes(self):
        self.assertEqual(sc.parse_countries("europe,RUS"), sc.EUROPE | {"RUS"})

    def test_bad_values_are_rejected(self):
        for bad in ["", "IT", "ITALY", "ITA,,FRA", "all,ITA", "ITA;FRA", "12"]:
            with self.assertRaises(ValueError, msg=bad):
                sc.parse_countries(bad)


if __name__ == "__main__":
    unittest.main()
