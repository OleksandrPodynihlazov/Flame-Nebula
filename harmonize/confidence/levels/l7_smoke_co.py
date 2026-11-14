"""L7: smoke and CO above the local background on the event's most active days.

For large events (sum FRP >= L7_MIN_FRP_SUM or >= L7_MIN_HOTSPOTS) in L7 years, on the top 3 days by FRP:
  CO   MOPITT daily 1 deg total column at the event cell > median + 2*MAD of days -15..+15 (event days excluded)
  UVAI OMI daily 1 deg UV aerosol index > 1 and > median + 2*MAD (absorbing aerosol = smoke or dust)
One supporting day supports every hotspot of the event. Regional evidence only (1 deg cells), see spec §5.
"""

import datetime as dt
import math
from collections import defaultdict
from statistics import median

from confidence import config
from confidence.sources import earthdata, http

NAME = "L7"
BASELINE_DAYS = 15
TOP_DAYS = 3
K_MAD = 2.0
MIN_BASELINE = 8
UVAI_MIN = 1.0


def is_anomaly(value, baseline, k=K_MAD, min_n=MIN_BASELINE):
    """True/False, or None when the baseline is too short."""
    if len(baseline) < min_n:
        return None
    med = median(baseline)
    mad = median(abs(b - med) for b in baseline)
    return value > med + k * mad


def _z(value, baseline):
    med = median(baseline)
    mad = median(abs(b - med) for b in baseline) or abs(med) * 1e-9 or 1e-9
    return (value - med) / mad


def run(ctx):
    try:
        earthdata.token()
    except http.SourceDown:
        return {h.key: (0, "n/a:no-token") for h in ctx.hotspots}

    years = set(config.L7_YEARS) | set(ctx.years or ())
    cache = {}

    def value(product, day, cell):
        if not earthdata.covers(product, day):
            return None
        if (product, day) not in cache:
            cache[(product, day)] = earthdata.daily_values(product, day, ctx.cache_dir)
        return cache[(product, day)].get(cell)

    daily_frp = defaultdict(lambda: defaultdict(float))
    for h in ctx.hotspots:
        daily_frp[ctx.event_of.get(h.key)][h.date] += h.frp or 0.0

    event_result = {}
    for eid, ev in ctx.events.items():
        if ev.start.year not in years and ev.end.year not in years:
            event_result[eid] = (0, "n/a:not-in-l7-years")
            continue
        if ev.frp_sum < config.L7_MIN_FRP_SUM and ev.n < config.L7_MIN_HOTSPOTS:
            event_result[eid] = (0, "n/a:small-event")
            continue
        cell = (math.floor(ev.lat) + 0.5, math.floor(ev.lon) + 0.5)
        days = sorted(daily_frp[eid], key=lambda d: -daily_frp[eid][d])[:TOP_DAYS]
        reasons, signals = [], {}
        try:
            for product in ("MOPITT", "OMI"):
                for d in days:
                    v = value(product, d, cell)
                    if v is None:
                        continue
                    base = []
                    for off in range(-BASELINE_DAYS, BASELINE_DAYS + 1):
                        b = d + dt.timedelta(days=off)
                        if ev.start <= b <= ev.end:
                            continue
                        bv = value(product, b, cell)
                        if bv is not None:
                            base.append(bv)
                    if not is_anomaly(v, base):
                        continue
                    if product == "MOPITT":
                        z = _z(v, base)
                        reasons.append(f"co:+{z:.1f}")
                        signals["l7_co_z"] = round(z, 1)
                    elif v > UVAI_MIN:
                        reasons.append(f"uvai:{round(v, 2):g}")
                        signals["l7_uvai"] = round(v, 2)
                    else:
                        continue
                    break
        except http.SourceDown:
            event_result[eid] = (0, "n/a:service")
            continue
        ctx.event_signals.setdefault(eid, {}).update(signals)
        event_result[eid] = (1, ",".join(reasons)) if reasons else (0, "smoke:none")

    return {h.key: event_result.get(ctx.event_of.get(h.key), (0, "n/a:no-event")) for h in ctx.hotspots}
