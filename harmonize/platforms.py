"""The satellites we harmonize and the junctions between them. The one place to add a satellite.

  * PLATFORMS: first/last usable day and preference (1 = best). The reference platform of a month is
    the most preferred one that covers the whole month, so S-NPP (the unit) wins wherever it flew and
    NOAA-20 takes over after S-NPP ended (2026-11-02).
  * JUNCTIONS: pairs that flew together, with the pre-drift window their factor is fitted on
    (research/07 §8, measurement V3). factor = newer / older.
  * chain_path(): how a platform reaches the unit. Older platforms multiply the junction factors on
    the way (Terra = J1 x J2); newer ones divide (NOAA-20 = 1 / J3).

A new satellite of the same family = one Platform + one Junction with a platform it overlapped.
"""

import datetime as dt
from collections import deque, namedtuple

D = dt.date
Platform = namedtuple("Platform", "satellite first_day last_day preference")
Junction = namedtuple("Junction", "name older newer start end")

UNIT = "N"
PLATFORMS = (
    Platform("N", D(2012, 1, 20), D(2026, 11, 2), 1),   # VIIRS guide §4 effective start; end of S-NPP
    Platform("N20", D(2018, 4, 1), None, 2),           # FIRMS data_availability: VIIRS_NOAA20_SP from 2018-04-01
    Platform("Aqua", D(2002, 7, 4), None, 3),          # first Aqua day in the archive
    Platform("Terra", D(2000, 11, 1), None, 4),        # FIRMS archive start
)
JUNCTIONS = (
    Junction("J1", "Terra", "Aqua", D(2003, 1, 1), D(2021, 12, 31)),
    Junction("J2", "Aqua", "N", D(2012, 1, 20), D(2021, 12, 31)),
    Junction("J3", "N", "N20", D(2018, 4, 1), D(2026, 11, 1)),   # last full S-NPP day
)


def chain_path(satellite, unit=UNIT, junctions=JUNCTIONS):
    """[(junction name, +1 multiply | -1 divide)] from `satellite` to the unit. KeyError if unreachable."""
    known = {p.satellite for p in PLATFORMS}
    if satellite not in known:
        raise KeyError(satellite)
    # walk from the unit outwards; a step older->newer seen from the unit's side
    paths = {unit: []}
    todo = deque([unit])
    while todo:
        cur = todo.popleft()
        for j in junctions:
            if j.newer == cur and j.older not in paths:     # older platform: multiply by this factor
                paths[j.older] = [(j.name, 1)] + paths[cur]
                todo.append(j.older)
            elif j.older == cur and j.newer not in paths:   # newer platform: divide by this factor
                paths[j.newer] = [(j.name, -1)] + paths[cur]
                todo.append(j.newer)
    if satellite not in paths:
        raise KeyError(satellite)
    return paths[satellite]
