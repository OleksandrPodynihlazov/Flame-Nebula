"""Jury report (Markdown + JSON) built from CSV-shaped rows, so it can be regenerated from the CSV alone."""

from collections import Counter, defaultdict

from confidence import config

LEVEL_TITLES = {
    "L0": "Product confidence (MODIS 0-100 / VIIRS l-n-h)",
    "L1": "Known non-fire: volcano, persistent static source, offshore",
    "L2": "Self-consistency of the fire event (size, days, overpasses)",
    "L3": "Independent thermal sensor (VIIRS <-> MODIS)",
    "L4": "Land cover under the point (ESA CCI LC)",
    "L5": "MODIS burn scar MCD64A1 (partial independence)",
    "L6": "EU burned-area polygon (EFFIS)",
    "L7": "Smoke and CO above background (OMI UVAI, MOPITT)",
    "L8": "30 m burn scar (Landsat dNBR)",
}
CLASS_ORDER = ("confirmed", "likely", "unverified", "doubtful", "non_fire")


def _reasons(row):
    out = {}
    for part in (row.get("reasons") or "").split(";"):
        if ":" in part:
            level, reason = part.split(":", 1)
            out[level] = reason
    return out


def coverage(rows):
    """Per level: run (any row has a reason or a signal), n/a rows, evaluated = rows - n/a, supports, refutes."""
    cov = {l: {"run": False, "evaluated": 0, "na": 0, "support": 0, "refute": 0} for l in config.LEVEL_ORDER}
    for row in rows:
        rs = _reasons(row)
        for l in config.LEVEL_ORDER:
            s = int(row.get(l.lower()) or 0)
            c = cov[l]
            c["run"] = c["run"] or l in rs or s != 0
            c["na"] += rs.get(l, "").startswith("n/a")
            c["support"] += s > 0
            c["refute"] += s < 0
    for c in cov.values():
        c["evaluated"] = len(rows) - c["na"] if c["run"] else 0
    return cov


def _bucket(cls):
    return "non_fire" if cls.startswith("non_fire") else cls


def build(rows, event_rows, report_year, missing=None):
    year_rows = [r for r in rows if str(r["acq_date"]).startswith(str(report_year))]
    cov = coverage(rows)
    classes = Counter(r["class"] for r in year_rows)
    monthly = {}
    for m in range(1, 13):
        monthly[m] = {"total": 0, **{c: 0 for c in CLASS_ORDER}}
    for r in year_rows:
        m = int(str(r["acq_date"])[5:7])
        monthly[m]["total"] += 1
        monthly[m][_bucket(r["class"])] += 1

    by_event = defaultdict(list)
    for r in year_rows:
        by_event[r["event_id"]].append(r)
    top = []
    for e in event_rows:
        members = by_event.get(e["event_id"])
        if not members or str(e["start"])[:4] != str(report_year):
            continue
        nf = sum(_bucket(r["class"]) == "non_fire" for r in members)
        if nf * 2 > len(members):
            continue
        ok = sum(_bucket(r["class"]) in ("confirmed", "likely") for r in members)
        support = Counter(l for r in members for l, rs in _reasons(r).items()
                          if int(r.get(l.lower()) or 0) > 0)
        top.append({"event_id": e["event_id"], "start": str(e["start"]), "end": str(e["end"]),
                    "n": int(e["n_hotspots"]), "frp_sum": float(e["frp_sum"]), "lat": float(e["lat"]),
                    "lon": float(e["lon"]), "confirmed_or_likely": ok,
                    "supporting_levels": sorted(support)})
    top.sort(key=lambda t: -t["frp_sum"])
    top = top[:15]

    total = len(year_rows)
    data = {"report_year": report_year, "total": total, "classes": dict(classes), "monthly": monthly,
            "levels": cov, "top_events": top, "missing_years": missing or {}}
    return _markdown(data), data


def _pct(n, total):
    return f"{100 * n / total:.1f}%" if total else "—"


def _markdown(d):
    t, y = d["total"], d["report_year"]
    cls = Counter()
    for k, v in d["classes"].items():
        cls[_bucket(k)] += v
    lines = [
        f"# Fire-confidence report — Italy {y}",
        "",
        f"**{t} hotspots in {y}.** Confirmed {cls['confirmed']} ({_pct(cls['confirmed'], t)}), "
        f"likely {cls['likely']} ({_pct(cls['likely'], t)}), unverified {cls['unverified']} "
        f"({_pct(cls['unverified'], t)}), doubtful {cls['doubtful']} ({_pct(cls['doubtful'], t)}), "
        f"**not a landscape fire {cls['non_fire']} ({_pct(cls['non_fire'], t)})**.",
        "",
        "Score = 50 + Σ(weight × signal), clamped 0–100. Missing evidence never lowers the score. "
        "Classes: confirmed ≥80, likely 60–79, unverified 40–59, doubtful <40; `non_fire:*` when a level shows "
        "the heat is a volcano, a persistent industrial source, offshore, water without independent support, or in a "
        "city (urban land cover; fires in cities are outside the scope of this study and are always excluded).",
        "",
        "## Non-fire breakdown",
        "",
        "| class | hotspots |",
        "|---|---:|",
    ]
    for k, v in sorted(d["classes"].items()):
        if k.startswith("non_fire"):
            lines.append(f"| {k} | {v} |")
    lines += ["", "## Evidence levels (all rows scored in this run)", "",
              "| level | what it checks | run | evaluated | n/a | supports | refutes |",
              "|---|---|---|---:|---:|---:|---:|"]
    for l in config.LEVEL_ORDER:
        c = d["levels"][l]
        lines.append(f"| {l} | {LEVEL_TITLES[l]} | {'yes' if c['run'] else 'not run'} | {c['evaluated']} | "
                     f"{c['na']} | {c['support']} | {c['refute']} |")
    lines += ["", f"## Monthly, {y}", "",
              "| month | total | confirmed | likely | unverified | doubtful | non-fire | confirmed+likely |",
              "|---|---:|---:|---:|---:|---:|---:|---:|"]
    for m, v in d["monthly"].items():
        ok = v["confirmed"] + v["likely"]
        lines.append(f"| {m:02d} | {v['total']} | {v['confirmed']} | {v['likely']} | {v['unverified']} | "
                     f"{v['doubtful']} | {v['non_fire']} | {_pct(ok, v['total'])} |")
    lines += ["", f"## Largest fire events, {y} (by Σ FRP, non-fire events excluded)", "",
              "| event | dates | hotspots | Σ FRP MW | lat, lon | confirmed+likely | supporting levels |",
              "|---|---|---:|---:|---|---:|---|"]
    for e in d["top_events"]:
        lines.append(f"| {e['event_id']} | {e['start']} → {e['end']} | {e['n']} | {e['frp_sum']:.0f} | "
                     f"{e['lat']:.3f}, {e['lon']:.3f} | {e['confirmed_or_likely']} | "
                     f"{', '.join(e['supporting_levels']) or '—'} |")
    if any(d["missing_years"].values()):
        lines += ["", f"Missing raw files: {d['missing_years']}"]
    return "\n".join(lines) + "\n"
