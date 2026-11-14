# Map performance

Owner: DevOps (helping web). Branch: `web/map-perf`. Status: built.

## Problem

- Every dot is one React `<CircleMarker>`. 6.7k demo dots → load freezes of 108–131 ms. A VIIRS year has up to ~38k dots.
- A selection takes ~485 ms to apply. 300 ms of it is a fake delay (`MOCK_DELAY_MS` in `frontend/src/api/mocks.ts`).
- Each area change waits for hotspots, stats and calendar requests before the map changes.

## Changes

### 1. Clustering (challenge.md Should #2)

- Library: `supercluster` (pin exact). Index built once per hotspot response (`useMemo`), not on pan/zoom.
- Draw clusters and dots in **one** imperative Leaflet canvas layer, created outside React. No React component per dot.
- Bubble: radius grows with count (e.g. sqrt scale), fill = the most common `type` inside (colors from `FIRE_TYPES`), count as text.
- Click bubble → `map.fitBounds` to its expansion zoom.
- From zoom **9**: no clustering; every dot is drawn as today (type color, radius 3.5 / 5) and opens the same popup on click.
- Rebuild visible clusters on `moveend` / `zoomend` only.
- Legend and area-selection tools keep working. While a draw tool is active, dots and bubbles take no clicks (as today).

### 2. Selection applies at once

- Remove the fake mock delay from production builds. Keep it only when `VITE_MOCK_DELAY_MS` is set (dev).
- When `filters.area` changes, filter the already-loaded dots in the browser (point-in-polygon / haversine, same rules as `mocks.ts`) and draw them immediately. The selection card uses the same filtered dots.
- Server requests still run, in parallel. When the hotspots response arrives, it replaces the browser-filtered dots.
- Stat cards and calendar keep showing old numbers, dimmed (`aria-busy`), until their own response arrives. They never block the map.
- The map keeps the old dots while a request is loading (dimmed). No blank map.

## Not in scope

- Compact API format, server-side clustering, WebGL.
- Automated performance test. Check by hand (below).

## Manual check (before / after)

Script: `node <scratchpad>/perf.js` against `http://127.0.0.1:8090` (desktop 1440×900, demo data). Record:

| Metric | Before | After |
|---|---|---|
| Selection → stat total changes | 485 ms | 28–31 ms |
| Long tasks on load | 131, 108, 126 ms | one task, 58–98 ms |
| Long tasks on selection | 86, 58 ms | none |
| Same, CPU 4× slowdown | — | selection 107 ms; load 86–93 + 223 ms; selection 85 ms |

Also check with Chrome DevTools CPU 4× slowdown and with a 40k-dot mock (`VITE_MOCK_SIZE=40000`, dev only).

## Done when

- Map clusters at country zoom, single dots from zoom 9, popups still work.
- Selection: map and card change in < 100 ms on desktop (no network wait).
- Existing e2e (`area-select.spec.js`, `web.spec.js`) pass. Lint, unit tests, build pass.
