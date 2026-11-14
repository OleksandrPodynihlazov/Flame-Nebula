"""Evidence levels. Each module has NAME and run(ctx) -> {hotspot key: (signal, reason)}.

signal: +1 supports a real landscape fire, -1 refutes it, 0 no information. A row a level could not evaluate
gets (0, 'n/a:<why>'). Absence of evidence is never -1.
"""

from dataclasses import dataclass, field
from pathlib import Path

from confidence import config


@dataclass
class Ctx:
    hotspots: list                 # rows being scored
    by_key: dict                   # key -> Hotspot
    event_of: dict                 # key -> event id
    events: dict                   # event id -> Event
    cache_dir: Path                # <data-dir>/cache/confidence
    years: list | None             # years being scored (None = all on disk)
    all_hotspots_for_masks: list   # every hotspot on disk, for spatial masks and cross-sensor lookups
    event_signals: dict = field(default_factory=dict)   # event id -> {column: value}, written by event levels
    extra_cols: dict = field(default_factory=dict)      # key -> {column: value}, e.g. worldview_url (L9)
    bbox: tuple = config.ITALY_BBOX                     # (w, s, e, n) of the country being scored
    country: str = "Italy"


def na(ctx, why):
    """Every scored row gets (0, 'n/a:<why>')."""
    return {h.key: (0, f"n/a:{why}") for h in ctx.hotspots}
