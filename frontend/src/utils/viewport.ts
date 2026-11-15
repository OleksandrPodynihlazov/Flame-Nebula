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

export function viewFor(bounds: Bounds, zoom: number): View | null {
  const bbox = bboxParam(bounds)
  if (bbox === null) return null
  const z = Math.round(zoom)
  return { bbox, cell: z >= SINGLE_DOT_ZOOM ? null : cellForZoom(z) }
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
