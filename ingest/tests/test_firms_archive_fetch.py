"""Offline tests for the country-archive fetcher. A local HTTP server with Range support
stands in for FIRMS; ZIPs are built in memory with the real FIRMS layout.

    python3 -m unittest discover -s ingest/tests -v
"""

import contextlib
import io
import os
import random
import re
import sys
import tempfile
import threading
import unittest
import zipfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import firms_archive_fetch as fx  # noqa: E402
from firms_csv import ARCHIVE_HEADERS  # noqa: E402

HEADER = ",".join(ARCHIVE_HEADERS["modis"]) + "\n"


def rows(n, year, seed=0):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        out.append(f"{rnd.uniform(36, 47):.4f},{rnd.uniform(7, 18):.4f},{rnd.uniform(300, 400):.1f},1.0,1.0,"
                   f"{year}-{rnd.randint(1, 12):02d}-{rnd.randint(1, 28):02d},{rnd.randint(0, 23):02d}{rnd.randint(0, 59):02d},"
                   f"Terra,MODIS,{rnd.randint(0, 100)},6.2,290.0,{rnd.uniform(1, 90):.1f},D,{rnd.choice('0123')}\n")
    return "".join(out)


def make_zip(sensor="modis", year=2001, filler_mb=0, members=None, compression=zipfile.ZIP_DEFLATED):
    members = members if members is not None else {"Italy": HEADER + rows(5, year), "France": HEADER + rows(3, year, 1),
                                                   "Bosnia_and_Herzegovina": HEADER + rows(2, year, 2)}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for country, text in members.items():
            zf.writestr(f"{sensor}/{year}/{sensor}_{year}_{country}.csv", text, compression)
        zf.writestr(f"{sensor}/{year}/AttributesReadme.txt", "readme")
        if filler_mb:
            zf.writestr("filler.bin", os.urandom(filler_mb << 20), zipfile.ZIP_STORED)
    return buf.getvalue()


def zip_path(sensor, year):
    return f"/data/country/zips/{sensor}_{year}_all_countries.zip"


class FakeArchive:
    def __init__(self, files, support_range=True, fail_first=0):
        self.files, self.support_range, self.fail_first = files, support_range, fail_first
        self.requests: list[str] = []
        self.sent = 0
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                outer.requests.append(self.headers.get("Range", ""))
                if len(outer.requests) <= outer.fail_first:
                    return self._reply(503, b"busy")
                data = outer.files.get(self.path)
                if data is None:
                    return self._reply(404, b"")
                match = re.fullmatch(r"bytes=(\d+)-(\d+)", self.headers.get("Range", ""))
                if match and outer.support_range:
                    a, b = int(match[1]), min(int(match[2]), len(data) - 1)
                    return self._reply(206, data[a : b + 1], {"Content-Range": f"bytes {a}-{b}/{len(data)}"})
                return self._reply(200, data)

            def _reply(self, status, body, headers=None):
                self.send_response(status)
                for k, v in (headers or {}).items():
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                outer.sent += len(body)

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


def go(arch, out, years=(2001,), countries=("Italy",), sensor="modis", **kw):
    return fx.run(sensor=sensor, years=list(years), countries=list(countries), out_dir=Path(out),
                  base_url=arch.base_url, sleep=lambda s: None, log=lambda m: None, **kw)


def files_in(out):
    return sorted(p.name for p in Path(out).iterdir())


class FakeHttp:
    """In-process stand-in for Http, for RangeFile unit tests."""

    def __init__(self, data, truncate=False):
        self.data, self.truncate, self.calls = data, truncate, []

    def get(self, url, headers=None):
        a, b = map(int, re.fullmatch(r"bytes=(\d+)-(\d+)", headers["Range"]).groups())
        b = min(b, len(self.data) - 1)
        self.calls.append((a, b))
        body = self.data[a : b + 1]
        if self.truncate and len(self.calls) > 1:
            body = body[:-1]
        return 206, {"Content-Range": f"bytes {a}-{b}/{len(self.data)}"}, body


class Parsing(unittest.TestCase):
    def test_years(self):
        self.assertEqual(fx.parse_years("2001"), [2001])
        self.assertEqual(fx.parse_years("2000-2002"), [2000, 2001, 2002])
        self.assertEqual(fx.parse_years("2001,2005-2006,2001"), [2001, 2005, 2006])
        for bad in ("", "abc", "2005-2001", "1999", "2001-3000"):
            with self.assertRaises(fx.ArchiveError):
                fx.parse_years(bad)

    def test_country_names(self):
        self.assertEqual(fx.norm_country("Bosnia and Herzegovina"), "Bosnia_and_Herzegovina")
        self.assertEqual(fx.norm_country(" Italy "), "Italy")


class RangeFileReads(unittest.TestCase):
    """Correct bytes are the whole point: any off-by-one here silently corrupts every file."""

    DATA = bytes(range(256)) * 400  # 102,400 bytes, every offset distinguishable mod 256

    def test_random_reads_return_exact_bytes(self):
        rf = fx.RangeFile(FakeHttp(self.DATA), "u", block=1000)
        rnd = random.Random(42)
        for _ in range(500):
            off, n = rnd.randrange(len(self.DATA)), rnd.randrange(1, 5000)  # many cross block edges
            rf.seek(off)
            self.assertEqual(rf.read(n), self.DATA[off : off + n], f"offset {off}, length {n}")
            self.assertEqual(rf.tell(), min(off + n, len(self.DATA)))

    def test_end_of_file_and_whence(self):
        rf = fx.RangeFile(FakeHttp(self.DATA), "u", block=1000)
        rf.seek(-10, os.SEEK_END)
        self.assertEqual(rf.read(100), self.DATA[-10:])
        self.assertEqual(rf.read(5), b"")
        rf.seek(0)
        self.assertEqual(rf.read(), self.DATA)

    def test_read_ahead_keeps_request_count_low(self):
        fake = FakeHttp(self.DATA)
        rf = fx.RangeFile(fake, "u", block=1000)
        while rf.read(100):
            pass
        self.assertLessEqual(len(fake.calls), len(self.DATA) // 1000 + 3)  # not one request per read

    def test_short_ranged_response_is_an_error(self):
        rf = fx.RangeFile(FakeHttp(self.DATA, truncate=True), "u", block=1000)
        with self.assertRaises(fx.ArchiveError):
            rf.read(10)

    def test_zipfile_over_tiny_blocks_reads_member_exactly(self):
        text = HEADER + rows(2000, 2001)
        data = make_zip(members={"Italy": text})
        zf = zipfile.ZipFile(fx.RangeFile(FakeHttp(data), "u", block=97))
        self.assertEqual(zf.read("modis/2001/modis_2001_Italy.csv").decode(), text)


class Fetching(unittest.TestCase):
    def test_extracts_exact_bytes_of_one_country_without_downloading_the_zip(self):
        data = make_zip(filler_mb=8)
        with FakeArchive({zip_path("modis", 2001): data}) as arch, tempfile.TemporaryDirectory() as out:
            self.assertEqual(go(arch, out), [])
            self.assertEqual((Path(out) / "modis_2001_Italy.csv").read_text(), HEADER + rows(5, 2001))
            self.assertLess(arch.sent, len(data) / 4, "must read only the index and the one member")
            self.assertEqual(files_in(out), ["modis_2001_Italy.csv"])

    def test_large_member_spanning_many_blocks_is_byte_identical(self):
        text = HEADER + rows(40_000, 2001)  # ~3.5 MB of CSV, deflates to > 1 read-ahead block
        with FakeArchive({zip_path("modis", 2001): make_zip(members={"Italy": text})}) as arch, \
                tempfile.TemporaryDirectory() as out:
            self.assertEqual(go(arch, out), [])
            self.assertEqual((Path(out) / "modis_2001_Italy.csv").read_text(), text)
            self.assertGreater(len(arch.requests), 3)

    def test_multiple_countries_names_with_spaces_and_case(self):
        with FakeArchive({zip_path("modis", 2001): make_zip()}) as arch, tempfile.TemporaryDirectory() as out:
            self.assertEqual(go(arch, out, countries=("france", "Bosnia and Herzegovina")), [])
            self.assertEqual(files_in(out), ["modis_2001_Bosnia_and_Herzegovina.csv", "modis_2001_France.csv"])

    def test_cache_hit_makes_no_requests_even_with_different_case(self):
        with FakeArchive({zip_path("modis", 2001): make_zip()}) as arch, tempfile.TemporaryDirectory() as out:
            go(arch, out)
            used = len(arch.requests)
            self.assertEqual(go(arch, out, countries=("italy",)), [])
            self.assertEqual(len(arch.requests), used)
            go(arch, out, force=True)
            self.assertGreater(len(arch.requests), used)

    def test_transient_server_errors_are_retried(self):
        with FakeArchive({zip_path("modis", 2001): make_zip()}, fail_first=2) as arch, tempfile.TemporaryDirectory() as out:
            self.assertEqual(go(arch, out), [])
            self.assertEqual((Path(out) / "modis_2001_Italy.csv").read_text(), HEADER + rows(5, 2001))

    def test_missing_year_does_not_stop_the_rest(self):
        files = {zip_path("modis", 2001): make_zip(year=2001), zip_path("modis", 2003): make_zip(year=2003)}
        with FakeArchive(files) as arch, tempfile.TemporaryDirectory() as out:
            failures = go(arch, out, years=(2001, 2002, 2003))
            self.assertEqual(len(failures), 1)
            self.assertIn("modis 2002", failures[0])
            self.assertEqual(files_in(out), ["modis_2001_Italy.csv", "modis_2003_Italy.csv"])

    def test_garbage_instead_of_zip_is_reported_and_next_year_continues(self):
        files = {zip_path("modis", 2001): b"<html>maintenance</html>" * 100, zip_path("modis", 2002): make_zip(year=2002)}
        with FakeArchive(files) as arch, tempfile.TemporaryDirectory() as out:
            failures = go(arch, out, years=(2001, 2002))
            self.assertEqual(len(failures), 1)
            self.assertIn("valid ZIP", failures[0])
            self.assertEqual(files_in(out), ["modis_2002_Italy.csv"])

    def test_corrupted_bytes_are_caught_by_crc_and_nothing_is_written(self):
        text = HEADER + rows(50, 2001)
        data = bytearray(make_zip(members={"Italy": text}, compression=zipfile.ZIP_STORED))
        pos = data.find(text.encode()) + len(HEADER) + 3  # a digit inside the first data row
        data[pos] = ord("7") if data[pos] != ord("7") else ord("8")  # still a valid-looking CSV
        with FakeArchive({zip_path("modis", 2001): bytes(data)}) as arch, tempfile.TemporaryDirectory() as out:
            failures = go(arch, out)
            self.assertEqual(len(failures), 1)
            self.assertIn("corrupt", failures[0])
            self.assertEqual(files_in(out), [])

    def test_wrong_columns_are_rejected(self):
        viirs_text = ",".join(ARCHIVE_HEADERS["viirs-snpp"]) + "\n" + rows(3, 2001)
        with FakeArchive({zip_path("modis", 2001): make_zip(members={"Italy": viirs_text})}) as arch, \
                tempfile.TemporaryDirectory() as out:
            failures = go(arch, out)
            self.assertIn("bright_ti4", failures[0])
            self.assertEqual(files_in(out), [])

    def test_rows_from_another_year_are_rejected(self):
        text = HEADER + rows(3, 2001) + rows(1, 2002)
        with FakeArchive({zip_path("modis", 2001): make_zip(members={"Italy": text})}) as arch, \
                tempfile.TemporaryDirectory() as out:
            failures = go(arch, out)
            self.assertIn("outside", failures[0])
            self.assertEqual(files_in(out), [])

    def test_unknown_country_suggests_close_names(self):
        with FakeArchive({zip_path("modis", 2001): make_zip()}) as arch, tempfile.TemporaryDirectory() as out:
            failures = go(arch, out, countries=("Itly", "Italy"))
            self.assertEqual(len(failures), 1)
            self.assertIn("did you mean: Italy", failures[0])
            self.assertEqual(files_in(out), ["modis_2001_Italy.csv"])

    def test_server_without_range_is_reported(self):
        with FakeArchive({zip_path("modis", 2001): make_zip()}, support_range=False) as arch, \
                tempfile.TemporaryDirectory() as out:
            failures = go(arch, out)
            self.assertIn("Range", failures[0])

    def test_list_countries(self):
        with FakeArchive({zip_path("modis", 2001): make_zip()}) as arch:
            names = fx.list_countries(fx.Http(sleep=lambda s: None), arch.base_url, "modis", 2001)
            self.assertEqual(names, ["Bosnia_and_Herzegovina", "France", "Italy"])

    def test_cli_exit_codes(self):
        with FakeArchive({zip_path("modis", 2001): make_zip()}) as arch, tempfile.TemporaryDirectory() as out, \
                contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()) as err:
            ok = fx.main(["--years", "2001", "--out", out, "--base-url", arch.base_url])
            self.assertEqual(ok, 0)
            bad = fx.main(["--years", "2001-2002", "--force", "--out", out, "--base-url", arch.base_url])
            self.assertEqual(bad, 1)  # 2002 is missing
            self.assertIn("modis 2002", err.getvalue())


if __name__ == "__main__":
    unittest.main()
