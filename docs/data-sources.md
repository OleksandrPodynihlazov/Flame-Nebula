# Data sources

## Where to get the data

**FIRMS yearly country files** — public, no login, one CSV per sensor/year/country.

| File | URL | Size |
|---|---|---|
| MODIS, Italy, 2008 (MVP) | <https://firms.modaps.eosdis.nasa.gov/data/country/modis/2008/modis_2008_Italy.csv> | ~0.5 MB, 6,689 rows |
| VIIRS S-NPP, Italy, `<YEAR>` | `https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/<YEAR>/viirs-snpp_<YEAR>_Italy.csv` | — |

Pattern: `/data/country/<sensor>/<year>/<sensor>_<year>_<Country>.csv`. Index page: <https://firms.modaps.eosdis.nasa.gov/country/>.

Fetch into `data/raw/` (gitignored):

```sh
mkdir -p data/raw
curl -fL -o data/raw/modis_2008_Italy.csv \
  https://firms.modaps.eosdis.nasa.gov/data/country/modis/2008/modis_2008_Italy.csv
```

## Load into Postgres

Raw archive or API CSV → `hotspots` table (schema: `db/init/hotspots-init.sql`). Script: `ingest/load_hotspots.py`, stdlib only.
Run from the repo root. Same commands on a laptop and on the VPS.

```sh
docker compose up -d db
python3 ingest/firms_archive_fetch.py --years 2000-2025          # → data/raw/firms_archive/, ~1 min, no key
python3 ingest/load_hotspots.py --create-table data/raw/firms_archive/*.csv
python3 ingest/load_hotspots.py data/raw/firms_api/*.csv        # API files (merged ones, not chunks/), optional
```

Expect `total: 131700 inserted …; 0 file(s) failed` (all MODIS Italy, ~9 s). A second run prints `0 inserted … 131700 unchanged`.

| Question | Answer |
|---|---|
| How does it reach the DB without a port? | It runs `psql` **inside** the `db` container (`docker compose exec -T db psql …`), with the container's own credentials. Contract [0]: only `gateway` publishes a host port. Another DB: `HOTSPOTS_PSQL='psql postgresql://u:p@host:5432/db'`. |
| Is it safe to run again? | Yes. One detection = `(satellite, acq_date, acq_time, latitude, longitude)` (unique index `hotspots_natural_key`, created by the loader). Same row → `unchanged`. Same detection with new values (FIRMS reprocessing) → `updated`. Nothing is duplicated. |
| Can it recreate or wipe the table? | No. `--create-table` creates the table **only if it is missing**. An existing table, its rows and any later `ALTER`s are never touched (tested). The loader never runs `DROP`/`TRUNCATE`. |
| What if a file fails? | That file writes nothing (one transaction per file), the others still load, and the exit code is 1. |
| NRT / API files? | Yes. Columns are matched by name; `type` is missing in NRT files and stored as NULL, a missing `instrument` is derived from the brightness column, and API `T`/`A` become `Terra`/`Aqua` so archive and API rows share one key. An NRT row never overwrites a row that has a `type`: load order does not matter, the archive wins. A DB created before `type` became nullable needs once: `ALTER TABLE hotspots ALTER COLUMN type DROP NOT NULL;` (the loader prints this hint if it is missing). |

**On the VPS.** `data/` is gitignored, so the CSVs are not deployed: run the fetch command there once. `data/` survives deploys
(`git checkout` leaves ignored files alone), and so does the `pgdata` volume. Loading is a one-time manual step, not part of
`infra/deploy.sh`. Because it is idempotent, adding it to the deploy would also be safe.

**When the schema changes** (e.g. `type` becomes nullable, a column is added):
- Editing `db/init/hotspots-init.sql` does **not** change an existing database. Postgres runs init scripts only on an empty
  volume, and `--create-table` skips an existing table. Apply the change explicitly, once per DB (laptop, VPS), as an
  idempotent statement, e.g. `ALTER TABLE hotspots ALTER COLUMN type DROP NOT NULL;` or `ADD COLUMN IF NOT EXISTS …`.
- Or rebuild, since the data is fully reproducible from `data/raw` in seconds:
  `docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP TABLE hotspots CASCADE"'`
  (CASCADE also drops the harmonization views), then the load command above and the *Harmonize* commands below.
  This is destructive, so on the VPS do it only on purpose.
- The harmonization views read `hotspots` columns, so Postgres refuses `ALTER COLUMN … TYPE` or `DROP COLUMN` on a column
  they use. `DROP NOT NULL` and `ADD COLUMN` are fine. If an ALTER is refused: `DROP VIEW hotspots_flagged CASCADE`, run the
  ALTER, then re-run the *Harmonize* commands (they recreate the views).
- The loader writes an explicit column list. New nullable columns don't affect it. A renamed or removed column makes the load
  fail with the psql error, and nothing is written.

Troubleshooting: `table "hotspots" does not exist` → add `--create-table`. `could not create unique index
"hotspots_natural_key"` → the table already has duplicates from an older load: `TRUNCATE hotspots`, then re-run.
`service "db" is not running` → `docker compose up -d db`.

## Regions (boundaries)

The region filter (`region=<id>`, `/api/regions`) needs every hotspot's country and sub-national regions. They come from
**geoBoundaries CGAZ** (global composite, ADM0–ADM2, no overlaps between countries). Licence CC BY 4.0: show
"Boundaries: geoBoundaries" in the app. Design: `docs/superpowers/specs/2026-11-14-region-filter-design.md`.

Run after the hotspot load, from the repo root. Same commands on a laptop and on the VPS (one-time step, like the load):

```sh
python3 -m venv .venv && .venv/bin/pip install -r ingest/requirements.txt   # shapely, only for this step
python3 ingest/boundaries_fetch.py      # → data/raw/boundaries/, 401 + 361 + 550 MB, skips complete files, resumes
.venv/bin/python ingest/load_regions.py   # Europe: loads its regions, then assigns hotspots that have no region yet
```

On a server, start it with `nohup … > data/regions.log 2>&1 &` and `tail -f data/regions.log`: it prints one line per chunk.

Expect (measured 2026-11-14, 473,936 Italy points, default scope, `--chunk 100000`, 2 min, **0.3 GB RAM peak**):

```
scope: 45 countries
regions: loaded 10721
chunk 1: 100000 points, ids 1..100000
…
ADM0: 473415 inside, 480 nearest, 41 unassigned
```

**Scope.** `--countries` picks the countries whose boundaries are read and loaded. Default `europe` = 45 countries
(`ingest/regions_scope.py`; Russia, Turkey, Kazakhstan, the Caucasus and Greenland are left out on purpose). Other values:
`--countries europe,RUS` (preset + extra codes), `--countries ITA,FRA`, `--countries all` (world: 52,457 regions, ~1.1 GB RAM
for the boundaries alone). A later run with a bigger scope adds the missing regions and assigns the points that had none.
A hotspot outside the scope stays unassigned (and is looked at again on every run), so load only the FIRMS data you need.

**Chunks.** Hotspots are processed `--chunk` at a time (default 250,000), each chunk in its own transaction. Memory is the
boundaries plus one chunk (≈1 KB per point), whatever the table size. If a run dies, run it again: it continues where it stopped.

| Question | Answer |
|---|---|
| Safe to run again? | Yes. Regions load once; only hotspots without a region are assigned. Run it after every new hotspot load. |
| Boundary files changed, or the scope should shrink? | `.venv/bin/python ingest/load_regions.py --rebuild [--countries …]` (reloads regions, reassigns all; region ids change). Without `--rebuild`, regions of an earlier, bigger scope stay in the table. |
| `hotspots` rebuilt with `DROP TABLE … CASCADE`? | The next run sees the missing FK, clears the stale assignments (ids were reused) and reassigns all. |
| What is "nearest"? | A point outside every country (coast, offshore `type=3`) goes to the nearest one within `--coast-km` (25). Lower levels: nearest unit inside that country. |
| What does a level mean? | It differs per country. Italy: ADM1 = 5 macro-zones (`Isole` = Sicily + Sardinia), **ADM2 = the 20 regions**, provinces are not loaded. |
| Names? | Local spelling from the source: `Sicilia`, not "Sicily". Search ignores case and accents. |
| Copies? | CGAZ repeats ADM1 as ADM2 where a country has no ADM2 (334 units, e.g. Malta, Libya); the copies are dropped. |
| Numeric country codes? | `111`–`129` are disputed areas in CGAZ (e.g. `111` Abyei, `112` Aksai Chin). |

Italy result: 473,861 points (99.98 %) → `ITA`; 17 → `FRA` and 14 → `CHE` (Alpine border, FIRMS clip vs CGAZ);
3 → `SMR` (San Marino). `Sicilia` = 132,198 points (Etna and Stromboli included: filter `type=0` for vegetation fires).

**Known gap:** CGAZ has no Lampedusa or Linosa (the per-country gbOpen file does). Their 41 detections stay unassigned:
they appear in queries with no area, but not under Italy or Sicilia.

## Harmonize

After loading MODIS **and** S-NPP (`--sensor viirs-snpp --years 2012-2025` in the fetch step), run in this order.
Each step rebuilds its own tables/views from scratch, so re-running is safe. Total ~20 s.

```sh
python3 harmonize/canonical.py       # view hotspots_canonical: confidence_level / platform for both sensors
python3 harmonize/coverage_table.py   # coverage: satellite × day ok/partial/missing (known gaps, research/07 §6)
python3 harmonize/static_mask.py      # static_mask + view hotspots_flagged
python3 harmonize/calibrate.py        # calibration + views calibration_chain, harmonized_monthly; prints the factors
python3 harmonize/patterns.py         # fire_patterns: recurring fires per 0.1° cell × month, S-NPP only
```

`patterns.py` on Italy 2012–2025 (measured 2026-11-14, ~1.5 s): `fire_patterns: 16955 cell-months, 3117 with
probability >= 0.5`. Peak August (855 likely cells); top cells are western Sicily, burned 14 of 14 Augusts.

Re-run all four after loading new data. Outputs and how the backend uses them: `docs/contracts.md` §[1].
Tests (real throwaway Postgres): `python3 -m unittest discover -s harmonize/tests`.

Other sources:

- FIRMS archive download (custom area/dates, needs Earthdata login): <https://firms.modaps.eosdis.nasa.gov/download/>
- FIRMS overview: <https://www.earthdata.nasa.gov/data/tools/firms>
- Attribute docs: <https://www.earthdata.nasa.gov/data/tools/firms/faq>

## Sensors

| | MODIS | VIIRS |
|---|---|---|
| Satellites | Terra (from Nov 2000), Aqua (from Jul 2002) | S-NPP (from Jan 2012), NOAA-20, NOAA-21 |
| Pixel size | ~1 km | ~375 m |
| Status | Near end of life | Replacement |
| Sees | Fewer, larger fires | More, smaller fires (many more points for the same area) |

Overpass times (local solar time): **Terra ~10:30 / 22:30**, **Aqua ~13:30 / 01:30**. Using both catches morning and afternoon fire peaks.

## CSV columns

Same 15 columns in both sensors, except the brightness pair and `confidence`.

| Column | MODIS | VIIRS | Meaning |
|---|---|---|---|
| `latitude`, `longitude` | ✓ | ✓ | Pixel center, WGS84 degrees |
| `brightness` | ✓ | — | Brightness temp, Kelvin (MODIS band 21/22) |
| `bright_ti4` | — | ✓ | Brightness temp, Kelvin (VIIRS I-4) |
| `scan`, `track` | ✓ | ✓ | Real pixel size in km (grows at swath edge) |
| `acq_date` | ✓ | ✓ | `YYYY-MM-DD`, UTC |
| `acq_time` | ✓ | ✓ | `HHMM`, UTC, 4 digits (`0030`) |
| `satellite` | `Terra` / `Aqua` | `N` (S-NPP), `1` (NOAA-20), `2` (NOAA-21) | Platform |
| `instrument` | `MODIS` | `VIIRS` | Sensor |
| `confidence` | integer 0–100 | `l` / `n` / `h` (low/nominal/high) | Detection confidence — **different types** |
| `version` | e.g. `6.2` | e.g. `2` | Product collection |
| `bright_t31` | ✓ | — | Kelvin, band 31 |
| `bright_ti5` | — | ✓ | Kelvin, I-5 |
| `frp` | ✓ | ✓ | Fire Radiative Power, MW — fire intensity |
| `daynight` | ✓ | ✓ | `D` / `N` |
| `type` | ✓ | ✓ | Source class, see below (archive files only) |

### `type` codes

| Code | Meaning | Italy 2008 rows |
|---|---|---|
| `0` | Presumed vegetation fire | 6,473 |
| `1` | Active volcano | 3 |
| `2` | Other static land source (industry, gas flares) | 204 |
| `3` | Offshore | 9 |

Plan: `0` = wildfire/burn; `1–3` = noise. Confirm with a mentor before relying on it.

### Italy 2008 MODIS — quick facts

- Dates: 2008-01-02 → 2008-12-24.
- Aqua: 3,025 day / 327 night. Terra: 2,796 day / 541 night.
