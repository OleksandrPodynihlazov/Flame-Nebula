#!/usr/bin/env python3
"""Download the geoBoundaries CGAZ boundary files (ADM0, ADM1, ADM2; ~1.3 GB) for load_regions.py.

Stdlib only. Complete files are skipped, partial ones resume (HTTP Range); GitHub resets
connections now and then, so every file gets several attempts.

    python3 ingest/boundaries_fetch.py                  # -> data/raw/boundaries/

Licence: CC BY 4.0, geoBoundaries (www.geoboundaries.org) — credit "Boundaries: geoBoundaries".
"""

import argparse
import http.client
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = "https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/CGAZ"
FILES = [f"geoBoundariesCGAZ_ADM{lvl}.geojson" for lvl in (0, 1, 2)]
REPO = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO / "data" / "raw" / "boundaries"
USER_AGENT = "flame-nebula-ingest/0.1"
ATTEMPTS = 8
CHUNK = 1 << 20
NET_ERRORS = (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException)


def resume_offset(local_size, remote_size):
    """Byte offset to download from, or None if the local file is already complete."""
    if local_size is None or local_size > remote_size:
        return 0
    return None if local_size == remote_size else local_size


def http_remote_size(url):
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return int(resp.headers["Content-Length"])


def http_download(url, dest, offset):
    """Append the bytes from `offset` to dest (truncates first when offset is 0)."""
    headers = {"User-Agent": USER_AGENT}
    if offset:
        headers["Range"] = f"bytes={offset}-"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        if offset and resp.status != 206:
            offset = 0                          # server ignored Range: start over
        with open(dest, "ab" if offset else "wb") as fh:
            while chunk := resp.read(CHUNK):
                fh.write(chunk)


def fetch(url, dest, remote_size, download):
    size = None
    for attempt in range(ATTEMPTS):
        if attempt:
            time.sleep(min(2 ** attempt, 30))
        try:
            size = remote_size(url)
            local = dest.stat().st_size if dest.exists() else None
            offset = resume_offset(local, size)
            if offset is None:
                return "complete, skipped" if attempt == 0 else "downloaded"
            download(url, dest, offset)
            if dest.stat().st_size == size:
                return "downloaded"
        except NET_ERRORS as err:
            print(f"  {dest.name}: attempt {attempt + 1} failed: {err}")
    raise RuntimeError(f"{dest.name}: gave up after {ATTEMPTS} attempts")


def main(argv=None, remote_size=http_remote_size, download=http_download):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="output folder (default data/raw/boundaries)")
    args = ap.parse_args(argv)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    failed = 0
    for name in FILES:
        try:
            status = fetch(f"{BASE_URL}/{name}", out / name, remote_size, download)
        except RuntimeError as err:
            failed += 1
            print(f"{name}: FAILED: {err}")
            continue
        print(f"{name}: {status}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
