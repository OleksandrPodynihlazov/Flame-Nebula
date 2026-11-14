"""Microsoft Planetary Computer: STAC search and SAS signing (no account needed)."""

import datetime as dt
import json

from confidence.sources import http

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
SAS = "https://planetarycomputer.microsoft.com/api/sas/v1/token"
_tokens = {}  # collection -> (token, expiry datetime)


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


def sign(href, collection):
    now = dt.datetime.now(dt.timezone.utc)
    cached = _tokens.get(collection)
    if not cached or cached[1] - now < dt.timedelta(minutes=5):
        d = json.loads(http.get(f"{SAS}/{collection}"))
        expiry = dt.datetime.fromisoformat(d["msft:expiry"].replace("Z", "+00:00"))
        _tokens[collection] = cached = (d["token"], expiry)
    return f"{href}?{cached[0]}"
