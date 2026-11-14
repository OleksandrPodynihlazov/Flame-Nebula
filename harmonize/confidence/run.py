#!/usr/bin/env python3
"""Fire-confidence ladder CLI.

    python3 harmonize/confidence/run.py run --data-dir data --years all --levels L0-L6 --report-year 2008
    python3 harmonize/confidence/run.py report --data-dir data --report-year 2008
    python3 harmonize/confidence/run.py load-db --data-dir data

Outputs go to <data-dir>/processed/, downloads are cached in <data-dir>/cache/confidence/.
Spec: docs/superpowers/specs/2026-11-14-fire-confidence-design.md
"""

import argparse
import csv
import importlib
import json
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from confidence import config, events, output, records, report, score  # noqa: E402
from confidence.levels import Ctx  # noqa: E402

LEVEL_MODULES = {"L0": "l0_product", "L1": "l1_nonfire", "L2": "l2_consistency", "L3": "l3_cross_sensor",
                 "L4": "l4_landcover", "L5": "l5_mcd64", "L6": "l6_effis", "L7": "l7_smoke_co",
                 "L8": "l8_landsat", "L9": "l9_worldview"}
ALL_LEVELS = list(LEVEL_MODULES)


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
        return ALL_LEVELS[ALL_LEVELS.index(a):ALL_LEVELS.index(b) + 1]
    return [p.strip() for p in text.split(",")]


def paths(data_dir):
    out = Path(data_dir) / "processed"
    return {"hotspots": out / "hotspot_confidence.csv", "events": out / "fire_events.csv",
            "md": out / "confidence_report.md", "json": out / "confidence_report.json",
            "cache": Path(data_dir) / "cache" / "confidence"}


def run_levels(ctx, names, refresh=()):
    signals = {}
    for name in names:
        if name in refresh:
            shutil.rmtree(ctx.cache_dir / name, ignore_errors=True)
        try:
            mod = importlib.import_module(f"confidence.levels.{LEVEL_MODULES[name]}")
        except ModuleNotFoundError as e:
            if e.name and e.name.endswith(LEVEL_MODULES[name]):
                print(f"{name}: not implemented, skipped", flush=True)
                continue
            raise
        t = time.time()
        out = mod.run(ctx)
        if out:
            signals[name] = out
        sup = sum(1 for s, _ in out.values() if s > 0)
        ref = sum(1 for s, _ in out.values() if s < 0)
        na = sum(1 for _, r in out.values() if r.startswith("n/a"))
        print(f"{name}: {time.time() - t:.1f}s  support={sup} refute={ref} n/a={na}", flush=True)
    return signals


def write_report(p, rows, event_rows, year, missing=None):
    md, data = report.build(rows, event_rows, year, missing)
    p["md"].write_text(md)
    p["json"].write_text(json.dumps(data, indent=2, default=str))
    print(f"report: {p['md']}")


def cmd_run(args):
    p = paths(args.data_dir)
    all_hotspots, missing = records.load(args.data_dir, None)
    years = parse_years(args.years)
    scored = all_hotspots if years is None else [h for h in all_hotspots if h.date.year in years]
    event_of = events.cluster(scored)
    ev = events.summarize(scored, event_of)
    print(f"scoring {len(scored)} hotspots in {len(ev)} events", flush=True)
    ctx = Ctx(hotspots=scored, by_key={h.key: h for h in scored}, event_of=event_of, events=ev,
              cache_dir=p["cache"], years=years, all_hotspots_for_masks=all_hotspots)
    signals = run_levels(ctx, parse_levels(args.levels), set(args.refresh))
    results = score.combine(signals) if signals else {}
    for h in scored:
        results.setdefault(h.key, score.combine({"L0": {h.key: (0, "")}})[h.key])
    rows = output.hotspot_rows(scored, results, event_of, ctx.extra_cols)
    erows = output.event_rows(ev, ctx.event_signals)
    output.write_csv(p["hotspots"], rows, output.HOTSPOT_COLUMNS)
    output.write_csv(p["events"], erows, output.event_columns(erows))
    print(f"wrote {p['hotspots']} ({len(rows)} rows), {p['events']} ({len(erows)} events)")
    write_report(p, rows, erows, args.report_year, missing)
    return 0


def cmd_report(args):
    p = paths(args.data_dir)
    with p["hotspots"].open(newline="") as f:
        rows = list(csv.DictReader(f))
    with p["events"].open(newline="") as f:
        erows = list(csv.DictReader(f))
    write_report(p, rows, erows, args.report_year)
    return 0


def cmd_load_db(args):
    from confidence import load_db
    return load_db.main(paths(args.data_dir)["hotspots"])


def build_parser():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("run", "report", "load-db"):
        s = sub.add_parser(name)
        s.add_argument("--data-dir", type=Path, default=Path("data"))
        s.add_argument("--years", default="all", help="all | 2008 | 2007,2008 | 2012-2025")
        s.add_argument("--levels", default="L0-L9", help="L0-L6 | L0,L1,L3")
        s.add_argument("--report-year", type=int, default=2008)
        s.add_argument("--refresh", action="append", default=[], help="level whose cache to rebuild, e.g. L6")
    return ap


def main(argv=None):
    args = build_parser().parse_args(argv)
    return {"run": cmd_run, "report": cmd_report, "load-db": cmd_load_db}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
