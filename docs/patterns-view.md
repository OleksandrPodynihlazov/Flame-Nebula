# Pattern view

A second map layer next to the hotspots: where fire comes back in a given month, from `fire_patterns`
(0.1° cells, S-NPP 2012–2025, built by `harmonize/patterns.py`).

## Use

- **Layers** button on the map (desktop: bottom right; phone: top left) switches Hotspots ↔ Patterns.
- Each 0.1° cell is a square. Colour and opacity = probability: the share of observed years in which the cell burned that month.
- Hover a cell (desktop) or tap it (phone): probability, years burned out of years observed, median detections that month, cell centre.
- Pick the month with the 12 month buttons (desktop panel; phone: pull the sheet up). The number on each = likely cells (≥ 50 %).
- Stats: likely cells, the most regular cell, cells with any fire history that month.
- Only the area filter applies (drawn area, circle, polygon, region search). Year, fire type, day/night and sensors are hotspot filters.
- Days and single years are not shown on purpose: a pattern is a month across years.

## Compare

Compare in pattern view puts two **months** side by side with the same divider as the hotspot compare
(`SwipeCompare`, docs/compare-mode.md). Stats show one row per month with the change in likely cells;
the chart shows how many cells fall into each probability band for both months.

## Files

| File | What |
|---|---|
| `api/lib/patterns-sql.js` | SQL for `/api/patterns` and `/api/patterns/summary` (contract [3]) |
| `frontend/src/hooks/usePatternLayer.ts` | Cells as squares on a canvas in their own pane; tooltip / popup |
| `frontend/src/hooks/usePatternData.ts` | Cells for a month, per-month summary |
| `frontend/src/components/MapLayersButton.tsx` | The layer switch |
| `frontend/src/components/patterns/` | Month buttons, stats |
| `frontend/src/utils/patterns.ts` | Query, colours, stats, probability bands |

Tests: `api/test/patterns-sql.test.js`, `frontend/src/utils/patterns.test.ts`, `e2e/tests/patterns.spec.js`,
`e2e/tests/contract-api.spec.js` (`/api/patterns`).
