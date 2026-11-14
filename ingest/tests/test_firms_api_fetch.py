"""Offline tests for the REST-API fetcher. A local HTTP server stands in for FIRMS and
answers like the documented API: rows for [DATE .. DATE + DAY_RANGE - 1].

    python3 -m unittest discover -s ingest/tests -v
"""

import contextlib
import csv
import datetime as dt
import io
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import firms_api_fetch as fx  # noqa: E402

KEY = "TESTKEY1234567890abcdef12345678"
# MODIS NRT columns per the NASA attribute page: like the archive, but no `type`.
HEADER = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight\n"
DROP = object()  # responder sentinel: close the connection without answering


def parse(path):
    """'/api/area/csv/KEY/SRC/bbox/N/DATE' -> (N, DATE)."""
    parts = path.strip("/").split("/")
    return int(parts[-2]), dt.date.fromisoformat(parts[-1])


def row(day, i):
    return f"41.{i},12.{i},300.1,1.0,1.0,{day},0{i}27,T,MODIS,50,6.1NRT,290.0,5.0,D\n"


def csv_for(path):
    """Two detections on every day of the requested window."""
    n, first = parse(path)
    days = [first + dt.timedelta(days=d) for d in range(n)]
    return HEADER + "".join(row(day, i) for day in days for i in range(2))


class FakeFirms:
    def __init__(self, responder=lambda path, i: (200, csv_for(path))):
        self.paths: list[str] = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                outer.paths.append(self.path)
                answer = responder(self.path, len(outer.paths))
                if answer is DROP:
                    self.close_connection = True
                    return
                status, body = answer
                data = body.encode()
                self.send_response(status)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def __enter__(self):
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        return self

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()


def run(fake, out, start="2025-06-01", end="2025-06-12", sleep=lambda s: None, **kw):
    return fx.fetch_range(
        key=KEY, source="MODIS_SP", bbox=fx.ITALY_BBOX,
        start=dt.date.fromisoformat(start), end=dt.date.fromisoformat(end),
        out_dir=Path(out), base_url=fake.base_url, sleep=sleep, log=lambda m: None, **kw,
    )


def chunk_files(out):
    return sorted(p.name for p in Path(out).rglob("chunks/**/*") if p.is_file())


class PlanAndInput(unittest.TestCase):
    def test_chunks_cover_range_exactly_without_gaps_or_overlap(self):
        for start, end in [("2025-06-01", "2025-06-12"), ("2025-12-30", "2026-01-03"), ("2024-02-27", "2024-03-02"),
                           ("2025-06-01", "2025-06-01"), ("2025-01-01", "2025-12-31")]:
            s, e = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
            covered = [d + dt.timedelta(days=k) for d, n in fx.plan_chunks(s, e) for k in range(n)]
            with self.subTest(start=start, end=end):
                self.assertEqual(covered, [s + dt.timedelta(days=k) for k in range((e - s).days + 1)])
                self.assertTrue(all(1 <= n <= 5 for _, n in fx.plan_chunks(s, e)))
        self.assertEqual(len(list(fx.plan_chunks(dt.date(2025, 1, 1), dt.date(2025, 12, 31)))), 73)

    def test_bbox(self):
        self.assertEqual(fx.parse_bbox(fx.ITALY_BBOX), ("6.76,35.49,18.52,46.9", "6.76_35.49_18.52_46.9"))
        self.assertEqual(fx.parse_bbox("world")[0], "-180,-90,180,90")
        for bad in ("1,2,3", "a,b,c,d", "10,0,5,1", "0,0,181,10"):
            with self.assertRaises(fx.FirmsError):
                fx.parse_bbox(bad)

    def test_key_comes_only_from_env_and_must_be_url_safe(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(fx.FirmsError) as ctx:
                fx.get_key()
            self.assertIn("api/area", str(ctx.exception))
        for bad in ("abc/def12345", "key with spaces", "../../etc12"):
            with mock.patch.dict(os.environ, {fx.KEY_ENV: bad}), self.assertRaises(fx.FirmsError):
                fx.get_key()
        with mock.patch.dict(os.environ, {fx.KEY_ENV: KEY}):
            self.assertEqual(fx.get_key(), KEY)

    def test_unknown_source_and_reversed_dates_make_no_requests(self):
        with FakeFirms() as fake, tempfile.TemporaryDirectory() as out:
            with self.assertRaises(fx.FirmsError):
                fx.fetch_range(key=KEY, source="LANDSAT_NRT", bbox=fx.ITALY_BBOX, start=dt.date(2025, 6, 1),
                               end=dt.date(2025, 6, 2), out_dir=Path(out), base_url=fake.base_url)
            with self.assertRaises(fx.FirmsError):
                run(fake, out, start="2025-06-05", end="2025-06-01")
            self.assertEqual(fake.paths, [])


class Fetching(unittest.TestCase):
    def test_request_urls_follow_the_documented_contract(self):
        with FakeFirms() as fake, tempfile.TemporaryDirectory() as out:
            run(fake, out)
            base = f"/api/area/csv/{KEY}/MODIS_SP/6.76,35.49,18.52,46.9"
            self.assertEqual(fake.paths, [f"{base}/5/2025-06-01", f"{base}/5/2025-06-06", f"{base}/2/2025-06-11"])

    def test_merged_file_has_every_row_once_in_date_order(self):
        with FakeFirms() as fake, tempfile.TemporaryDirectory() as out:
            merged = run(fake, out)
            with merged.open(newline="") as f:
                got = list(csv.DictReader(f))
            days = [dt.date(2025, 6, 1) + dt.timedelta(days=k) for k in range(12)]
            self.assertEqual(len(got), 24)
            self.assertEqual([r["acq_date"] for r in got], [str(d) for d in days for _ in range(2)])
            self.assertEqual(merged.read_text().count("latitude,"), 1)

    def test_rerun_uses_cache_and_force_refetches(self):
        with FakeFirms() as fake, tempfile.TemporaryDirectory() as out:
            first = run(fake, out).read_bytes()
            self.assertEqual(len(fake.paths), 3)
            self.assertEqual(run(fake, out).read_bytes(), first)
            self.assertEqual(len(fake.paths), 3)
            run(fake, out, force=True)
            self.assertEqual(len(fake.paths), 6)

    def test_resume_after_failure_fetches_only_missing_chunks(self):
        def flaky(path, i):
            return (400, "Invalid request") if i == 2 else (200, csv_for(path))

        with FakeFirms(flaky) as fake, tempfile.TemporaryDirectory() as out:
            with self.assertRaises(fx.FirmsError):
                run(fake, out)
            self.assertEqual(len(chunk_files(out)), 1)  # chunk 1 kept, chunk 2 failed, chunk 3 never tried
            run(fake, out)
            self.assertEqual(len(fake.paths), 2 + 2)  # only chunks 2 and 3 on the second run
            self.assertEqual(len(chunk_files(out)), 3)

    def test_transient_errors_are_retried_with_backoff(self):
        answers = {1: (503, "busy"), 2: (429, "slow down"), 3: DROP}

        def responder(path, i):
            return answers.get(i, (200, csv_for(path)))

        delays = []
        with FakeFirms(responder) as fake, tempfile.TemporaryDirectory() as out:
            merged = run(fake, out, start="2025-06-01", end="2025-06-03", sleep=delays.append)
            self.assertEqual(len(fake.paths), 4)
            self.assertEqual(delays, [2, 4, 8])
            self.assertEqual(len(merged.read_text().splitlines()), 1 + 3 * 2)

    def test_gives_up_after_retries(self):
        with FakeFirms(lambda path, i: (500, "boom")) as fake, tempfile.TemporaryDirectory() as out:
            with self.assertRaises(fx.FirmsError):
                run(fake, out)
            self.assertEqual(len(fake.paths), 5)
            self.assertEqual(chunk_files(out), [])

    def test_bad_key_fails_fast(self):
        with FakeFirms(lambda path, i: (400, "Invalid MAP_KEY.")) as fake, tempfile.TemporaryDirectory() as out:
            with self.assertRaises(fx.FirmsError) as ctx:
                run(fake, out)
            self.assertIn("Invalid MAP_KEY", str(ctx.exception))
            self.assertEqual(len(fake.paths), 1)

    def test_cli_never_prints_the_key(self):
        with FakeFirms(lambda path, i: (400, f"Invalid MAP_KEY {KEY}")) as fake, tempfile.TemporaryDirectory() as out, \
                mock.patch.dict(os.environ, {fx.KEY_ENV: KEY}):
            stdout, stderr = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = fx.main(["--base-url", fake.base_url, "fetch", "--source", "MODIS_SP",
                                "--start", "2025-06-01", "--end", "2025-06-02", "--out", out])
            self.assertEqual(code, 1)
            self.assertIn("Invalid MAP_KEY", stderr.getvalue())
            self.assertNotIn(KEY, stdout.getvalue() + stderr.getvalue())

    def test_rows_outside_the_requested_window_are_rejected_not_cached(self):
        def leaky(path, i):
            n, first = parse(path)
            return 200, csv_for(path) + row(first + dt.timedelta(days=n), 0)  # one day too far

        with FakeFirms(leaky) as fake, tempfile.TemporaryDirectory() as out:
            with self.assertRaises(fx.FirmsError) as ctx:
                run(fake, out)
            self.assertIn("outside", str(ctx.exception))
            self.assertEqual(chunk_files(out), [])

    def test_truncated_body_is_rejected_not_cached(self):
        with FakeFirms(lambda path, i: (200, csv_for(path)[:-25])) as fake, tempfile.TemporaryDirectory() as out:
            with self.assertRaises(fx.FirmsError) as ctx:
                run(fake, out)
            self.assertIn("fields", str(ctx.exception))
            self.assertEqual(chunk_files(out), [])

    def test_html_body_with_200_is_rejected(self):
        with FakeFirms(lambda path, i: (200, "<html>maintenance</html>")) as fake, tempfile.TemporaryDirectory() as out:
            with self.assertRaises(fx.FirmsError):
                run(fake, out)
            self.assertEqual(list(Path(out).rglob("*.csv")), [])

    def test_corrupted_cache_is_detected_and_force_repairs_it(self):
        with FakeFirms() as fake, tempfile.TemporaryDirectory() as out:
            run(fake, out)
            chunk = next(Path(out).rglob("*_2025-06-06_5d.csv"))
            chunk.write_text(chunk.read_text()[:-30])
            with self.assertRaises(fx.FirmsError) as ctx:
                run(fake, out)
            self.assertIn("--force", str(ctx.exception))
            self.assertEqual(len(run(fake, out, force=True).read_text().splitlines()), 1 + 24)

    def test_no_detections_is_fine(self):
        for body in ("", HEADER):
            with self.subTest(body=body[:9]), FakeFirms(lambda path, i: (200, body)) as fake, \
                    tempfile.TemporaryDirectory() as out:
                merged = run(fake, out, start="2025-06-01", end="2025-06-02")
                self.assertEqual(merged.read_text(), body)

    def test_changed_header_between_chunks_is_refused(self):
        def responder(path, i):
            body = csv_for(path)
            return 200, body if i == 1 else body.replace("brightness", "bright_ti4")

        with FakeFirms(responder) as fake, tempfile.TemporaryDirectory() as out:
            with self.assertRaises(fx.FirmsError) as ctx:
                run(fake, out)
            self.assertIn("header changed", str(ctx.exception))


class MergeLineEndings(unittest.TestCase):
    """FIRMS chunks may end without a newline or use CRLF; the merge must not glue rows."""

    def merge(self, responder):
        logs: list[str] = []
        with FakeFirms(responder) as fake, tempfile.TemporaryDirectory() as out:
            merged = fx.fetch_range(
                key=KEY, source="MODIS_SP", bbox=fx.ITALY_BBOX,
                start=dt.date(2025, 6, 1), end=dt.date(2025, 6, 12),
                out_dir=Path(out), base_url=fake.base_url, sleep=lambda s: None, log=logs.append,
            )
            return merged.read_bytes(), logs

    def assert_clean(self, data, logs, rows):
        self.assertTrue(data.endswith(b"\n"))
        self.assertNotIn(b"\r", data)
        lines = data.decode().splitlines()
        self.assertEqual(lines[0] + "\n", HEADER)
        self.assertEqual(len(lines), 1 + rows)
        width = HEADER.count(",") + 1
        self.assertEqual({len(r) for r in csv.reader(lines)}, {width})
        self.assertEqual(logs[-1].split()[1], str(rows))

    def test_chunks_without_final_newline_do_not_glue_rows(self):
        data, logs = self.merge(lambda path, i: (200, csv_for(path).rstrip("\n")))
        self.assert_clean(data, logs, 24)

    def test_header_only_chunk_without_newline_adds_no_rows(self):
        data, logs = self.merge(lambda path, i: (200, HEADER.rstrip("\n") if i == 2 else csv_for(path)))
        self.assert_clean(data, logs, 24 - 10)

    def test_crlf_chunk_mixed_with_lf_chunks(self):
        data, logs = self.merge(lambda path, i: (200, csv_for(path).replace("\n", "\r\n") if i == 2 else csv_for(path)))
        self.assert_clean(data, logs, 24)

    def test_different_header_without_newline_is_still_refused(self):
        def responder(path, i):
            return 200, HEADER.replace("brightness", "bright_ti4").rstrip("\n") if i == 2 else csv_for(path)

        with self.assertRaises(fx.FirmsError) as ctx:
            self.merge(responder)
        self.assertIn("header changed", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
