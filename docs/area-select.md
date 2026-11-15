# Area selection (map tool)

Owner: DevOps (helping web). Branch: `web/area-select`. Status: built (PR #17)

Covers challenge.md Should #1 (location picker) and Could #2 (CSV with filters).

## What the user does

1. Picks a tool on the map: **polygon** (click corners, click first corner to close), **rectangle** (click one corner, then the opposite corner), or **circle** (click the center, then the edge).
2. The shape appears. The whole dashboard (stat cards, calendar, map dots, CSV) switches to that area.
3. A floating **Selection card** opens in a map corner with the numbers below and export buttons.
4. **Clear** removes the shape and returns to all of Italy.

One selection at a time. A new shape replaces the old one.

## How it works

The lasso only sets `filters.area` (`frontend/src/types/api.ts`). Everything else already exists:

- `selectionQuery` / `yearQuery` (`frontend/src/utils/filters.ts`) send `polygon=` or `lat`/`lon`/`radius_km` — contracts.md [3].
- Mocks already filter by polygon and circle (`frontend/src/api/mocks.ts`).

| Tool | `filters.area` |
|---|---|
| Polygon | `{ kind: 'polygon', points: [[lon, lat], ...] }` — open ring, first point not repeated |
| Rectangle | same, 4 corners |
| Circle | `{ kind: 'circle', lat, lon, radiusKm }` |

No API or contract change.

## Selection card

Numbers from `GET /api/selection-summary` (contracts.md [3]), aggregated in SQL; the browser adds only the area (`utils/selectionSummary.ts`). Hidden in compare mode, and not requested there.

| Field | Rule |
|---|---|
| Area | km², 1 decimal under 100, else whole number. Polygon: `@turf/area`. Circle: π·r². |
| Hotspots | feature count |
| Density | hotspots per 1,000 km² |
| Types | count per `type` (vegetation vs noise), labels from `FIRE_TYPES` |
| Day / night | count of `D` and `N` |
| FRP (MW) | sum, mean, max. Skip `null`. All null → `—` |
| Peak | busiest month and busiest day. Tie → earliest |
| First / last | earliest and latest `acq_date` |
| Export | **CSV** (existing download, area included) · **GeoJSON** (dots + the shape as one `FeatureCollection`, made in the browser; circle exported as a 64-point polygon with `radius_km` in its properties). The dots are fetched from `/api/hotspots` only on click (button shows `Preparing…`; an API error such as the row cap shows under the buttons) |

Zero hotspots → card shows area and "No hotspots in this area" and hides the other rows. Exports stay enabled (empty file is valid).

## Lat / lon inputs

Drawing a circle fills three inputs: lat, lon, radius (km). Editing an input moves the circle. Rules: lat −90..90, lon −180..180, radius > 0 and ≤ 1000. Invalid → red input + message, filter not changed.

## Libraries

- `@geoman-io/leaflet-geoman-free` — draw/edit tools. Wrap in a small `useGeoman` hook (no react-leaflet wrapper exists). Turn off self-intersection (`allowSelfIntersection: false`).
- `@turf/area` — polygon area on the globe.

Pin exact versions in `frontend/package.json`.

## Edge cases

- Shape outside Italy → empty result, card says so. Not an error.
- Polygon with < 3 points → not committed.
- Editing / dragging a shape updates the filter once on edit end, not on every mouse move.
- Changing year, month, day, type or day/night keeps the shape.
- Clicking a dot still opens its popup when no tool is active.
- Phone width: card collapses to one line (count + area) and expands on tap. Map is 42vh there.
- Phone collapsed line has × to clear (`selection-clear-compact`), so no need to expand first.
- Long polygons: a click polygon has few points; URL length is fine.

## Tests

- Unit (pure functions): summary math — empty, all FRP null, ties, single point. API: `api/test/summary.test.js`. Parity with the old per-dot summary: `frontend/src/utils/selectionSummary.parity.test.ts` and `e2e/tests/contract-api.spec.js` (summary vs the same area's `/api/hotspots` dots).
- e2e (`e2e/tests/area-select.spec.js`): draw a rectangle (two clicks) on the map → card shows area > 0 → total hotspots on the stat card drops → Clear restores the full count. Runs against mocks (`VITE_USE_MOCKS=true` is the Dockerfile default, so mocks make no `/api` request). When the real API ships, add a check that `/api/hotspots` requests contain `polygon=`.

## Done when

- All three tools work with mouse and touch.
- Dashboard + card follow the shape; Clear resets.
- CSV and GeoJSON downloads contain only the selected dots.
- `npm run lint` and `npm run build` pass; e2e green in PR CI.
