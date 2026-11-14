# Viewport loading

Owner: DevOps (API + web + infra). Branch: `web/viewport`. API owner reviews. Status: built.

## Problem

Every visitor downloads a whole year (up to 437k points, ~650 MB API heap per request). Many visitors at once → the gateway
limit answers "Server busy", or the API runs out of memory. The map only needs what is on screen.

## Behaviour

- After the map stops moving for **300 ms**, the frontend asks only for the visible area (map bounds + 10 % padding).
- **Zoom < 9:** grid bubbles from `GET /api/hotspots/grid`. Bubble at the cell's average position, size by count,
  color by most common `type`, count as text. Click → zoom in on that bubble (same as today).
- **Zoom ≥ 9:** single points from `GET /api/hotspots?bbox=…`. Same dot style and popup as today.
- A new move cancels the previous request (AbortController).
- On a failed request the map clears and shows the error. It never keeps old dots under a new label (the "stale map").
- Stat cards and calendar are unchanged: they follow filters + selected area, never the viewport.
- **Selection card:** requests `/api/hotspots` with the selected area (no bbox) and computes the summary as today. Over the
  row cap → card shows the API error.
- CSV export unchanged (filters + area, server side).

## API (contracts.md [3])

### `bbox` parameter

`bbox=west,south,east,north` in degrees, accepted by `/api/hotspots` and `/api/hotspots/grid`.
- 4 numbers, `-180 ≤ west < east ≤ 180`, `-90 ≤ south < north ≤ 90`. Else 400. No antimeridian wrap.
- Combines with every other filter (AND), including `region` / `polygon` / circle.
- SQL: `latitude BETWEEN … AND longitude BETWEEN …` (uses the existing `(latitude, longitude)` index).

### `GET /api/hotspots/grid`

Params: all shared filters + `bbox` (required) + `cell` (degrees, required, `0.01 ≤ cell ≤ 10`).

```json
{ "cell": 0.5, "cells": [ { "lat": 41.93, "lon": 12.48, "count": 812, "type": 0 } ] }
```

- One entry per non-empty cell: `floor(latitude / cell)`, `floor(longitude / cell)`.
- `lat` / `lon` = average position of the points in that cell. `type` = most common type (`mode()`); ties → lowest.
- Over 20,000 cells → 400 `{ "error": "Too many cells, zoom in or use a bigger cell" }`.
- Empty → `{ "cell": …, "cells": [] }`, 200.

Frontend cell size: about 64 px on screen → `cell = 90 / 2^zoom` degrees, rounded to a fixed set
(10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01) so the gateway cache gets hits.

## Infra (gateway)

- **Cache** GET `/api/` responses with `proxy_cache` (key = full request URI, 200 for 10 min, `proxy_cache_lock on` so
  one request builds an answer while identical ones wait). Data changes only on a manual load; after a load, clear the
  cache (`docs/deploy.md` gets the command). Add `X-Cache-Status` header.
- Concurrency limit stays on `/api/hotspots` (points), split in two classes: heavy (no bbox) 2 per IP / 3 total, light (bbox) 6 per IP / 20 total. `/api/hotspots/grid` is light and cached: no limit beyond the
  global ones.
- Bbox requests rounded by the frontend to 0.01° so similar views share cache entries.

## Mocks

`frontend/src/api/mocks.ts` supports `bbox` and the grid endpoint, so PR CI (mocks) exercises the same code paths.

## Load test (after deploy)

k6 from the VPS against `http://127.0.0.1:8090`: 50 virtual users, random year (2003–2025), random sensor, random pan/zoom
→ grid or bbox points, for 2 minutes. Pass: p95 < 1.5 s, 0 % 5xx, API restarts = 0.

## Tests

- API unit tests (`api/test/`): bbox parsing (valid, reversed, out of range, wrong count), grid SQL builder, cell bounds.
- e2e contract tests: grid returns `cells` array (empty DB → `[]`), bad `bbox` / `cell` → 400, hotspots with bbox → every
  point inside the box.
- Existing e2e (`area-select`, `web`) stay green in mocks mode.

## Done when

- Zoomed out over Europe: one small grid response (< 200 KB gz) instead of a whole year.
- Zoomed in: points only for the view.
- Load test passes. Lint, unit tests, build, e2e pass.
