"""Evidence levels. Each module has NAME and run(ctx) -> {hotspot key: (signal, reason)}.

signal: +1 supports a real landscape fire, -1 refutes it, 0 no information. A row a level could not evaluate
gets (0, 'n/a:<why>'). Absence of evidence is never -1.
"""

from dataclasses import dataclass
from pathlib import Path


@dataclass
class Ctx:
    hotspots: list                 # rows being scored
    by_key: dict                   # key -> Hotspot
    event_of: dict                 # key -> event id
    events: dict                   # event id -> Event
    cache_dir: Path                # <data-dir>/cache/confidence
    years: list | None             # years being scored (None = all on disk)
    all_hotspots_for_masks: list   # every hotspot on disk, for spatial masks and cross-sensor lookups


def na(ctx, why):
    """Every scored row gets (0, 'n/a:<why>')."""
    return {h.key: (0, f"n/a:{why}") for h in ctx.hotspots}
