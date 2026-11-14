"""The content validator is what guarantees "what is on disk is correct", so test it hard."""

import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from firms_csv import ARCHIVE_HEADERS, CsvProblem, check_lines  # noqa: E402

MODIS_HEADER = ",".join(ARCHIVE_HEADERS["modis"])
# Real first data row of modis_2001_Italy.csv
ROW = "37.9843,14.1981,302.6,1.2,1.1,2001-01-07,1024,Terra,MODIS,53,6.2,289.9,6.8,D,0"
YEAR = dict(first_day=dt.date(2001, 1, 1), last_day=dt.date(2001, 12, 31))


def check(text, expected="modis", **window):
    header = ARCHIVE_HEADERS[expected] if expected else None
    return check_lines(text.splitlines(keepends=True), expected_header=header, **(window or YEAR))


def with_field(index, value):
    fields = ROW.split(",")
    fields[index] = value
    return ",".join(fields)


class Valid(unittest.TestCase):
    def test_real_row_passes_and_reports_span(self):
        text = f"{MODIS_HEADER}\n{ROW}\n{ROW.replace('2001-01-07', '2001-08-15')}\n"
        self.assertEqual(check(text), (2, dt.date(2001, 1, 7), dt.date(2001, 8, 15)))

    def test_crlf_missing_final_newline_and_blank_lines(self):
        self.assertEqual(check(f"{MODIS_HEADER}\r\n{ROW}\r\n{ROW}")[0], 2)
        self.assertEqual(check(f"{MODIS_HEADER}\n{ROW}\n\n\n")[0], 1)

    def test_empty_and_header_only_mean_zero_detections(self):
        self.assertEqual(check(""), (0, None, None))
        self.assertEqual(check(MODIS_HEADER + "\n"), (0, None, None))

    def test_viirs_header_is_accepted_for_viirs(self):
        viirs_row = "45.516,10.34384,298.76,0.38,0.36,2001-01-01,0127,N,VIIRS,n,2,271.62,0.84,N,2"
        self.assertEqual(check(",".join(ARCHIVE_HEADERS["viirs-snpp"]) + "\n" + viirs_row, "viirs-snpp")[0], 1)

    def test_api_mode_accepts_nrt_header_without_type(self):
        nrt = MODIS_HEADER.replace(",type", "") + "\n" + ROW.rsplit(",", 1)[0]
        self.assertEqual(check(nrt, expected=None)[0], 1)


class Rejected(unittest.TestCase):
    def assertProblem(self, text, fragment, **kw):
        with self.assertRaises(CsvProblem) as ctx:
            check(text, **kw)
        self.assertIn(fragment, str(ctx.exception))

    def test_html_error_page(self):
        self.assertProblem("<html><body>Service unavailable</body></html>", "not a FIRMS CSV")

    def test_sensor_columns_mixed_up(self):
        viirs = ",".join(ARCHIVE_HEADERS["viirs-snpp"])
        self.assertProblem(f"{viirs}\n{ROW}", "bright_ti4")  # VIIRS file where MODIS was expected

    def test_renamed_or_reordered_columns(self):
        self.assertProblem(MODIS_HEADER.replace("frp", "fire_power") + "\n" + ROW, "fire_power")
        cols = MODIS_HEADER.split(",")
        cols[2], cols[3] = cols[3], cols[2]
        self.assertProblem(",".join(cols) + "\n" + ROW, "different order")

    def test_core_column_missing_in_api_mode(self):
        self.assertProblem(MODIS_HEADER.replace(",frp", "") + "\n" + ROW.replace(",6.8,", ","), "frp", expected=None)

    def test_truncated_last_row_reports_line(self):
        self.assertProblem(f"{MODIS_HEADER}\n{ROW}\n{ROW[:40]}", "line 3")

    def test_date_outside_requested_period(self):
        self.assertProblem(f"{MODIS_HEADER}\n{with_field(5, '2002-01-01')}", "outside")
        window = dict(first_day=dt.date(2001, 1, 1), last_day=dt.date(2001, 1, 5))
        self.assertProblem(f"{MODIS_HEADER}\n{ROW}", "outside", **window)  # row is 2001-01-07

    def test_unparsable_values(self):
        self.assertProblem(f"{MODIS_HEADER}\n{with_field(5, '07/01/2001')}", "unparsable")
        self.assertProblem(f"{MODIS_HEADER}\n{with_field(0, 'abc')}", "unparsable")

    def test_impossible_coordinates(self):
        self.assertProblem(f"{MODIS_HEADER}\n{with_field(0, '95.0')}", "out of range")
        self.assertProblem(f"{MODIS_HEADER}\n{with_field(1, '-181')}", "out of range")

    def test_bad_acq_time(self):
        for bad in ("2400", "2460", "1275", "12:30", "abcd", "", "12345"):
            with self.subTest(bad=bad):
                self.assertProblem(f"{MODIS_HEADER}\n{with_field(6, bad)}", "acq_time")


if __name__ == "__main__":
    unittest.main()
