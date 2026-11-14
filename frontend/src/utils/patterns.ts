import type { Filters, PatternCell, PatternMonth, PatternQuery } from '../types/api'

export const LIKELY = 0.5
export const PATTERN_DEFAULT_MONTH = 8

export function patternQuery(f: Filters, month?: number): PatternQuery {
  const q: PatternQuery = {}
  if (month !== undefined) q.month = month
  if (f.area?.kind === 'circle') Object.assign(q, { lat: f.area.lat, lon: f.area.lon, radius_km: f.area.radiusKm })
  if (f.area?.kind === 'polygon') q.polygon = JSON.stringify(f.area.points)
  if (f.area?.kind === 'region') q.region = f.area.id
  return q
}

const STOPS: [number, [number, number, number]][] = [
  [0, [253, 230, 138]],
  [0.5, [249, 115, 22]],
  [1, [185, 28, 28]],
]

export function patternRgb(p: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, p))
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i]
    const [p0, c0] = STOPS[i - 1]
    if (x <= p1) {
      const t = (x - p0) / (p1 - p0)
      return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * t)) as [number, number, number]
    }
  }
  return STOPS[STOPS.length - 1][1]
}

export function patternColor(p: number): string {
  const [r, g, b] = patternRgb(p)
  return `rgb(${r}, ${g}, ${b})`
}

export function formatProbability(p: number): string {
  return `${Math.round(p * 100)}%`
}

export interface PatternStatsData {
  cells: number
  likely: number
  maxProbability: number
  top: PatternCell | null
}

export function patternStats(cells: readonly PatternCell[] | null): PatternStatsData | null {
  if (!cells) return null
  let likely = 0
  let top: PatternCell | null = null
  for (const c of cells) {
    if (c.probability >= LIKELY) likely++
    if (!top || c.probability > top.probability || (c.probability === top.probability && c.median_count > top.median_count)) top = c
  }
  return { cells: cells.length, likely, maxProbability: top?.probability ?? 0, top }
}

export const PROBABILITY_BUCKETS = ['<20%', '20–40%', '40–60%', '60–80%', '80–100%'] as const

export function probabilityBuckets(cells: readonly PatternCell[] | null): number[] {
  const out = new Array<number>(PROBABILITY_BUCKETS.length).fill(0)
  for (const c of cells ?? []) out[Math.min(PROBABILITY_BUCKETS.length - 1, Math.floor(c.probability * 5))]++
  return out
}

export function peakPatternMonth(months: readonly PatternMonth[] | null): number | null {
  let best: PatternMonth | null = null
  for (const m of months ?? []) if (m.likely > 0 && (!best || m.likely > best.likely)) best = m
  return best?.month ?? null
}
