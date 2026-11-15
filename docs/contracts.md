# Contracts

The exact data shape passed between stages. Each stage depends only on the contract before it.
Change a shape → edit this file in the same PR → tag the owner of the next stage as reviewer.

Status: **DRAFT** — sections marked TBD are filled by their owner.

```
data/raw/*.csv ─[1]─▶ data/processed/hotspots.csv ─[2]─▶ Postgres ─[3]─▶ HTTP JSON ─▶ frontend/
```

## [0] Service contract (Docker)

How each service runs in `docker-compose.yml`. Details in `docs/deploy.md`.

- Each service has a `Dockerfile` in its own folder.
- `api` listens on port 3000 and serves `GET /api/health`: 200 + JSON with `"version"` (from env `APP_VERSION`) when ready.
- `web` serves the built app on port 80.
- Logs go to stdout, one line per event.
- No service publishes host ports except `gateway`.

## [1] harmonize/ → processed CSV

File: `data/processed/hotspots.csv`, UTF-8, comma, header row.

| Column | Type | Rule |
|---|---|---|
| `id` | integer | Unique, from 1 |
| `latitude` | float | WGS84 |
| `longitude` | float | WGS84 |
| `acq_date` | `YYYY-MM-DD` | UTC |
| `acq_time` | `HHMM` | UTC, 4 digits |
| `sensor` | `MODIS` / `VIIRS` | From `instrument` |
| `satellite` | text | Archive spelling: `Terra` / `Aqua`, `N` / `N20` / `N21`. API `T` / `A` are stored as `Terra` / `Aqua` |
| `daynight` | `D` / `N` | |
| `frp` | float | MW |
| `confidence` | integer 0–100, or empty | Raw MODIS percentage. **Empty for VIIRS**: VIIRS has no percentage, only a class |
| `confidence_level` | `low` / `nominal` / `high` | **Both sensors, one scale.** VIIRS `l`/`n`/`h` as delivered; MODIS binned with the FIRMS thresholds: <30 low, 30–79 nominal, ≥80 high. Use this one for display and filters |
| `type` | integer 0–3, or empty | As in raw file. Empty (NULL) for NRT/API rows: those files have no `type` |

MVP: MODIS rows only; this is a cleaned copy of the raw file.

**Harmonization (owner: harmonization teammate). Implemented in the DB, on top of `hotspots`.** Raw rows are loaded as-is
(`ingest/load_hotspots.py`); the processed CSV above is not produced. Nothing in `hotspots` is modified.
How to build: `docs/data-sources.md` → *Harmonize*. Method and evidence: `research/07-harmonization-deep-dive.md` §8, §13.

| Object | Kind | What the backend uses it for |
|---|---|---|
| `coverage(satellite, day, status, note)` | table | `status` ∈ `ok`/`partial`/`missing` per satellite × UTC day. **Draw non-ok days as "no data", never as 0.** |
| `static_mask(cell_lat, cell_lon, category, core, qualifying_years)` | table | Industrial sites / flares (`static`) and `volcano` cells, grid `floor(deg*100)`, built from S-NPP. |
| `hotspots_canonical` | view | `hotspots` + sensor-neutral fields: `confidence_level` (low/nominal/high, both sensors), `confidence_pct` (raw MODIS 0–100, NULL for VIIRS), `platform` (terra/aqua/snpp/noaa20/noaa21). SQL in `db/init/hotspots-views.sql` (every deploy applies it; `python3 harmonize/canonical.py` re-applies it by hand). **Read per-hotspot fields from here, never branch on the sensor in the API.** |
| `hotspots_flagged` | view | `hotspots` + `mask_category` + `is_burning` (= not masked and `type` ≠ 3; NULL `type` counts as land). **Count burning activity with `WHERE is_burning`.** Map/CSV can show all rows with the flag. |
| `hotspot_country(hotspot_id, country, how)` | table | ISO3 of every point (`how`: `f` archive file name, `r` level-0 region, `g` geometry). `country` NULL = outside the Europe scope: left out of every series. |
| `calibration` | table | Junction factors J1 Terra→Aqua, J2 Aqua→S-NPP, J3 S-NPP→NOAA-20, **per country** (ISO3, `EUR` = pooled) × month (0 = all months) × metric (`count`, `frp`), with interquartile band. |
| `calibration_chain(satellite, country, month, metric, factor, band_lo, band_hi, source)` | view | **Multiplier to S-NPP-equivalent units.** For any area and month: take the month's reference satellite, count its `is_burning` rows **per country** (`hotspot_country`), multiply each by that country's `factor`, add up. `source`: `country-month`, `country-all`, `eur-month`, `eur-all` (fallback used), `unit`. Aggregates only, never single points. |
| `harmonized_monthly` | table | Snapshot rebuilt by every `calibrate.py` run (the live view `harmonized_monthly_live` scans every point, ~20 s for Europe). Ready series per `country` and `EUR` (= sum of countries): `country, month_start, satellite` (reference), `raw_count, raw_frp, count_snpp_eq, count_lo, count_hi, frp_snpp_eq, frp_lo, frp_hi, days_ok, days_partial, days_missing`. |
| `fire_patterns(cell_lat, cell_lon, month, years_burned, years_observed, probability, median_count)` | table | **Recurring fires, for "what to expect this month".** Cell = `floor(deg*10)` (0.1°), `month` 1–12, S-NPP only, `is_burning` rows. `probability = years_burned / years_observed`; `median_count` = detections per burned year. Sparse: no row = 0 for that month. Never mix with MODIS (design: `docs/superpowers/specs/2026-11-14-fire-patterns-design.md`). |

Reference satellite of a month = the most preferred one covering the **whole** month (S-NPP, then NOAA-20, Aqua,
Terra; list in `harmonize/platforms.py`): Terra 2000-11 → 2002-07, Aqua 2002-08 → 2012-01, S-NPP 2012-02 → 2026-10,
NOAA-20 2026-11 →. The running month needs coverage only up to the last data day. Never sum satellites. Hotspot counts from the other satellites stay available for the map and CSV.

## [1b] harmonize/confidence → fire confidence per hotspot

Status: **proposal** (owner: harmonization). Owners of [2] and [3] decide whether and how to adopt it. Nothing in `hotspots` changes.

Answers the question "is this hotspot a real landscape fire?" with independent evidence, cheap → expensive:
L0 product confidence · L1 known non-fire (volcano, persistent industrial source, offshore) · L2 event self-consistency ·
L3 VIIRS↔MODIS cross-check · L4 land cover · L5 MODIS burn scar (MCD64A1) · L6 EFFIS burned-area polygon ·
L7 smoke/CO · L8 Landsat dNBR · plus a NASA Worldview before/after link. Spec: `docs/superpowers/specs/2026-11-14-fire-confidence-design.md`.

Run: `python3 harmonize/confidence/run.py run --data-dir data --countries Italy,Spain --years all --levels L0-L9`,
then `... load-db --countries Italy,Spain` and `... summary --countries Italy,Spain` (cross-country table).

File `data/processed/confidence/<Country>/hotspot_confidence.csv` (one per country, FIRMS country names) and table
`hotspot_confidence` (all countries in one table; DDL: `harmonize/confidence/sql/hotspot_confidence.sql`):

| Column | Type | Rule |
|---|---|---|
| `satellite`, `acq_date`, `acq_time`, `latitude`, `longitude` | as in `hotspots` | Join key = the loader's natural key |
| `sensor` | `MODIS` / `VIIRS` | |
| `event_id` | text | Fire event the hotspot belongs to (`fire_events.csv`) |
| `l0` … `l8` | smallint −1/0/1 | Per-level signal: refutes / no information / supports |
| `score` | smallint 0–100 | 50 + Σ weight × signal. 50 = no evidence either way |
| `class` | text | `confirmed` ≥80 · `likely` 60–79 · `unverified` 40–59 · `doubtful` <40 · `non_fire:volcano/static/offshore/urban`. `non_fire:urban` = city land cover, always excluded (fires in cities are out of scope), whatever the score |
| `reasons` | text | `L1:static;L3:xsensor:snpp;L6:effis:123:450ha` — human-readable evidence |
| `worldview_url` | text | NASA Worldview link: detection day vs 10 days earlier, swipe compare |

Adopted by [3] (API): the 4 fields are in `GET /api/hotspots` properties through the view `hotspots_with_confidence`
(`db/init/views-init.sql`), and non_fire points are hidden by **default**, `include_non_fire=true` shows them (instead of the
opt-in `exclude_non_fire` first suggested here). Missing join row → the fields are `null`. `min_confidence=<0-100>` filters
on `score`; the CSV carries `score`, `class`, `reasons` (both in [3]).

## [2] db/ schema

Postgres 17. name: hotspots-init.sql

Every `db/init/*.sql` must be safe to re-run: `infra/apply-db-schema.sh` applies all of them on every deploy
(`IF NOT EXISTS`, explicit index names; never `DROP TABLE`/`TRUNCATE`/`DELETE`). Indexes on `hotspots`:
`hotspots_acq_date_idx`, `hotspots_instrument_acq_date_idx`, `hotspots_latitude_longitude_idx` (this file),
`hotspots_natural_key` (unique, `ingest/load_hotspots.py`), `hotspots_point_gist` (`regions-init.sql`).

```sql
CREATE TABLE hotspots (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  brightness  REAL,              -- MODIS: brightness, VIIRS: bright_ti4 (Kelvin)
  scan        REAL,
  track       REAL,
  acq_date    DATE NOT NULL,
  acq_time    SMALLINT NOT NULL, -- HHMM in UTC, e.g. 105 = 01:05
  satellite   TEXT NOT NULL,     -- Terra/Aqua, N/N20/N21
  instrument  TEXT NOT NULL,     -- 'MODIS' or 'VIIRS'
  confidence  TEXT,              -- MODIS: '0'-'100', VIIRS: 'l'/'n'/'h'
  version     TEXT,
  frp         DOUBLE PRECISION,              -- MW
  daynight    CHAR(1),           -- 'D' or 'N'
  type        SMALLINT                   -- 0-3; NULL in NRT/API files (they have no type)
);

```

Aggregates: TBD (owner: db). Minimum needed by the API: hotspot count per day, filtered by area and date range.

### Regions — `db/init/regions-init.sql`

Every hotspot's country and sub-national regions, assigned once at load time by `ingest/load_regions.py`, which
also applies this file on every run (idempotent). Boundaries: geoBoundaries CGAZ ADM0–2 (`docs/data-sources.md`).

```sql
CREATE TABLE regions (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  level      SMALLINT NOT NULL,          -- 0 = country, 1, 2 (meaning varies by country)
  country    CHAR(3)  NOT NULL,          -- ISO 3166-1 alpha-3
  name       TEXT     NOT NULL,          -- local spelling: 'Sicilia', not 'Sicily'
  name_norm  TEXT     NOT NULL,          -- search key: NFKD, marks dropped, lower-case
  parent_id  INTEGER  REFERENCES regions(id),
  source_id  TEXT     NOT NULL UNIQUE,   -- geoBoundaries shapeID; ADM0: '<ISO3>-ADM0'
  outline    TEXT     NOT NULL           -- simplified GeoJSON geometry, for the map only
);
CREATE TABLE hotspot_regions (           -- one row per hotspot per level it has
  region_id  INTEGER NOT NULL REFERENCES regions(id)  ON DELETE CASCADE,
  hotspot_id BIGINT  NOT NULL REFERENCES hotspots(id) ON DELETE CASCADE,
  how        CHAR(1) NOT NULL,           -- 'i' = inside, 'n' = nearest (coast / sea, within 25 km)
  PRIMARY KEY (region_id, hotspot_id)
);
CREATE INDEX hotspots_point_gist ON hotspots USING gist (point(longitude, latitude));
```

| Filter | SQL on `hotspots` |
|---|---|
| Region | `EXISTS (SELECT 1 FROM hotspot_regions hr WHERE hr.hotspot_id = hotspots.id AND hr.region_id = $1)` |
| Drawn polygon | `latitude BETWEEN … AND longitude BETWEEN …` over the vertices' bounding box (inclusive), then `point(longitude, latitude) <@ $n::polygon` (exactly this form, so `hotspots_point_gist` is used) |
| Circle | latitude bounding box, then great-circle distance (haversine) ≤ `radius_km` |

- Levels mean different things per country. Italy: ADM1 = 5 macro-zones (`Isole` = Sicily + Sardinia), ADM2 = the 20 regions.
- Region ids are **not stable** across `load_regions.py --rebuild`; clients get them from `/api/regions`.
- Shared code: `api/lib/query.js` (`parseFilters`, `buildWhere`) builds these conditions; every data endpoint uses it via `api/lib/filters.js`.

## [3] api/ endpoints

Base path `/api`. JSON. Errors return `{ "error": "<message>" }` with a 4xx/5xx code.

Shared query params (area + filters):

| Param | Example | Meaning |
|---|---|---|
| `from`, `to` | `2008-01-01`, `2008-12-31` | Date range, inclusive |
| `lat`, `lon`, `radius_km` | `41.9`, `12.5`, `50` | Circle area |
| `polygon` | `[[12.1,41.8],[12.9,41.8],[12.5,42.2]]` | Polygon area, `[lon, lat]` pairs, 3–200 points, coordinates rounded to 5 decimals (a closing point equal to the first is optional) |
| `region` | `812` | Named area: a region `id` from `GET /api/regions` |
| `daynight` | `D` / `N` | Optional |
| `type` | `0` | Optional, comma list |
| `sensor` | `MODIS` or `MODIS,VIIRS` | Optional, comma list. Matches `instrument` in [2] / `sensor` in [1] |
| `include_non_fire` | `true` | Optional, `true` / `false` (else 400). Default `false`: points whose [1b] class is `non_fire:*` (volcano, static source, offshore, urban) are left out of `/hotspots`, `/hotspots/grid`, `/hotspots.csv`, `/calendar`, `/selection-summary` and the `/stats` totals. Unscored points (no [1b] row) are always kept |
| `min_confidence` | `60` | Optional, whole number `0`–`100` (else 400). Off when absent. Keeps only points with [1b] `score ≥` it, on every data endpoint (`/stats` totals **and** `by_class`). Unscored points have no score, so they are left out while it is set (`0` = every scored point). Combines with `include_non_fire` |
| `bbox` | `6.50,36.50,18.75,47.10` | Optional visible map area `west,south,east,north` in degrees: 4 numbers, `-180 ≤ west < east ≤ 180`, `-90 ≤ south < north ≤ 90`, else 400. No antimeridian wrap. ANDed with every other filter, including `region` / `polygon` / circle. SQL `latitude BETWEEN … AND longitude BETWEEN …` (uses the `(latitude, longitude)` index) |

`region` cannot be combined with `polygon` or a circle → 400 `Send one area: region, polygon or circle`. If `polygon` and a circle are both sent, the polygon wins (the frontend never sends both).
Unknown `region` id → 400. No area given → all loaded data (currently Europe; send `region` to limit to a country).

| Method + path | Returns |
|---|---|
| `GET /api/hotspots` | GeoJSON `FeatureCollection` of points; properties = CSV columns + `confidence_score` (0–100), `confidence_class`, `confidence_reasons`, `worldview_url` from [1b], each `null` when the point is not scored |
| `GET /api/stats` | `{ "total": 6689, "frp_sum": 184532.7, "by_type": { "0": 6473, ... }, "by_daynight": { "D": 5821, "N": 868 }, "by_class": { "confirmed": 2100, "likely": 1900, "unverified": 2300, "doubtful": 170, "unscored": 0, "non_fire": { "static": 180, "volcano": 3, "offshore": 9, "urban": 27 } } }`. `frp_sum`: summed FRP (MW), 1 decimal; rows with no FRP add 0. `total`, `frp_sum`, `by_type`, `by_daynight` follow `include_non_fire`; **`by_class` always counts every matching point, the hidden non_fire ones included**, so the UI can say what was left out. `unscored` = no [1b] row. Zero counts are left out; `non_fire` is always present (`{}` when empty) |
| `GET /api/calendar` | `{ "days": [ { "date": "2008-08-14", "count": 42, "frp": 1290.4 }, ... ] }`. `frp`: summed FRP (MW) of the day, 1 decimal |
| `GET /api/selection-summary` | The selection card's numbers for the filters + area, aggregated in SQL. See below |
| `GET /api/hotspots/grid` | Hotspots counted per grid cell, for the zoomed-out map. See below |
| `GET /api/hotspots.csv` | CSV download, same columns as [1] (+ `confidence_level`), then `score`, `class`, `reasons` from [1b] (empty when the point is not scored) |
| `GET /api/patterns?month=8` | `{ "month": 8, "cells": [ { "lat": 37.65, "lon": 14.25, "years_burned": 14, "years_observed": 14, "probability": 1, "median_count": 6 } ] }`. One row per 0.1° cell of `fire_patterns` for that month (1–12, required); `lat`/`lon` = cell centre. Area params (circle, polygon, region, bbox) filter by cell centre; a region keeps cells holding one of its S-NPP hotspots. Optional `min_probability` (0–1) drops cells below it; the frontend sends `0.857` (≥ 12 of 14 years). Other params are ignored. Sorted by `probability`, then `median_count`, descending. Table not built → `"cells": []` |
| `GET /api/patterns/summary` | `{ "months": [ { "month": 1, "cells": 0, "likely": 0, "max_probability": 0 }, … ] }`: always 12 months. `likely` = cells with `probability >= 0.5`. Same area params and `min_probability` as `/api/patterns` |
| `GET /api/harmonized` | `{ "country": "ITA", "months": [ { "month": "2008-08", "satellite": "Aqua", "raw": 911, "count": 7259.1, "lo": 6755.8, "hi": 7733.5, "days_missing": 0 } ] }`. The burning-activity series in one unit across satellites, read from `harmonized_monthly` ([1]). `country` = ISO3 (`ITA`, `ESP`, …) or `EUR` (default) = all of Europe; anything else → 400. One row per month, sorted: `satellite` = the month's reference satellite, `raw` = its detections, `count` = the same in S-NPP units (`lo`..`hi` = factor band). Area and date params are ignored. Table not built or unknown country → `"months": []` |
| `GET /api/regions` | `{ "regions": [ { "id": 812, "name": "Sicilia", "level": 2, "country": "ITA", "parent_id": 77, "path": "Italy › Isole" } ] }`. No params → countries (level 0, `path` `""`); `?parent=<id>` → its children; `?q=<text>` → name search, 2–100 chars, case- and accent-insensitive, prefix matches first, max 20. `q` with `parent` → 400. Sorted by name. Not loaded yet → `"regions": []` |
| `GET /api/regions/:id` | GeoJSON `Feature`: `geometry` = simplified outline (Polygon / MultiPolygon), `properties` = the fields above. Unknown id → 404 `{ "error": … }` |

Row cap: `GET /api/hotspots` and `GET /api/hotspots.csv` return at most `HOTSPOTS_MAX_ROWS` rows (env; 500000 in `docker-compose.yml`, code fallback 200000). More matching rows → 400 `{ "error": "Too many hotspots (more than <cap>). Narrow the date range or area." }`; never a truncated result. With `bbox` (map viewport) the cap is `HOTSPOTS_BBOX_MAX_ROWS` instead (env, default 20000) → 400 `{ "error": "Too many hotspots in view (more than <cap>). Zoom in." }`.

`GET /api/selection-summary` — shared params (area optional, `bbox` optional like everywhere):

```json
{ "total": 6689,
  "frp": { "sum": 184532.71, "mean": 27.59, "max": 1310.2 },
  "peak_month": { "month": "2020-08", "count": 1520 },
  "peak_day": { "date": "2020-08-14", "count": 212 },
  "first": "2020-01-03", "last": "2020-12-29",
  "by_type": { "0": 6473, "2": 216 }, "by_daynight": { "D": 5821, "N": 868 } }
```

- `total` = matching hotspots. `by_type` / `by_daynight`: same rules as `/api/stats` (zero counts left out; rows with `type` or `daynight` NULL count in `total` only).
- `frp`: `sum`, `mean`, `max` in MW over rows with a non-null `frp` only (`mean` = `sum` / that count), not rounded. `null` when no row has one.
- `peak_month` (`YYYY-MM`) and `peak_day` (`YYYY-MM-DD`): the most hotspots; a tie goes to the earliest. `first` / `last`: earliest and latest `acq_date`.
- No match → 200 `{ "total": 0, "frp": null, "peak_month": null, "peak_day": null, "first": null, "last": null, "by_type": {}, "by_daynight": {} }`.
- The area in km² is not here: it depends only on the shape, the browser computes it.

`GET /api/hotspots/grid` — shared params + `bbox` (**required**) + `cell` (**required**, degrees, `0.01 ≤ cell ≤ 10`):

```json
{ "cell": 0.5, "cells": [ { "lat": 41.93, "lon": 12.48, "count": 812, "type": 0 } ] }
```

- One entry per non-empty cell `floor(latitude / cell)`, `floor(longitude / cell)`; no order.
- `lat` / `lon` = average position of the cell's points, rounded to 4 decimals. `count` = points in the cell.
- `type` = most common `type` in the cell (`mode()`), lowest on a tie. Rows with `type` NULL (FIRMS API files) are skipped by `mode()`; `type` is `null` only when no point in the cell has one.
- Missing / invalid `bbox` or `cell` → 400. More than 20,000 cells → 400 `{ "error": "Too many cells, zoom in or use a bigger cell" }`. Nothing in the box → 200 `{ "cell": …, "cells": [] }`.

Concurrency (`/api/hotspots` and `/api/hotspots.csv`), two separate classes: without `bbox` (heavy) at most 2 parallel requests per client IP and 3 in total; with `bbox` (light, map viewport) at most 6 per client IP and 20 in total. One class never uses up the other. Over the limit → 503 `{ "error": "Server busy, try again in a moment" }` with `Retry-After`. `/api/hotspots/grid` has no such limit.

Cache: the gateway caches `200` answers of every `GET /api/...` except `/api/health` for 10 minutes, keyed by path + query string (`X-Cache-Status: MISS` / `HIT` / …). After loading new data, clear it (`docs/deploy.md`). Clients should send identical query strings for identical views (the frontend rounds `bbox` to 0.01° and picks `cell` from a fixed set).

Confidence source: `/stats`, `/calendar` and `/hotspots/grid` read the view `hotspots_with_confidence` (= `hotspots` LEFT JOIN
`hotspot_confidence` on the natural key, `db/init/views-init.sql`). `/hotspots` and the CSV read `hotspots_canonical` and join
`hotspot_confidence` on the same key in the query (no view may depend on `hotspots_canonical`: it is recreated on every
deploy). A DB without the confidence objects (deploy applies them, `infra/apply-db-schema.sh`) is read as plain `hotspots`: the
4 fields are `null`, nothing is excluded, `by_class` is all `unscored`. The API re-checks every 30 s, so no restart is needed.

Owner may change these; update this table first.

### Frontend requirements for [3]

Owner: frontend data layer. Change any row → tag the frontend owner as reviewer.

Requests: all endpoints accept every shared param from the table above, with the same meaning. After a filter or area change the frontend waits 300 ms before asking (calendar, stats, selection summary, map), so quick clicks send one request per endpoint.

| Param | Frontend sends | Notes |
|---|---|---|
| `from`, `to` | `2008-01-01`, `2008-12-31` | Always sent. Month selected → that month's range |
| `lat`, `lon`, `radius_km` | `41.9`, `12.5`, `50` | Only when a circle is picked |
| `polygon` | `[[12.1,41.8],[12.9,41.8],[12.5,42.2]]` | Only when a polygon is drawn; never sent with a circle or region. Simplify freehand drawings to ≤ 200 points **and round coordinates to 5 decimals** (≈ 1 m): 200 full-precision points make a 9 KB URL, and the gateway answers HTML `414` instead of JSON (≈ 5.6 KB at 5 decimals is fine). Forbid self-intersecting shapes in the drawing tool |
| `region` | `812` | Only when a region is picked from `/api/regions`; never sent with a circle or polygon. Show the credit "Boundaries: geoBoundaries" (CC BY) on the map |
| `type` | `0` or `0,2` | Absent → all types |
| `daynight` | `D` / `N` | Absent → both |
| `sensor` | `MODIS`, `VIIRS` or `MODIS,VIIRS` | Always sent. Absent → all sensors. Counts are raw sums, not harmonized (method TBD) |
| `bbox` | `5.33,35.11,17.34,47.12` | Map requests only (`/hotspots` from zoom 9, `/hotspots/grid` below): visible bounds + 10 % per side, rounded outward to 0.01°. Never sent to stats, calendar, CSV, `/selection-summary`, or the GeoJSON export's `/hotspots` |
| `cell` | `1` | `/hotspots/grid` only: `90 / 2^zoom` snapped to 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01 |
| `include_non_fire` | `true` | Only while "show excluded" is on; then on every data request (stats, calendar, grid, hotspots, CSV), so the views stay consistent. Absent → non_fire hidden |
| `min_confidence` | `60` | Only while the confidence slider is above its "off" position; then on every data request, like `include_non_fire`. Tell the user that unscored points (no confidence yet) are hidden while it is on |

Responses:

| Endpoint | Frontend expects |
|---|---|
| `GET /api/hotspots` | `FeatureCollection`, coordinates `[lon, lat]`. `properties` use the [1] column names and types (not [2]): `sensor`, `acq_time` as 4-digit string, `confidence` as integer (MODIS only, `null` for VIIRS), `confidence_level` as `low`/`nominal`/`high` for both sensors. Only `frp`, `confidence` and `confidence_level` may be `null`, plus the 4 `confidence_score` / `confidence_class` / `confidence_reasons` / `worldview_url` fields ([1b] fire confidence; `null` = not scored). No match → `"features": []` |
| `GET /api/hotspots/grid` | Shape as above. No match → `"cells": []` |
| `GET /api/harmonized` | Sends `country` = the selected region's country, else `EUR`. Shows full calendar years only (12 months); raw next to harmonized per year. Empty `months` → the card is hidden |
| `GET /api/stats` | Shape as above. No match → `{ "total": 0, "frp_sum": 0, "by_type": {}, "by_daynight": {}, "by_class": { "non_fire": {} } }` |
| `GET /api/calendar` | Days sorted by `date` ascending; days with count 0 omitted. No match → `{ "days": [] }` |
| `GET /api/selection-summary` | Shape as above. Requested only while the selection card is shown (an area is selected, compare mode off) |
| `GET /api/hotspots.csv` | `Content-Type: text/csv`, `Content-Disposition: attachment; filename="hotspots_<from>_<to>.csv"` |

General:

| Rule | Value |
|---|---|
| Empty result | 200, never 404 |
| Invalid params | 400 + `{ "error": "<message>" }`; message is shown to the user as is |
| URLs | Relative `/api/...` via gateway; no CORS |
| Speed | `/api/hotspots` for all Italy 2008 (~6.7k features) under 1 s |