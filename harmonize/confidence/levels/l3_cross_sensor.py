"""L3: an independent thermal sensor saw the same fire (MODIS <-> VIIRS within L3_MAX_KM and L3_MAX_HOURS)."""

import datetime as dt
import math
from collections import defaultdict

from confidence import config
from confidence.events import CELL_DEG, haversine_km

NAME = "L3"
VIIRS_START = dt.date.fromisoformat(config.VIIRS_START)


def _cell(lat, lon):
    return (math.floor(lat / CELL_DEG), math.floor(lon / CELL_DEG))


def run(ctx):
    index = {"MODIS": defaultdict(list), "VIIRS": defaultdict(list)}
    for h in ctx.all_hotspots_for_masks:
        index[h.sensor][(h.date.toordinal(), _cell(h.lat, h.lon))].append(h)
    max_s = config.L3_MAX_HOURS * 3600
    d_lat = math.ceil(config.L3_MAX_KM / 111.0 / CELL_DEG)
    d_lon = math.ceil(config.L3_MAX_KM / (111.0 * math.cos(math.radians(60))) / CELL_DEG)
    out = {}
    for h in ctx.hotspots:
        if h.date < VIIRS_START:
            out[h.key] = (0, "n/a:no-viirs-era")
            continue
        other = index["VIIRS" if h.sensor == "MODIS" else "MODIS"]
        cy, cx = _cell(h.lat, h.lon)
        day = h.date.toordinal()
        match = None
        for dd in (0, -1, 1):
            for dy in range(-d_lat, d_lat + 1):
                for dx in range(-d_lon, d_lon + 1):
                    for o in other.get((day + dd, (cy + dy, cx + dx)), ()):
                        if (abs((o.ts - h.ts).total_seconds()) <= max_s
                                and haversine_km(h.lat, h.lon, o.lat, o.lon) <= config.L3_MAX_KM):
                            match = o
                            break
                    if match:
                        break
                if match:
                    break
            if match:
                break
        out[h.key] = (1, f"xsensor:{match.platform}") if match else (0, "xsensor:none")
    return out
