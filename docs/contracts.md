# Contracts

The exact data shape passed between stages. Each stage depends only on the contract before it.
Change a shape → edit this file in the same PR → tag the owner of the next stage as reviewer.

Status: **DRAFT** — sections marked TBD are filled by their owner.

```
data/raw/*.csv ─[1]─▶ data/processed/hotspots.csv ─[2]─▶ Postgres ─[3]─▶ HTTP JSON ─▶ web/
```

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

## [2] db/ schema

Postgres 17. Load `hotspots.csv` into one table, then build aggregates as views.

```sql
CREATE TABLE hotspots (
  id          INTEGER PRIMARY KEY,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  acq_date    DATE NOT NULL,
  acq_time    CHAR(4) NOT NULL,
  sensor      TEXT NOT NULL,
  satellite   TEXT NOT NULL,
  daynight    CHAR(1) NOT NULL,
  frp         DOUBLE PRECISION,
  confidence  SMALLINT,
  type        SMALLINT NOT NULL
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
