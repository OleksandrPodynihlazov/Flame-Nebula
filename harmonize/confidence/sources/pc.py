"""Microsoft Planetary Computer: STAC search and SAS signing (no account needed).

SAS tokens are requested per storage account + container, taken from the asset href. (A collection token can
belong to a different container than the asset: MCD64A1 COGs live in 'modis-061-cogs', not 'modis-061'.)
"""

import datetime as dt
import json
from urllib.parse import urlparse

from confidence.sources import http

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
SAS = "https://planetarycomputer.microsoft.com/api/sas/v1/token"
_tokens = {}  # (account, container) -> (token, expiry datetime)


def search(collection, bbox, datetime_range, limit=100, query=None):
    body = {"collections": [collection], "bbox": list(bbox), "datetime": datetime_range, "limit": limit}
    if query:
        body["query"] = query
    items = []
    while True:
        page = json.loads(http.get(f"{STAC}/search", data=json.dumps(body).encode(),
                                   headers={"Content-Type": "application/json"}))
        items.extend(page.get("features", []))
        nxt = next((l for l in page.get("links", []) if l.get("rel") == "next"), None)
        if not nxt or not nxt.get("body"):
            return items
        body = {**body, **nxt["body"]}


def sign(href):
    u = urlparse(href)
    account = u.netloc.split(".")[0]
    container = u.path.lstrip("/").split("/")[0]
    now = dt.datetime.now(dt.timezone.utc)
    cached = _tokens.get((account, container))
    if not cached or cached[1] - now < dt.timedelta(minutes=5):
        d = json.loads(http.get(f"{SAS}/{account}/{container}"))
        expiry = dt.datetime.fromisoformat(d["msft:expiry"].replace("Z", "+00:00"))
        _tokens[(account, container)] = cached = (d["token"], expiry)
    return f"{href}?{cached[0]}"
