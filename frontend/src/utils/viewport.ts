import { SINGLE_DOT_ZOOM } from './clusters'

/** Edges of the visible map in degrees, as Leaflet reports them (longitudes may pass ±180). */
export interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

/** What the map asks the API for: `cell` null = single points (`/hotspots`), else grid (`/hotspots/grid`). */
export interface View {
  bbox: string
  cell: number | null
  /** Whole zoom level of the view (floored), for the grid that stands in for points. */
  zoom: number
}

/** Share of the view added beyond each edge, so a short pan already has data. */
export const VIEW_PADDING = 0.1
/** Fixed cell sizes in degrees, so equal views make equal URLs (gateway cache hits). */
export const CELLS = [10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01] as const

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * `west,south,east,north` for the API: bounds + VIEW_PADDING per side, rounded outward to 0.01°,
 * clamped to the world. Null when nothing of [-180, 180] is in view (a wrapped world copy).
 */
export function bboxParam(b: Bounds, padding = VIEW_PADDING): string | null {
  const dx = (b.east - b.west) * padding
  const dy = (b.north - b.south) * padding
  const west = clamp(Math.floor((b.west - dx) * 100) / 100, -180, 180)
  const east = clamp(Math.ceil((b.east + dx) * 100) / 100, -180, 180)
  const south = clamp(Math.floor((b.south - dy) * 100) / 100, -90, 90)
  const north = clamp(Math.ceil((b.north + dy) * 100) / 100, -90, 90)
  if (west >= east || south >= north) return null
  return [west, south, east, north].map((n) => n.toFixed(2)).join(',')
}

/** About 64 px on screen: 90 / 2^zoom degrees, snapped to the nearest size in CELLS (log scale). */
export function cellForZoom(zoom: number): number {
  const want = 90 / 2 ** zoom
  let best: number = CELLS[0]
  for (const c of CELLS) if (Math.abs(Math.log(c / want)) < Math.abs(Math.log(best / want))) best = c
  return best
}

/**
 * Single points only when the zoom really is SINGLE_DOT_ZOOM or more (the map snaps to 0.25 steps, so 8.5
 * must not count as 9: twice the area, far more points). Floor for the grid cell too: it equals the old
 * rounded choice at whole zooms, and a fractional zoom gets the cell of the zoom below, which is at most
 * as many cells as the view needs, and keeps the set of distinct URLs small.
 */
export function viewFor(bounds: Bounds, zoom: number): View | null {
  const bbox = bboxParam(bounds)
  if (bbox === null) return null
  const z = Math.floor(zoom)
  return { bbox, cell: z >= SINGLE_DOT_ZOOM ? null : cellForZoom(z), zoom: z }
}

/** The grid endpoint refuses more cells than this in one request (docs/contracts.md). */
export const GRID_MAX_CELLS = 20000

/**
 * Cell size for the grid shown instead of single points in a view that holds too many: the same ~64 px
 * rule as the normal grid (`cellForZoom(zoom)`), coarsened to the next bigger size in CELLS only while the
 * box (bbox area / cell², an upper bound of the non-empty cells) would exceed GRID_MAX_CELLS. An unreadable
 * bbox gets the cell of the zoom below SINGLE_DOT_ZOOM.
 */
export function fallbackCell(bbox: string, zoom: number): number {
  const [west, south, east, north] = bbox.split(',').map(Number)
  const wanted = cellForZoom(zoom)
  for (const c of CELLS.filter((size) => size >= wanted).reverse()) {
    if (Math.ceil((east - west) / c) * Math.ceil((north - south) / c) <= GRID_MAX_CELLS) return c
  }
  return cellForZoom(SINGLE_DOT_ZOOM - 1)
}

/** The grid cell holding a point: [[south, west], [north, east]] (Leaflet order). */
export function cellBounds(lat: number, lon: number, cell: number): [[number, number], [number, number]] {
  const south = Math.floor(lat / cell) * cell
  const west = Math.floor(lon / cell) * cell
  return [
    [south, west],
    [south + cell, west + cell],
  ]
}
