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
| `confidence` | integer 0–100 | MODIS: as is. VIIRS: mapping TBD |
| `type` | integer 0–3, or empty | As in raw file. Empty (NULL) for NRT/API rows: those files have no `type` |

MVP: MODIS rows only; this is a cleaned copy of the raw file.

**Harmonization (owner: harmonization teammate). Implemented in the DB, on top of `hotspots`.** Raw rows are loaded as-is
(`ingest/load_hotspots.py`); the processed CSV above is not produced. Nothing in `hotspots` is modified.
How to build: `docs/data-sources.md` → *Harmonize*. Method and evidence: `research/07-harmonization-deep-dive.md` §8, §13.

| Object | Kind | What the backend uses it for |
|---|---|---|
| `coverage(satellite, day, status, note)` | table | `status` ∈ `ok`/`partial`/`missing` per satellite × UTC day. **Draw non-ok days as "no data", never as 0.** |
| `static_mask(cell_lat, cell_lon, category, core, qualifying_years)` | table | Industrial sites / flares (`static`) and `volcano` cells, grid `floor(deg*100)`, built from S-NPP. |
| `hotspots_flagged` | view | `hotspots` + `mask_category` + `is_burning` (= not masked and `type` ≠ 3; NULL `type` counts as land). **Count burning activity with `WHERE is_burning`.** Map/CSV can show all rows with the flag. |
| `calibration` | table | Per-month junction factors (J1 Terra→Aqua, J2 Aqua→S-NPP) for `count` and `frp`, with interquartile band. |
| `calibration_chain(satellite, month, metric, factor, band_lo, band_hi)` | view | **Multiplier to S-NPP-equivalent units.** For any AOI and month: take the month's reference satellite, aggregate `is_burning` rows, multiply by `factor` (band: `band_lo`/`band_hi`). Aggregates only, never single points. |
| `harmonized_monthly` | view | Italy-wide ready series: `month_start, satellite` (reference), `raw_count, raw_frp, count_snpp_eq, count_lo, count_hi, frp_snpp_eq, frp_lo, frp_hi, days_ok, days_partial, days_missing`. |
| `fire_patterns(cell_lat, cell_lon, month, years_burned, years_observed, probability, median_count)` | table | **Recurring fires, for "what to expect this month".** Cell = `floor(deg*10)` (0.1°), `month` 1–12, S-NPP only, `is_burning` rows. `probability = years_burned / years_observed`; `median_count` = detections per burned year. Sparse: no row = 0 for that month. Never mix with MODIS (design: `docs/superpowers/specs/2026-11-14-fire-patterns-design.md`). |

Reference satellite of a month = the newest one covering the **whole** month: Terra 2000-11 → 2002-07, Aqua 2002-08 → 2012-01,
S-NPP 2012-02 →. Never sum satellites. Hotspot counts from the other satellites stay available for the map and CSV.

## [2] db/ schema

Postgres 17. name: hotspots-init.sql

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
| Drawn polygon | `point(longitude, latitude) <@ $1::polygon` (exactly this form, so `hotspots_point_gist` is used) |
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
| `bbox` | `6.50,36.50,18.75,47.10` | Optional visible map area `west,south,east,north` in degrees: 4 numbers, `-180 ≤ west < east ≤ 180`, `-90 ≤ south < north ≤ 90`, else 400. No antimeridian wrap. ANDed with every other filter, including `region` / `polygon` / circle. SQL `latitude BETWEEN … AND longitude BETWEEN …` (uses the `(latitude, longitude)` index) |

`region` cannot be combined with `polygon` or a circle → 400 `Send one area: region, polygon or circle`. If `polygon` and a circle are both sent, the polygon wins (the frontend never sends both).
Unknown `region` id → 400. No area given → all loaded data (currently Europe; send `region` to limit to a country).

| Method + path | Returns |
|---|---|
| `GET /api/hotspots` | GeoJSON `FeatureCollection` of points; properties = CSV columns |
| `GET /api/stats` | `{ "total": 6689, "by_type": { "0": 6473, ... }, "by_daynight": { "D": 5821, "N": 868 } }` |
| `GET /api/calendar` | `{ "days": [ { "date": "2008-08-14", "count": 42 }, ... ] }` |
| `GET /api/hotspots/grid` | Hotspots counted per grid cell, for the zoomed-out map. See below |
| `GET /api/hotspots.csv` | CSV download, same columns as [1] |
| `GET /api/regions` | `{ "regions": [ { "id": 812, "name": "Sicilia", "level": 2, "country": "ITA", "parent_id": 77, "path": "Italy › Isole" } ] }`. No params → countries (level 0, `path` `""`); `?parent=<id>` → its children; `?q=<text>` → name search, 2–100 chars, case- and accent-insensitive, prefix matches first, max 20. `q` with `parent` → 400. Sorted by name. Not loaded yet → `"regions": []` |
| `GET /api/regions/:id` | GeoJSON `Feature`: `geometry` = simplified outline (Polygon / MultiPolygon), `properties` = the fields above. Unknown id → 404 `{ "error": … }` |

Row cap: `GET /api/hotspots` and `GET /api/hotspots.csv` return at most `HOTSPOTS_MAX_ROWS` rows (env; 500000 in `docker-compose.yml`, code fallback 200000). More matching rows → 400 `{ "error": "Too many hotspots (more than <cap>). Narrow the date range or area." }`; never a truncated result. With `bbox` (map viewport) the cap is `HOTSPOTS_BBOX_MAX_ROWS` instead (env, default 20000) → 400 `{ "error": "Too many hotspots in view (more than <cap>). Zoom in." }`.

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

Owner may change these; update this table first.

### Frontend requirements for [3]

Owner: frontend data layer. Change any row → tag the frontend owner as reviewer.

Requests: all endpoints accept every shared param from the table above, with the same meaning.

| Param | Frontend sends | Notes |
|---|---|---|
| `from`, `to` | `2008-01-01`, `2008-12-31` | Always sent. Month selected → that month's range |
| `lat`, `lon`, `radius_km` | `41.9`, `12.5`, `50` | Only when a circle is picked |
| `polygon` | `[[12.1,41.8],[12.9,41.8],[12.5,42.2]]` | Only when a polygon is drawn; never sent with a circle or region. Simplify freehand drawings to ≤ 200 points **and round coordinates to 5 decimals** (≈ 1 m): 200 full-precision points make a 9 KB URL, and the gateway answers HTML `414` instead of JSON (≈ 5.6 KB at 5 decimals is fine). Forbid self-intersecting shapes in the drawing tool |
| `region` | `812` | Only when a region is picked from `/api/regions`; never sent with a circle or polygon. Show the credit "Boundaries: geoBoundaries" (CC BY) on the map |
| `type` | `0` or `0,2` | Absent → all types |
| `daynight` | `D` / `N` | Absent → both |
| `sensor` | `MODIS`, `VIIRS` or `MODIS,VIIRS` | Always sent. Absent → all sensors. Counts are raw sums, not harmonized (method TBD) |
| `bbox` | `5.33,35.11,17.34,47.12` | Map requests only (`/hotspots` from zoom 9, `/hotspots/grid` below): visible bounds + 10 % per side, rounded outward to 0.01°. Never sent to stats, calendar, CSV, or the selection card's `/hotspots` |
| `cell` | `1` | `/hotspots/grid` only: `90 / 2^zoom` snapped to 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01 |

Responses:

| Endpoint | Frontend expects |
|---|---|
| `GET /api/hotspots` | `FeatureCollection`, coordinates `[lon, lat]`. `properties` use the [1] column names and types (not [2]): `sensor`, `acq_time` as 4-digit string, `confidence` as integer. Only `frp` and `confidence` may be `null`. No match → `"features": []` |
| `GET /api/hotspots/grid` | Shape as above. No match → `"cells": []` |
| `GET /api/stats` | Shape as above. No match → `{ "total": 0, "by_type": {}, "by_daynight": {} }` |
| `GET /api/calendar` | Days sorted by `date` ascending; days with count 0 omitted. No match → `{ "days": [] }` |
| `GET /api/hotspots.csv` | `Content-Type: text/csv`, `Content-Disposition: attachment; filename="hotspots_<from>_<to>.csv"` |

General:

| Rule | Value |
|---|---|
| Empty result | 200, never 404 |
| Invalid params | 400 + `{ "error": "<message>" }`; message is shown to the user as is |
| URLs | Relative `/api/...` via gateway; no CORS |
| Speed | `/api/hotspots` for all Italy 2008 (~6.7k features) under 1 s |