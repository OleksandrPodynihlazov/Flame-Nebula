#!/usr/bin/env python3
"""Fire-confidence ladder CLI.

    python3 harmonize/confidence/run.py run --data-dir data --years all --levels L0-L6 --report-year 2008
    python3 harmonize/confidence/run.py report --data-dir data --report-year 2008
    python3 harmonize/confidence/run.py load-db --data-dir data

Spec: docs/superpowers/specs/2026-11-14-fire-confidence-design.md
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from confidence import config, records  # noqa: E402


def parse_years(text):
    if text in (None, "", "all"):
        return None
    years = []
    for part in text.split(","):
        if "-" in part:
            a, b = part.split("-")
            years.extend(range(int(a), int(b) + 1))
        else:
            years.append(int(part))
    return sorted(set(years))


def parse_levels(text):
    if "-" in text and "," not in text:
        a, b = text.split("-")
        order = list(config.LEVEL_ORDER) + ["L9"]
        return order[order.index(a):order.index(b) + 1]
    return [p.strip() for p in text.split(",")]


def build_parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("run", "report", "load-db"):
        s = sub.add_parser(name)
        s.add_argument("--data-dir", type=Path, default=Path("data"))
        s.add_argument("--years", default="all", help="all | 2008 | 2007,2008 | 2012-2025")
        s.add_argument("--levels", default="L0-L9", help="L0-L6 | L0,L1,L3")
        s.add_argument("--report-year", type=int, default=2008)
        s.add_argument("--refresh", action="append", default=[], help="level whose cache to rebuild")
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    hotspots, missing = records.load(args.data_dir, parse_years(args.years))
    print(f"loaded {len(hotspots)} hotspots; missing years: {missing}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
