#!/usr/bin/env python3
"""Fetch raw FIRMS Area-API hotspots (CSV), chunked, resumable, stdlib only.

For WHOLE COUNTRIES by year (no key needed) use the sibling firms_archive_fetch.py; this
script is for an arbitrary bbox / date range, recent days and NRT.

RAW LAYER ONLY: rows are saved exactly as FIRMS returns them (sensor-specific column
names, `T`/`A`/`N20` satellite codes, no `type` in NRT). Mapping to the canonical record
happens later in ingest, once the DB contract is frozen (research/02-field-reference.md §C).

Setup (the key is read from the environment only, never from argv, never printed):
    export FIRMS_MAP_KEY=...        # free key: https://firms.modaps.eosdis.nasa.gov/api/area/

Usage:
    python3 ingest/firms_api_fetch.py availability            # min/max date per product
    python3 ingest/firms_api_fetch.py status                  # transactions used / limit
    python3 ingest/firms_api_fetch.py fetch --source VIIRS_SNPP_NRT \
        --start 2026-10-01 --end 2026-11-10                   # Italy bbox by default

Facts this relies on (research/01-data-access.md §B):
  * DAY_RANGE is 1..5, so a date range is split into <=5-day requests.
  * Request for DATE covers [DATE .. DATE+DAY_RANGE-1]; dates are GMT.
  * 5000 transactions / 10 min per key. Finished chunks are cached on disk, so after a
    limit error you just re-run the same command later and it continues.
  * RT/URT rows are replaced when NRT is processed or after 6 h, so the newest day is
    not stable. Re-fetch it with --force before relying on it.
  * AREA is `west,south,east,north`. LANDSAT_NRT is omitted: US/Canada only.
"""

import argparse
import datetime as dt
import http.client
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from firms_csv import CsvProblem, check_lines

BASE_URL = "https://firms.modaps.eosdis.nasa.gov"
ITALY_BBOX = "6.76,35.49,18.52,46.90"  # research/04-italy-aoi.md §A
MAX_DAY_RANGE = 5
KEY_ENV = "FIRMS_MAP_KEY"
USER_AGENT = "flame-nebula-ingest/0.1"
SOURCES = (
    "MODIS_NRT",
    "MODIS_SP",
    "VIIRS_SNPP_NRT",
    "VIIRS_SNPP_SP",
    "VIIRS_NOAA20_NRT",
    "VIIRS_NOAA20_SP",
    "VIIRS_NOAA21_NRT",
    "VIIRS_NOAA21_SP",
)


class FirmsError(RuntimeError):
    """Expected failure: bad input, bad key, limit hit, unusable response."""


def redact(text: str, key: str) -> str:
    return text.replace(key, "***") if key else text


def parse_bbox(text: str) -> tuple[str, str]:
    """Validate `west,south,east,north` (or `world`); return (api_value, file_slug)."""
    if text.strip().lower() == "world":
        return "-180,-90,180,90", "world"
    try:
        w, s, e, n = (float(p) for p in text.split(","))
    except ValueError:
        raise FirmsError(f"bbox must be 'west,south,east,north' or 'world', got {text!r}") from None
    if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
        raise FirmsError(f"bbox out of range or not west<east, south<north: {text!r}")
    api = ",".join(str(v) for v in (w, s, e, n))
    return api, api.replace(",", "_")


def plan_chunks(start: dt.date, end: dt.date, step: int = MAX_DAY_RANGE):
    """Yield (first_day, n_days) windows covering start..end inclusive, n_days <= step."""
    day = start
    while day <= end:
        n = min(step, (end - day).days + 1)
        yield day, n
        day += dt.timedelta(days=n)


def get_key() -> str:
    key = os.environ.get(KEY_ENV, "").strip()
    if not key:
        raise FirmsError(
            f"{KEY_ENV} is not set. Get a free key at "
            "https://firms.modaps.eosdis.nasa.gov/api/area/ ('Get MAP_KEY'), then: "
            f"export {KEY_ENV}=..."
        )
    if not re.fullmatch(r"[A-Za-z0-9]{8,64}", key):
        raise FirmsError(f"{KEY_ENV} must be alphanumeric (8-64 chars); refusing to put it in a URL")
    return key


def http_get(url: str, *, key: str, retries: int = 5, timeout: int = 60, sleep=time.sleep) -> bytes:
    """GET with retry on network errors, 429 and 5xx. Other 4xx fail immediately."""
    last = "no attempt made"
    for attempt in range(retries):
        if attempt:
            sleep(min(2**attempt, 30))
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as err:
            body = err.read().decode("utf-8", "replace").strip()[:300]
            err.close()
            if err.code == 429 or err.code >= 500:
                last = f"HTTP {err.code}: {body}"
                continue
            raise FirmsError(redact(f"HTTP {err.code}: {body}", key)) from None
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as err:
            last = f"{type(err).__name__}: {err}"
    raise FirmsError(redact(f"gave up after {retries} attempts, last error: {last}", key))


def check_body(body: bytes, key: str, first_day: dt.date, last_day: dt.date) -> int:
    """Return the data-row count; raise unless the body is a complete FIRMS CSV whose every
    row has acq_date inside [first_day, last_day] (so chunks never overlap or leak)."""
    text = body.decode("utf-8", "replace")
    try:
        rows, _, _ = check_lines(text.splitlines(keepends=True), first_day=first_day, last_day=last_day)
    except CsvProblem as err:
        raise FirmsError(redact(f"bad response: {err}; body starts {text.strip()[:120]!r}", key)) from None
    return rows


def write_atomic(path: Path, data: bytes) -> None:
    tmp = path.with_name(path.name + ".part")
    tmp.write_bytes(data)
    tmp.replace(path)


def fetch_range(
    *,
    key: str,
    source: str,
    bbox: str,
    start: dt.date,
    end: dt.date,
    out_dir: Path,
    base_url: str = BASE_URL,
    force: bool = False,
    sleep=time.sleep,
    log=print,
) -> Path:
    """Download start..end (inclusive) in <=5-day chunks; return the merged CSV path."""
    if source not in SOURCES:
        raise FirmsError(f"unknown source {source!r}; choose one of {', '.join(SOURCES)}")
    if end < start:
        raise FirmsError(f"--end {end} is before --start {start}")
    api_bbox, slug = parse_bbox(bbox)
    today = dt.datetime.now(dt.timezone.utc).date()
    if end >= today:
        log(f"warning: {end} is today or later (GMT); recent rows are unstable, re-run with --force later")

    chunk_dir = out_dir / "chunks" / source / slug
    chunk_dir.mkdir(parents=True, exist_ok=True)
    plan = list(plan_chunks(start, end))
    paths: list[Path] = []
    total = 0
    for i, (day, n) in enumerate(plan, 1):
        path = chunk_dir / f"{source}_{day}_{n}d.csv"
        paths.append(path)
        last = day + dt.timedelta(days=n - 1)
        if path.exists() and not force:
            try:
                rows, how = check_body(path.read_bytes(), key, day, last), "cached"
            except FirmsError as err:
                raise FirmsError(f"cached chunk {path} is invalid ({err}); delete it or re-run with --force") from None
        else:
            url = f"{base_url}/api/area/csv/{key}/{source}/{api_bbox}/{n}/{day}"
            body = http_get(url, key=key, sleep=sleep)
            rows, how = check_body(body, key, day, last), "fetched"
            write_atomic(path, body)
        total += rows
        log(f"[{i}/{len(plan)}] {day} +{n}d  {rows:>6} rows  {how}")

    merged = out_dir / f"{source}_{slug}_{start}_{end}.csv"
    header = None
    parts: list[bytes] = []
    for path in paths:
        # Chunks may lack a final newline (or use CRLF): compare and emit bare lines, re-terminated below.
        lines = [line for line in path.read_bytes().splitlines() if line]
        if not lines:
            continue
        if header is None:
            header = lines[0]
            parts.append(header)
        elif lines[0] != header:
            raise FirmsError(f"CSV header changed between chunks ({path.name}); refusing to merge")
        parts.extend(lines[1:])
    write_atomic(merged, b"".join(line + b"\n" for line in parts))
    log(f"done: {total} rows -> {merged}")
    return merged


def cmd_availability(key: str, base_url: str, sensor: str) -> None:
    if not re.fullmatch(r"[A-Za-z0-9_]+", sensor):
        raise FirmsError(f"bad sensor name {sensor!r}")
    body = http_get(f"{base_url}/api/data_availability/csv/{key}/{sensor}", key=key)
    print(body.decode("utf-8", "replace").strip())


def cmd_status(key: str, base_url: str) -> None:
    body = http_get(f"{base_url}/mapserver/mapkey_status/?MAP_KEY={key}", key=key)
    print(body.decode("utf-8", "replace").strip())


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base-url", default=BASE_URL, help=argparse.SUPPRESS)
    sub = parser.add_subparsers(dest="cmd", required=True)

    fetch = sub.add_parser("fetch", help="download a date range as raw CSV")
    fetch.add_argument("--source", required=True, choices=SOURCES, metavar="SOURCE",
                       help="one of: " + ", ".join(SOURCES) + " (SP = standard quality with `type`, NRT = latest days, no `type`)")
    fetch.add_argument("--start", required=True, type=dt.date.fromisoformat, help="YYYY-MM-DD (GMT)")
    fetch.add_argument("--end", required=True, type=dt.date.fromisoformat, help="YYYY-MM-DD (GMT), inclusive")
    fetch.add_argument("--bbox", default=ITALY_BBOX, help="west,south,east,north or 'world' (default: Italy)")
    fetch.add_argument("--out", type=Path, default=Path("data/raw/firms_api"))
    fetch.add_argument("--force", action="store_true", help="re-download chunks that already exist")

    avail = sub.add_parser("availability", help="min/max date per product (needs key)")
    avail.add_argument("--sensor", default="ALL")
    sub.add_parser("status", help="transactions used / limit for the key")

    args = parser.parse_args(argv)
    try:
        key = get_key()
        if args.cmd == "fetch":
            fetch_range(key=key, source=args.source, bbox=args.bbox, start=args.start, end=args.end,
                        out_dir=args.out, base_url=args.base_url, force=args.force)
        elif args.cmd == "availability":
            cmd_availability(key, args.base_url, args.sensor)
        else:
            cmd_status(key, args.base_url)
    except FirmsError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
