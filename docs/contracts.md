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

**Harmonization method: TBD** (owner: harmonization teammate). It may add columns (e.g. a weight or scaled count). Add them here before any downstream stage uses them.

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

Suggested API use ([3] owner decides): add `confidence_score`, `confidence_class`, `confidence_reasons`, `worldview_url`
to `GET /api/hotspots` feature properties via `LEFT JOIN hotspot_confidence USING (satellite, acq_date, acq_time, latitude, longitude)`;
optional filter `min_confidence=<0-100>` and `exclude_non_fire=true`. Missing join row → properties are `null`.

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