#!/usr/bin/env python3
"""Load geoBoundaries CGAZ regions (ADM0-2) into `regions` and assign every hotspot to its regions.

Run after load_hotspots.py. Needs shapely (pip install -r ingest/requirements.txt) and the boundary
files from boundaries_fetch.py. Talks to Postgres through psql, like load_hotspots.py.

    python3 ingest/boundaries_fetch.py            # once, ~1.3 GB into data/raw/boundaries/
    python3 ingest/load_regions.py                # Europe (default): load regions, assign new hotspots
    python3 ingest/load_regions.py --countries europe,RUS      # preset plus extra countries
    python3 ingest/load_regions.py --countries all             # the whole world
    python3 ingest/load_regions.py --rebuild      # boundary files changed: reload + reassign all

Guarantees:
  * Scope: only the countries of --countries are read from the boundary files (see regions_scope.py).
    A later run with a bigger scope adds the missing regions and assigns the points that had none.
  * Chunks: hotspots are processed --chunk at a time (default 250,000), each chunk in its own
    transaction. Memory = the boundaries + one chunk, whatever the table size. An interrupted run is
    resumed by running it again: assigned points are skipped.
  * Idempotent: regions are inserted once; a re-run assigns only hotspots that have no region yet.
  * Schema (db/init/regions-init.sql) is applied on every run, so existing DBs need no migration.
  * Stale guard: after `DROP TABLE hotspots CASCADE` the old assignments would point at reused ids;
    they are cleared and everything is reassigned.
  * Points outside the scope, or farther than --coast-km from every country in it, stay unassigned;
    they still show up in queries with no area.
Design: docs/superpowers/specs/2026-11-14-region-filter-design.md.
"""

import argparse
import csv
import io
import os
import shlex
import subprocess
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from load_hotspots import DEFAULT_PSQL, PSQL_FLAGS  # noqa: E402
import regions_geo as rg  # noqa: E402
from regions_scope import parse_countries  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
INIT_SQL = REPO / "db" / "init" / "regions-init.sql"
DEFAULT_DIR = REPO / "data" / "raw" / "boundaries"
DEFAULT_SCOPE = "europe"
DEFAULT_CHUNK = 250_000     # ~0.3 GB of working memory on top of the boundaries
LEVELS = (0, 1, 2)
FILES = {lvl: f"geoBoundariesCGAZ_ADM{lvl}.geojson" for lvl in LEVELS}
FK = "hotspot_regions_hotspot_id_fkey"


class RegionsError(RuntimeError):
    pass


def psql(psql_cmd, *args, stdin=None):
    proc = subprocess.run(list(psql_cmd) + PSQL_FLAGS + list(args), input=stdin, capture_output=True, text=True)
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout).strip().splitlines()
        raise RegionsError(" / ".join(msg[-3:]) or f"psql exited with {proc.returncode}")
    return proc.stdout


def scalar(psql_cmd, query):
    return psql(psql_cmd, "-c", query).strip()


def copy_block(table, rows):
    buf = io.StringIO()
    csv.writer(buf, lineterminator="\n").writerows(rows)
    return f"COPY {table} FROM STDIN WITH (FORMAT csv);\n{buf.getvalue()}\\.\n"


def ensure_schema(psql_cmd):
    """Apply regions-init.sql. Returns True if stale assignments were cleared."""
    if scalar(psql_cmd, "SELECT to_regclass('hotspots') IS NOT NULL") != "t":
        raise RegionsError('table "hotspots" does not exist: load hotspots first '
                           "(python3 ingest/load_hotspots.py --create-table ...)")
    psql(psql_cmd, "-1", stdin="SET client_min_messages = warning;\n" + INIT_SQL.read_text())
    has_fk = scalar(psql_cmd, "SELECT count(*) FROM pg_constraint WHERE conrelid = 'hotspot_regions'::regclass "
                              "AND confrelid = 'hotspots'::regclass AND contype = 'f'")
    if has_fk != "0":
        return False
    psql(psql_cmd, "-1", stdin=f"TRUNCATE hotspot_regions;\nALTER TABLE hotspot_regions ADD CONSTRAINT {FK} "
                                "FOREIGN KEY (hotspot_id) REFERENCES hotspots(id) ON DELETE CASCADE;\n")
    return True


def read_regions(directory, countries=None):
    return rg.read_levels({lvl: Path(directory) / FILES[lvl] for lvl in LEVELS}, countries=countries)


def check_scope(regions, countries):
    """Every requested country must exist in the boundary files; fail before anything is changed."""
    if countries is None:
        return
    missing = sorted(countries - {r.country for r in regions if r.level == 0})
    if missing:
        raise RegionsError(f"country codes not in the boundary files: {', '.join(missing)}")


def load_regions(psql_cmd, regions):
    """Insert the regions that are not in the table yet. Returns (inserted, already_present)."""
    have = set(psql(psql_cmd, "-c", "SELECT source_id FROM regions").split())
    new = [r for r in regions if r.source_id not in have]
    if not new:
        return 0, len(regions)
    rows = [(r.source_id, r.level, r.country, r.name, rg.norm_name(r.name), r.parent, rg.outline(r.geom))
            for r in new]
    script = (
        "BEGIN;\n"
        "CREATE TEMP TABLE stg (source_id text, level smallint, country text, name text, name_norm text, "
        "parent_source text, outline text) ON COMMIT DROP;\n"
        + copy_block("stg", rows) +
        "INSERT INTO regions (level, country, name, name_norm, source_id, outline)\n"
        "  SELECT level, country, name, name_norm, source_id, outline FROM stg ORDER BY level, source_id;\n"
        "UPDATE regions c SET parent_id = p.id FROM stg s JOIN regions p ON p.source_id = s.parent_source\n"
        "  WHERE c.source_id = s.source_id;\n"
        "COMMIT;\n")
    psql(psql_cmd, stdin=script)
    return len(new), len(regions) - len(new)


def unassigned_chunk(psql_cmd, after_id, limit):
    """The next `limit` hotspots with id > after_id that have no region: [(id, lon, lat)]."""
    out = psql(psql_cmd, "-c",
               f"COPY (SELECT h.id, h.longitude, h.latitude FROM hotspots h WHERE h.id > {int(after_id)} "
               "AND NOT EXISTS (SELECT 1 FROM hotspot_regions hr WHERE hr.hotspot_id = h.id) "
               f"ORDER BY h.id LIMIT {int(limit)}) TO STDOUT WITH (FORMAT csv)")
    return [(int(i), float(lon), float(lat)) for i, lon, lat in csv.reader(io.StringIO(out))]


def assign_points(regions, points, coast_km):
    """Assign points [(id, lon, lat)]. Returns (rows, {level: Counter(i=, n=, none=)}); no DB access."""
    level_of = {r.source_id: r.level for r in regions}
    rows = rg.assign(regions, [p[1] for p in points], [p[2] for p in points], coast_km)
    counts = {lvl: Counter() for lvl in LEVELS}
    for _, sid, how in rows:
        counts[level_of[sid]][how] += 1
    for lvl in LEVELS:
        counts[lvl]["none"] = len(points) - counts[lvl]["i"] - counts[lvl]["n"]
    return rows, counts


def write_assignments(psql_cmd, points, rows):
    """Write one chunk's assignments (rows from assign_points) in one transaction."""
    if not rows:
        return
    script = (
        "BEGIN;\n"
        "CREATE TEMP TABLE stg (hotspot_id bigint, source_id text, how char(1)) ON COMMIT DROP;\n"
        + copy_block("stg", [(points[k][0], sid, how) for k, sid, how in rows]) +
        "INSERT INTO hotspot_regions (region_id, hotspot_id, how)\n"
        "  SELECT r.id, s.hotspot_id, s.how FROM stg s JOIN regions r USING (source_id)\n"
        "  ON CONFLICT DO NOTHING;\n"
        "COMMIT;\n")
    psql(psql_cmd, stdin=script)


def main(argv=None, psql_cmd=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--boundaries", default=str(DEFAULT_DIR), help="folder with geoBoundariesCGAZ_ADM{0,1,2}.geojson")
    ap.add_argument("--countries", default=DEFAULT_SCOPE,
                    help="`all`, or comma list of ISO3 codes and/or the preset `europe` (default europe)")
    ap.add_argument("--chunk", type=int, default=DEFAULT_CHUNK,
                    help=f"hotspots processed per transaction (default {DEFAULT_CHUNK:,})")
    ap.add_argument("--coast-km", type=float, default=25.0,
                    help="points outside every country but this close to one are given to it (default 25)")
    ap.add_argument("--rebuild", action="store_true", help="drop all regions and assignments, load and assign again")
    args = ap.parse_args(argv)
    if args.chunk < 1:
        ap.error("--chunk must be at least 1")
    try:
        scope = parse_countries(args.countries)
    except ValueError as e:
        ap.error(str(e))
    if psql_cmd is None:
        env = os.environ.get("HOTSPOTS_PSQL")
        psql_cmd = shlex.split(env) if env else DEFAULT_PSQL

    print("scope: all countries" if scope is None else f"scope: {len(scope)} countries", flush=True)
    totals = {lvl: Counter() for lvl in LEVELS}
    processed = chunks = 0
    try:
        if ensure_schema(psql_cmd):
            print("hotspot_regions: stale after hotspots rebuild, cleared")
        for lvl in LEVELS:
            p = Path(args.boundaries) / FILES[lvl]
            if not p.exists():
                raise RegionsError(f"{p} missing — run python3 ingest/boundaries_fetch.py")
        regions = read_regions(args.boundaries, scope)
        check_scope(regions, scope)                 # before --rebuild truncates anything
        if args.rebuild:
            psql(psql_cmd, "-c", "TRUNCATE regions CASCADE")
        new, present = load_regions(psql_cmd, regions)
        if not new:
            print("regions: already loaded, skipped", flush=True)
        else:
            print(f"regions: loaded {new}" + (f" ({present} already present)" if present else ""), flush=True)

        after = 0
        while True:
            points = unassigned_chunk(psql_cmd, after, args.chunk)
            if not points:
                break
            rows, counts = assign_points(regions, points, args.coast_km)
            write_assignments(psql_cmd, points, rows)
            chunks += 1
            processed += len(points)
            after = points[-1][0]
            for lvl in LEVELS:
                totals[lvl].update(counts[lvl])
            print(f"chunk {chunks}: {len(points)} points, ids {points[0][0]}..{points[-1][0]}", flush=True)
            if len(points) < args.chunk:
                break
    except (RegionsError, OSError) as e:
        print(f"FAILED: {e}")
        return 1
    print(f"hotspots processed: {processed} in {chunks} chunk(s)")
    for lvl in LEVELS:
        c = totals[lvl]
        print(f"ADM{lvl}: {c['i']} inside, {c['n']} nearest, {c['none']} unassigned")
    return 0


if __name__ == "__main__":
    sys.exit(main())
