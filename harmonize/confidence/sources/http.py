"""HTTP GET/POST with exponential backoff. Any final failure raises SourceDown so a level can mark rows n/a."""

import time
import urllib.error
import urllib.request

USER_AGENT = "flame-nebula-confidence/1.0 (research; NASA Space Apps 2026)"


class SourceDown(Exception):
    pass


def get(url, *, headers=None, data=None, retries=4, timeout=60, backoff=1.0):
    hdrs = {"User-Agent": USER_AGENT, **(headers or {})}
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers=hdrs, method="POST" if data else "GET")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code < 500 and e.code != 429:
                raise SourceDown(f"http {e.code}: {url}") from e
        except (urllib.error.URLError, ConnectionError, TimeoutError, OSError) as e:
            last = e
        if attempt < retries - 1:
            time.sleep(backoff * 2 ** attempt)
    raise SourceDown(f"{type(last).__name__}: {last} ({url})")
