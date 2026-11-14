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
| `satellite` | text | As in raw file |
| `daynight` | `D` / `N` | |
| `frp` | float | MW |
| `confidence` | integer 0–100 | MODIS: as is. VIIRS: mapping TBD |
| `type` | integer 0–3 | As in raw file |

MVP: MODIS rows only; this is a cleaned copy of the raw file.

**Harmonization (owner: harmonization teammate). Implemented in the DB, on top of `hotspots`.** Raw rows are loaded as-is
(`ingest/load_hotspots.py`); the processed CSV above is not produced. Nothing in `hotspots` is modified.
How to build: `docs/data-sources.md` → *Harmonize*. Method and evidence: `research/07-harmonization-deep-dive.md` §8, §13.

| Object | Kind | What the backend uses it for |
|---|---|---|
| `coverage(satellite, day, status, note)` | table | `status` ∈ `ok`/`partial`/`missing` per satellite × UTC day. **Draw non-ok days as "no data", never as 0.** |
| `static_mask(cell_lat, cell_lon, category, core, qualifying_years)` | table | Industrial sites / flares (`static`) and `volcano` cells, grid `floor(deg*100)`, built from S-NPP. |
| `hotspots_flagged` | view | `hotspots` + `mask_category` + `is_burning` (= not masked and `type` ≠ 3). **Count burning activity with `WHERE is_burning`.** Map/CSV can show all rows with the flag. |
| `calibration` | table | Per-month junction factors (J1 Terra→Aqua, J2 Aqua→S-NPP) for `count` and `frp`, with interquartile band. |
| `calibration_chain(satellite, month, metric, factor, band_lo, band_hi)` | view | **Multiplier to S-NPP-equivalent units.** For any AOI and month: take the month's reference satellite, aggregate `is_burning` rows, multiply by `factor` (band: `band_lo`/`band_hi`). Aggregates only, never single points. |
| `harmonized_monthly` | view | Italy-wide ready series: `month_start, satellite` (reference), `raw_count, raw_frp, count_snpp_eq, count_lo, count_hi, frp_snpp_eq, frp_lo, frp_hi, days_ok, days_partial, days_missing`. |

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
  type        SMALLINT NOT NULL          -- 0-3, empty in NRT data
);

```

Aggregates: TBD (owner: db). Minimum needed by the API: hotspot count per day, filtered by area and date range.

## [3] api/ endpoints

Base path `/api`. JSON. Errors return `{ "error": "<message>" }` with a 4xx/5xx code.

Shared query params (area + filters):

| Param | Example | Meaning |
|---|---|---|
| `from`, `to` | `2008-01-01`, `2008-12-31` | Date range, inclusive |
| `lat`, `lon`, `radius_km` | `41.9`, `12.5`, `50` | Circle area |
| `polygon` | `[[12.1,41.8],[12.9,41.8],[12.5,42.2]]` | Polygon area, `[lon, lat]` pairs (overrides circle) |
| `daynight` | `D` / `N` | Optional |
| `type` | `0` | Optional, comma list |

No area given → whole dataset (Italy).

| Method + path | Returns |
|---|---|
| `GET /api/hotspots` | GeoJSON `FeatureCollection` of points; properties = CSV columns |
| `GET /api/stats` | `{ "total": 6689, "by_type": { "0": 6473, ... }, "by_daynight": { "D": 5821, "N": 868 } }` |
| `GET /api/calendar` | `{ "days": [ { "date": "2008-08-14", "count": 42 }, ... ] }` |
| `GET /api/hotspots.csv` | CSV download, same columns as [1] |

Owner may change these; update this table first.

### Frontend requirements for [3]

Owner: frontend data layer. Change any row → tag the frontend owner as reviewer.

Requests: all endpoints accept every shared param from the table above, with the same meaning.

| Param | Frontend sends | Notes |
|---|---|---|
| `from`, `to` | `2008-01-01`, `2008-12-31` | Always sent. Month selected → that month's range |
| `lat`, `lon`, `radius_km` | `41.9`, `12.5`, `50` | Only when a circle is picked |
| `polygon` | `[[12.1,41.8],[12.9,41.8],[12.5,42.2]]` | Only when a polygon is drawn; never sent with a circle |
| `type` | `0` or `0,2` | Absent → all types |
| `daynight` | `D` / `N` | Absent → both |

Responses:

| Endpoint | Frontend expects |
|---|---|
| `GET /api/hotspots` | `FeatureCollection`, coordinates `[lon, lat]`. `properties` use the [1] column names and types (not [2]): `sensor`, `acq_time` as 4-digit string, `confidence` as integer. Only `frp` and `confidence` may be `null`. No match → `"features": []` |
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