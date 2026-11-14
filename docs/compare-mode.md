# Compare mode

Two years on one map, split by a draggable vertical divider. Left of the divider: year A, right: year B.

## Use

- **Compare** in the filters (desktop: top bar; phone: Filters button) turns it on. Year A starts at the selected year, year B at the latest year.
- Fire type, day/night, hide noise, sensors and the drawn area apply to both years. Month and day selection do not: each side is a full year.
- Drag the round handle, or focus it and use ←/→ (Home/End for the edges).
- Stats: one row per year; year B shows the change in hotspots vs year A.
- Below the stats (phone: pull the sheet up), the burn calendar is replaced by a bar chart of hotspots per month for both years.
- CSV export and the area summary card are off while comparing; they work on one year.
- A sensor that has no data in a year is dropped for that year; if none is left, MODIS is used.

## Reuse in another map view

The divider is map-agnostic. Draw each year into its own Leaflet pane, then mount `SwipeCompare` inside the `MapContainer`:

```tsx
<MyLayer query={queryA} pane={HOTSPOT_PANE} />
<MyLayer query={queryB} pane={HOTSPOT_PANE_B} />
<SwipeCompare leftPane={HOTSPOT_PANE} rightPane={HOTSPOT_PANE_B} left={…} right={…} leftColor={…} rightColor={…} />
```

`SwipeCompare` clips each pane to its side (CSS `clip`, recomputed on move/zoom/resize) and renders the divider and labels. It does not load data or know what the panes contain, so a pattern map only needs layers that accept a `pane`.

Other pieces:

| File | What |
|---|---|
| `components/compare/SwipeCompare.tsx` | Divider, labels, pane clipping |
| `components/compare/CompareBars.tsx` | Grouped bar chart, two series |
| `components/compare/CompareStats.tsx` | Stacked stats per year (desktop and phone) |
| `utils/compare.ts` | Filters for one year, default years, % change |
| `constants/compare.ts` | Year colors |
| `hooks/useDashboardData.ts` | `enabled` flag: year B loads only while comparing |
| `hooks/useHotspotLayer.ts` | `pane` argument |

Tests: `frontend/src/utils/compare.test.ts`, `e2e/tests/compare.spec.js`.
