"""L2: self-consistency of the fire event the hotspot belongs to.

Supports when the event has >= L2_MIN_HOTSPOTS detections, spans >= L2_MIN_DAYS dates, or was seen on >= 2
distinct overpasses (e.g. Terra and Aqua, or two VIIRS passes). An isolated single detection is 0, not -1.
"""

from collections import defaultdict

from confidence import config

NAME = "L2"


def run(ctx):
    passes = defaultdict(set)
    days = defaultdict(set)
    for h in ctx.hotspots:
        eid = ctx.event_of.get(h.key)
        passes[eid].add((h.platform, h.date, h.hhmm))
        days[eid].add(h.date)
    out = {}
    for h in ctx.hotspots:
        eid = ctx.event_of.get(h.key)
        ev = ctx.events.get(eid)
        n = ev.n if ev else 1
        n_days, n_passes = len(days[eid]), len(passes[eid])
        ok = n >= config.L2_MIN_HOTSPOTS or n_days >= config.L2_MIN_DAYS or n_passes >= 2
        reason = f"event:n={n},days={n_days},passes={n_passes}"
        out[h.key] = (1, reason) if ok else (0, "isolated")
    return out
