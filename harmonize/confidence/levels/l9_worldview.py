"""L9: NASA Worldview before/after link for a human check. No signal; fills ctx.extra_cols['worldview_url'].

URL parameters: https://github.com/nasa-gibs/worldview/blob/main/doc/url_parameters.md
A state = detection day (smoke in true colour, fresh scar in 7-2-1); B state = 10 days earlier; swipe compare.
"""

import datetime as dt
from urllib.parse import urlencode

NAME = "L9"
BASE = "https://worldview.earthdata.nasa.gov/"
HALF_DEG = 0.25
BEFORE_DAYS = 10


def _layers(h):
    p = "MODIS_Terra" if h.platform == "terra" else "MODIS_Aqua"
    return ",".join([
        "MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth(hidden)",
        "MOPITT_CO_Daily_Total_Column_Day(hidden)",
        f"{p}_CorrectedReflectance_Bands721",
        f"{p}_CorrectedReflectance_TrueColor(hidden)",
    ])


def _t(d):
    return f"{d.isoformat()}-T00:00:00Z"


def _deg(x):
    return f"{round(x, 4):g}"


def url(h):
    layers = _layers(h)
    params = {
        "v": ",".join(_deg(x) for x in (h.lon - HALF_DEG, h.lat - HALF_DEG, h.lon + HALF_DEG, h.lat + HALF_DEG)),
        "l": layers,
        "t": _t(h.date),
        "l1": layers,
        "t1": _t(h.date - dt.timedelta(days=BEFORE_DAYS)),
        "ca": "true",
        "cm": "swipe",
    }
    return BASE + "?" + urlencode(params, safe=",():")


def run(ctx):
    for h in ctx.hotspots:
        ctx.extra_cols.setdefault(h.key, {})["worldview_url"] = url(h)
    return {}
