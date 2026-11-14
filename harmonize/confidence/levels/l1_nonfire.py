"""L1: known non-fire heat sources — volcanoes, persistent static sources, offshore platforms.

Static mask (research/03 §3, decisions D3/I6): a 0.01 deg cell is static when it has detections on
>= STATIC_MIN_DAYS distinct days in >= STATIC_MIN_YEARS separate calendar years. Masks are built from every
hotspot on disk (S-NPP and MODIS separately) and applied to all sensors and years, with a 3x3 cell
neighbourhood to absorb geolocation jitter.
"""

import math
from collections import defaultdict

from confidence import config
from confidence.events import haversine_km

NAME = "L1"


def cell(lat, lon):
    return (math.floor(lat * 100), math.floor(lon * 100))


def build_static_mask(hotspots, sensor, min_days=config.STATIC_MIN_DAYS, min_years=config.STATIC_MIN_YEARS):
    days = defaultdict(set)  # (cell, year) -> dates
    for h in hotspots:
        if h.sensor == sensor:
            days[(cell(h.lat, h.lon), h.date.year)].add(h.date)
    years = defaultdict(int)
    for (c, _year), dates in days.items():
        if len(dates) >= min_days:
            years[c] += 1
    return {c for c, n in years.items() if n >= min_years}


def _volcano(h):
    if h.type == 1:
        return "volcano:type1"
    for name, lat, lon, radius_km in config.VOLCANOES:
        if haversine_km(h.lat, h.lon, lat, lon) <= radius_km:
            return f"volcano:{name}"
    return None


def run(ctx):
    mask = build_static_mask(ctx.all_hotspots_for_masks, "VIIRS") | build_static_mask(ctx.all_hotspots_for_masks, "MODIS")
    out = {}
    for h in ctx.hotspots:
        reason = _volcano(h)
        if reason is None and h.type == 3:
            reason = "offshore"
        if reason is None:
            cy, cx = cell(h.lat, h.lon)
            if any((cy + dy, cx + dx) in mask for dy in (-1, 0, 1) for dx in (-1, 0, 1)):
                reason = "static"
        out[h.key] = (-1, reason) if reason else (0, "")
    return out
