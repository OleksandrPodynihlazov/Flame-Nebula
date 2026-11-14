#!/usr/bin/env python3
"""Download whole-country FIRMS yearly archives as raw CSV. No key, no login, stdlib only.

Sibling of firms_api_fetch.py: this one gets WHOLE COUNTRIES, one calendar year at a time,
from the public archive. Use the API script for an arbitrary bbox, recent days or NRT.

Each year is one ~30-400 MB ZIP holding ~199 country CSVs. The server supports HTTP Range,
so we read the ZIP index and download ONLY the countries you ask for (Italy: ~1.6 MB instead
of 380 MB). Rows are saved exactly as FIRMS publishes them (raw layer, no normalisation).

Usage (Italy and modis are the defaults; --years is required):
    python3 ingest/firms_archive_fetch.py --years 2001
    python3 ingest/firms_archive_fetch.py --years 2000-2025 --sensor viirs-snpp
    python3 ingest/firms_archive_fetch.py --years 2012-2014,2020 --country France Spain
    python3 ingest/firms_archive_fetch.py --years 2001 --country "Bosnia and Herzegovina"
    python3 ingest/firms_archive_fetch.py --years 2001 --list-countries

Facts (research/01-data-access.md §A): modis 2000-2025 (2000 = Nov-Dec only), viirs-snpp
2012-2025, 2026 does not exist yet. Country = English name, underscores for spaces.
Existing output files are skipped (use --force). Output: data/raw/firms_archive/
"""

import argparse
import datetime as dt
import difflib
import http.client
import io
import sys
import time
import urllib.error
import urllib.request
import zipfile
import zlib
from pathlib import Path

from firms_csv import ARCHIVE_HEADERS, CsvProblem, check_lines

BASE_URL = "https://firms.modaps.eosdis.nasa.gov"
USER_AGENT = "flame-nebula-ingest/0.1"
SENSORS = {"modis": (2000, 2025), "viirs-snpp": (2012, 2025)}  # verified ranges
BLOCK = 1 << 20  # read-ahead for ranged reads


class ArchiveError(RuntimeError):
    """Expected failure: bad input, unusable server response."""


class NotPublished(ArchiveError):
    """The archive for this sensor/year does not exist (HTTP 404)."""


class Http:
    """Tiny GET helper with retries; counts requests and bytes for reporting."""

    def __init__(self, retries: int = 5, timeout: int = 60, sleep=time.sleep):
        self.retries, self.timeout, self.sleep = retries, timeout, sleep
        self.requests = 0
        self.bytes = 0

    def get(self, url: str, headers: dict | None = None):
        last = "no attempt made"
        for attempt in range(self.retries):
            if attempt:
                self.sleep(min(2**attempt, 30))
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    body = resp.read()
                    self.requests += 1
                    self.bytes += len(body)
                    return resp.status, resp.headers, body
            except urllib.error.HTTPError as err:
                code = err.code
                err.read()
                err.close()
                if code == 404:
                    raise NotPublished(f"404 Not Found: {url}") from None
                if code == 429 or code >= 500:
                    last = f"HTTP {code}"
                    continue
                raise ArchiveError(f"HTTP {code} for {url}") from None
            except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as err:
                last = f"{type(err).__name__}: {err}"
        raise ArchiveError(f"gave up after {self.retries} attempts on {url}, last error: {last}")


class RangeFile(io.RawIOBase):
    """Seekable read-only file over HTTP Range requests, with a read-ahead cache."""

    def __init__(self, http_client: Http, url: str, block: int = BLOCK):
        self.http, self.url, self.blocksize = http_client, url, block
        status, headers, _ = http_client.get(url, {"Range": "bytes=0-0"})
        content_range = headers.get("Content-Range", "")
        if status != 206 or "/" not in content_range:
            raise ArchiveError(f"server does not support HTTP Range for {url} (status {status}); download the ZIP with curl instead")
        self.size = int(content_range.rsplit("/", 1)[1])
        self.pos = 0
        self._start = 0
        self._block = b""

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=io.SEEK_SET):
        base = {io.SEEK_SET: 0, io.SEEK_CUR: self.pos, io.SEEK_END: self.size}[whence]
        self.pos = max(0, base + offset)
        return self.pos

    def _fetch(self, start: int, length: int) -> bytes:
        end = min(start + length, self.size) - 1
        status, _, body = self.http.get(self.url, {"Range": f"bytes={start}-{end}"})
        if status != 206 or len(body) != end - start + 1:
            raise ArchiveError(f"bad ranged response ({status}, {len(body)} bytes) for bytes={start}-{end}")
        return body

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        n = min(n, self.size - self.pos)
        out = bytearray()
        while len(out) < n:
            offset = self.pos - self._start
            if 0 <= offset < len(self._block):
                chunk = self._block[offset : offset + (n - len(out))]
            else:
                self._start = self.pos
                self._block = self._fetch(self.pos, max(self.blocksize, n - len(out)))
                chunk = self._block[: n - len(out)]
            if not chunk:  # never loop forever on a broken read
                raise ArchiveError(f"no bytes returned at offset {self.pos} of {self.url}")
            out += chunk
            self.pos += len(chunk)
        return bytes(out)

    def readinto(self, buf):
        data = self.read(len(buf))
        buf[: len(data)] = data
        return len(data)


def parse_years(text: str) -> list[int]:
    """'2001' | '2000-2005' | '2001,2005-2007' -> sorted unique years."""
    years: set[int] = set()
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        first, _, last = part.partition("-")
        try:
            lo, hi = int(first), int(last or first)
        except ValueError:
            raise ArchiveError(f"bad --years {text!r}; use 2001, 2000-2005 or 2001,2005-2007") from None
        if hi < lo or lo < 2000 or hi > 2100:
            raise ArchiveError(f"bad year range {part!r}")
        years.update(range(lo, hi + 1))
    if not years:
        raise ArchiveError("--years is empty")
    return sorted(years)


def norm_country(name: str) -> str:
    return "_".join(name.split())


def country_index(names, sensor: str, year: int) -> dict[str, str]:
    """lower-case country -> ZIP member name, for CSVs of this sensor/year."""
    prefix = f"{sensor}/{year}/{sensor}_{year}_"
    return {n[len(prefix) : -4].lower(): n for n in names if n.startswith(prefix) and n.endswith(".csv")}


def resolve_member(index: dict[str, str], sensor: str, year: int, country: str) -> tuple[str, str]:
    """Return (member_name, canonical_country); suggest close names when not found."""
    key = norm_country(country).lower()
    prefix = f"{sensor}/{year}/{sensor}_{year}_"
    if key in index:
        member = index[key]
        return member, member[len(prefix) : -4]
    close = difflib.get_close_matches(key, list(index), n=5, cutoff=0.6)
    hint = "did you mean: " + ", ".join(index[c][len(prefix) : -4] for c in close) if close else "see --list-countries"
    raise ArchiveError(f"country {country!r} not in {sensor} {year}; {hint}")


def find_cached(out_dir: Path, sensor: str, year: int, country: str) -> Path | None:
    want = f"{sensor}_{year}_{norm_country(country)}.csv".lower()
    if out_dir.is_dir():
        for path in out_dir.glob(f"{sensor}_{year}_*.csv"):
            if path.name.lower() == want:
                return path
    return None


def extract(zf: zipfile.ZipFile, member: str, dest: Path, *, sensor: str, year: int):
    """Stream one CSV out of the ZIP, validate it, then move it to dest atomically.

    Returns (rows, min_acq_date, max_acq_date). On any failure nothing is left on disk.
    """
    tmp = dest.with_name(dest.name + ".part")
    try:
        with zf.open(member) as src, tmp.open("wb") as dst:  # zipfile verifies CRC-32 at the end
            while chunk := src.read(1 << 16):
                dst.write(chunk)
        with tmp.open(encoding="utf-8", errors="replace", newline="") as f:
            result = check_lines(f, first_day=dt.date(year, 1, 1), last_day=dt.date(year, 12, 31),
                                 expected_header=ARCHIVE_HEADERS[sensor])
    except CsvProblem as err:
        problem = f"{member}: {err}"
    except (zipfile.BadZipFile, zlib.error, EOFError) as err:
        problem = f"{member}: corrupt ZIP data ({err})"
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    else:
        tmp.replace(dest)
        return result
    tmp.unlink(missing_ok=True)
    raise ArchiveError(problem)


def open_zip(http_client: Http, url: str) -> zipfile.ZipFile:
    try:
        return zipfile.ZipFile(RangeFile(http_client, url))
    except (zipfile.BadZipFile, EOFError) as err:
        raise ArchiveError(f"server did not return a valid ZIP for {url} ({err})") from None


def fetch_year(http_client: Http, base_url: str, sensor: str, year: int, countries: list[str],
               out_dir: Path, force: bool, log) -> list[str]:
    """Fetch the requested countries for one year; return a list of failure messages."""
    failures: list[str] = []
    todo = []
    for country in countries:
        cached = None if force else find_cached(out_dir, sensor, year, country)
        if cached:
            log(f"{sensor} {year} {country:<24} cached ({cached.name})")
        else:
            todo.append(country)
    if not todo:
        return failures

    url = f"{base_url}/data/country/zips/{sensor}_{year}_all_countries.zip"
    before_req, before_bytes = http_client.requests, http_client.bytes
    zf = open_zip(http_client, url)
    index = country_index(zf.namelist(), sensor, year)
    for country in todo:
        try:
            member, canonical = resolve_member(index, sensor, year, country)
            dest = out_dir / f"{sensor}_{year}_{canonical}.csv"
            if dest.exists() and not force:
                log(f"{sensor} {year} {canonical:<24} cached ({dest.name})")
                continue
            rows, lo, hi = extract(zf, member, dest, sensor=sensor, year=year)
            log(f"{sensor} {year} {canonical:<24} {rows:>8} rows  {lo}..{hi}  fetched")
        except ArchiveError as err:
            failures.append(f"{sensor} {year} {country}: {err}")
    log(f"  ({http_client.requests - before_req} requests, {(http_client.bytes - before_bytes) / 1e6:.1f} MB for {sensor} {year}, "
        f"ZIP is {zf.fp.size / 1e6:.0f} MB)")
    return failures


def list_countries(http_client: Http, base_url: str, sensor: str, year: int) -> list[str]:
    url = f"{base_url}/data/country/zips/{sensor}_{year}_all_countries.zip"
    zf = open_zip(http_client, url)
    prefix = f"{sensor}/{year}/{sensor}_{year}_"
    return sorted(m[len(prefix) : -4] for m in country_index(zf.namelist(), sensor, year).values())


def run(*, sensor: str, years: list[int], countries: list[str], out_dir: Path, base_url: str = BASE_URL,
        force: bool = False, sleep=time.sleep, log=print) -> list[str]:
    """Fetch every year; one bad year/country does not stop the rest. Returns failures."""
    http_client = Http(sleep=sleep)
    failures: list[str] = []
    out_dir.mkdir(parents=True, exist_ok=True)
    lo, hi = SENSORS[sensor]
    for year in years:
        try:
            failures += fetch_year(http_client, base_url, sensor, year, countries, out_dir, force, log)
        except NotPublished:
            failures.append(f"{sensor} {year}: no archive on the server (known range for {sensor}: {lo}-{hi})")
        except ArchiveError as err:
            failures.append(f"{sensor} {year}: {err}")
    return failures


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--years", required=True, help="2001 | 2000-2005 | 2001,2005-2007")
    parser.add_argument("--sensor", choices=sorted(SENSORS), default="modis",
                        help="modis (Terra+Aqua, 2000-2025) or viirs-snpp (2012-2025); NOAA-20/21 are API-only")
    parser.add_argument("--country", nargs="+", default=["Italy"], help="English names; quote names with spaces (default: Italy)")
    parser.add_argument("--out", type=Path, default=Path("data/raw/firms_archive"))
    parser.add_argument("--force", action="store_true", help="re-download files that already exist")
    parser.add_argument("--list-countries", action="store_true", help="print country names available for the first year and exit")
    parser.add_argument("--base-url", default=BASE_URL, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        years = parse_years(args.years)
        if args.list_countries:
            print("\n".join(list_countries(Http(), args.base_url, args.sensor, years[0])))
            return 0
        failures = run(sensor=args.sensor, years=years, countries=args.country, out_dir=args.out,
                       base_url=args.base_url, force=args.force)
    except ArchiveError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1
    if failures:
        print(f"\n{len(failures)} problem(s):", file=sys.stderr)
        for line in failures:
            print(f"  - {line}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
