"""CSV outputs: hotspot_confidence.csv and fire_events.csv (spec §6)."""

import csv

LEVEL_COLS = ("l0", "l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8")
HOTSPOT_COLUMNS = ("satellite", "acq_date", "acq_time", "latitude", "longitude", "sensor", "event_id",
                   *LEVEL_COLS, "score", "class", "reasons", "worldview_url")
EVENT_BASE_COLUMNS = ("event_id", "family", "start", "end", "n_hotspots", "frp_sum", "lat", "lon",
                      "west", "south", "east", "north")


def hotspot_rows(hotspots, results, event_of, extra_cols):
    rows = []
    for h in hotspots:
        r = results[h.key]
        row = dict(zip(("satellite", "acq_date", "acq_time", "latitude", "longitude"), h.key))
        row.update(sensor=h.sensor, event_id=event_of.get(h.key, ""))
        row.update({c: r.signals[c.upper()] for c in LEVEL_COLS})
        row.update({"score": r.score, "class": r.cls, "reasons": r.reasons, "worldview_url": ""})
        row.update(extra_cols.get(h.key, {}))
        rows.append(row)
    return rows


def event_rows(events, event_signals):
    rows = []
    for e in sorted(events.values(), key=lambda e: e.id):
        w, s, ea, n = e.bbox
        row = {"event_id": e.id, "family": e.family, "start": e.start.isoformat(), "end": e.end.isoformat(),
               "n_hotspots": e.n, "frp_sum": round(e.frp_sum, 1), "lat": round(e.lat, 5), "lon": round(e.lon, 5),
               "west": w, "south": s, "east": ea, "north": n}
        row.update(event_signals.get(e.id, {}))
        rows.append(row)
    return rows


def event_columns(rows):
    extra = sorted({k for r in rows for k in r} - set(EVENT_BASE_COLUMNS))
    return (*EVENT_BASE_COLUMNS, *extra)


def write_csv(path, rows, columns):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(columns), extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
