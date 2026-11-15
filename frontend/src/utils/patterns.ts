import type { Filters, PatternCell, PatternMonth, PatternQuery } from '../types/api'

export const LIKELY = 0.5
/** Map shows only cells that burned in at least 12 of 14 years that month. */
export const MIN_YEARS = 12
export const OF_YEARS = 14
export const MIN_PROBABILITY = 0.857
export const PATTERN_DEFAULT_MONTH = 8

export function patternQuery(f: Filters, month?: number): PatternQuery {
  const q: PatternQuery = { min_probability: MIN_PROBABILITY }
  if (month !== undefined) q.month = month
  if (f.area?.kind === 'circle') Object.assign(q, { lat: f.area.lat, lon: f.area.lon, radius_km: f.area.radiusKm })
  if (f.area?.kind === 'polygon') q.polygon = JSON.stringify(f.area.points)
  if (f.area?.kind === 'region') q.region = f.area.id
  return q
}

/** Pale → ember → deep red: --heat-6, --heat-4, --heat-2 (see RAMP in calendar.ts). */
const STOPS: [number, [number, number, number]][] = [
  [0, [255, 231, 163]],
  [0.5, [255, 122, 26]],
  [1, [142, 31, 11]],
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

/** Colour within the shown range: 12/14 → lightest, 14/14 → darkest. */
export function patternShade(p: number): string {
  return patternColor((p - MIN_PROBABILITY) / (1 - MIN_PROBABILITY))
}

export function formatProbability(p: number): string {
  return `${Math.round(p * 100)}%`
}

export interface PatternStatsData {
  cells: number
  everyYear: number
  maxProbability: number
  top: PatternCell | null
}

export function patternStats(cells: readonly PatternCell[] | null): PatternStatsData | null {
  if (!cells) return null
  let everyYear = 0
  let top: PatternCell | null = null
  for (const c of cells) {
    if (c.years_burned === c.years_observed) everyYear++
    if (!top || c.probability > top.probability || (c.probability === top.probability && c.median_count > top.median_count)) top = c
  }
  return { cells: cells.length, everyYear, maxProbability: top?.probability ?? 0, top }
}

export const YEAR_BANDS = ['12 of 14', '13 of 14', '14 of 14'] as const

/** Cells per band of years burned (as a share of years observed, so a month with fewer observed years still fits). */
export function yearBands(cells: readonly PatternCell[] | null): number[] {
  const out = [0, 0, 0]
  for (const c of cells ?? []) {
    if (c.probability >= 1) out[2]++
    else if (c.probability >= 13 / 14 - 1e-6) out[1]++
    else out[0]++
  }
  return out
}

export function peakPatternMonth(months: readonly PatternMonth[] | null): number | null {
  let best: PatternMonth | null = null
  for (const m of months ?? []) if (m.cells > 0 && (!best || m.cells > best.cells)) best = m
  return best?.month ?? null
}
