"""NASA Earthdata: find daily L3 granules via CMR (public), download with a bearer token, extract Italy 1-degree cells.

Token: env EARTHDATA_TOKEN (Earthdata Login -> Generate Token). Never stored in the repo.
Products (verified in CMR 2026-11-14):
  MOPITT  MOP03J v10 (LARC_CLOUD), daily 1 deg CO total column, 2000-03-03 .. 2025-02-01
  OMI     OMAERUVd v003 (GES_DISC), daily 1 deg UV aerosol index, 2004-10-01 ..
Downloaded files are deleted after the Italy cells are cached as JSON.
"""

import datetime as dt
import json
import math
import os
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

from confidence import config
from confidence.sources import http

CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"
PRODUCTS = {
    "MOPITT": {"short_name": "MOP03J", "version": "10", "start": dt.date(2000, 3, 3), "end": dt.date(2025, 2, 1)},
    "OMI": {"short_name": "OMAERUVd", "version": "003", "start": dt.date(2004, 10, 1), "end": None},
}


def token():
    t = os.environ.get("EARTHDATA_TOKEN", "").strip()
    if not t:
        raise http.SourceDown("no-token")
    return t


def covers(product, day):
    p = PRODUCTS[product]
    return p["start"] <= day and (p["end"] is None or day <= p["end"])


def italy_cells():
    w, s, e, n = config.ITALY_BBOX
    return [(lat + 0.5, lon + 0.5) for lat in range(math.floor(s), math.ceil(n))
            for lon in range(math.floor(w), math.ceil(e))]


class DropAuthOnRedirect(urllib.request.HTTPRedirectHandler):
    """Keep the bearer token on same-host redirects only (S3 signed URLs reject a second auth mechanism)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new is not None and urllib.parse.urlparse(newurl).netloc != urllib.parse.urlparse(req.full_url).netloc:
            new.remove_header("Authorization")
        return new


def download(url, dest):
    opener = urllib.request.build_opener(DropAuthOnRedirect(), urllib.request.HTTPCookieProcessor())

    def _get():
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token()}",
                                                   "User-Agent": http.USER_AGENT})
        with opener.open(req, timeout=300) as resp, open(dest, "wb") as f:
            while chunk := resp.read(1 << 20):
                f.write(chunk)

    try:
        http.with_retries(_get, retries=4, delay=2.0, retry_on=(OSError,))
    except urllib.error.HTTPError as e:
        raise http.SourceDown(f"http {e.code}: {url}") from e
    except OSError as e:
        raise http.SourceDown(f"{type(e).__name__}: {e}") from e


def granule_url(product, day, cache_dir):
    path = Path(cache_dir) / "L7" / "cmr" / f"{product}_{day.isoformat()}.json"
    if path.exists():
        return json.loads(path.read_text())["url"]
    p = PRODUCTS[product]
    q = (f"{CMR}?short_name={p['short_name']}&version={p['version']}&page_size=5"
         f"&temporal={day.isoformat()}T00:00:00Z,{day.isoformat()}T23:59:59Z")
    entries = json.loads(http.get(q, retries=6))["feed"]["entry"]
    url = ""
    for e in entries:
        for link in e.get("links", []):
            h = link.get("href", "")
            if h.startswith("https://") and h.endswith(".he5") and "opendap" not in h:
                url = h
                break
        if url:
            break
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"url": url}))
    return url


def _find(f, suffix):
    found = []
    f.visititems(lambda name, obj: found.append(name) if name.endswith(suffix) and hasattr(obj, "shape") else None)
    return f[found[0]][()] if found else None


def _grid_value(arr, lat_c, lon_c, lats, lons):
    ilat = int(np.argmin(np.abs(lats - lat_c)))
    ilon = int(np.argmin(np.abs(lons - lon_c)))
    return float(arr[ilon, ilat]) if arr.shape == (len(lons), len(lats)) else float(arr[ilat, ilon])


def read_cells(product, path, cells):
    import h5py
    with h5py.File(path, "r") as f:
        lats = _find(f, "/Latitude")
        lons = _find(f, "/Longitude")
        lats = np.arange(-89.5, 90, 1.0) if lats is None or np.ndim(lats) != 1 else np.asarray(lats)
        lons = np.arange(-179.5, 180, 1.0) if lons is None or np.ndim(lons) != 1 else np.asarray(lons)
        if product == "MOPITT":
            layers = [_find(f, "RetrievedCOTotalColumnDay"), _find(f, "RetrievedCOTotalColumnNight")]
        else:
            layers = [_find(f, "/UVAerosolIndex")]
    out = {}
    for c in cells:
        vals = []
        for arr in layers:
            if arr is None:
                continue
            v = _grid_value(arr, c[0], c[1], lats, lons)
            if math.isfinite(v) and abs(v) < 1e25 and (product != "MOPITT" or v > 0):
                vals.append(v)
        if vals:
            out[c] = sum(vals) / len(vals)
    return out


def daily_values(product, day, cache_dir):
    """{(lat_c, lon_c): value} for Italy 1-degree cells on that day; {} when there is no granule."""
    path = Path(cache_dir) / "L7" / product / f"{day.isoformat()}.json"
    if path.exists():
        return {tuple(map(float, k.split(","))): v for k, v in json.loads(path.read_text()).items()}
    url = granule_url(product, day, cache_dir)
    vals = {}
    if url:
        with tempfile.TemporaryDirectory() as d:
            tmp = Path(d) / "g.he5"
            download(url, tmp)
            vals = read_cells(product, tmp, italy_cells())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({f"{k[0]},{k[1]}": v for k, v in vals.items()}))
    return vals
