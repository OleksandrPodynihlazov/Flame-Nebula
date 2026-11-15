import type { Area, HarmonizedMonth, HarmonizedQuery } from '../types/api'

/** Harmonized series exist per country (ISO3) and for all of Europe. */
export const EUROPE = 'EUR'

export interface HarmonizedScope {
  query: HarmonizedQuery
  /** Shown in the card title, e.g. "Italy". */
  label: string
}

/** The selected region's country (a series is per country, so Sicilia shows Italy), otherwise all of Europe. */
export function harmonizedScope(area: Area | null): HarmonizedScope {
  if (area?.kind === 'region' && area.country) {
    const label = area.path ? area.path.split('›')[0].trim() : area.name
    return { query: { country: area.country }, label }
  }
  return { query: { country: EUROPE }, label: 'Europe' }
}

export interface YearPoint {
  year: number
  /** Raw detections of each month's reference satellite, summed. */
  raw: number
  /** The same in S-NPP-equivalent units. */
  count: number
  /** Reference satellites used in the year, in order. */
  satellites: string[]
}

/** Calendar years with all 12 months (the partial first and last years are left out). */
export function yearlySeries(months: readonly HarmonizedMonth[]): YearPoint[] {
  const byYear = new Map<number, { raw: number; count: number; months: number; satellites: string[] }>()
  for (const m of months) {
    const year = Number(m.month.slice(0, 4))
    const y = byYear.get(year) ?? { raw: 0, count: 0, months: 0, satellites: [] }
    y.raw += m.raw
    y.count += m.count
    y.months += 1
    if (!y.satellites.includes(m.satellite)) y.satellites.push(m.satellite)
    byYear.set(year, y)
  }
  return [...byYear.entries()]
    .filter(([, y]) => y.months === 12)
    .sort(([a], [b]) => a - b)
    .map(([year, y]) => ({ year, raw: y.raw, count: Math.round(y.count), satellites: y.satellites }))
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export interface YearVsMedian {
  point: YearPoint
  /** Median of the other years, S-NPP units. */
  median: number
  /** Fraction above (+) or below (−) that median. */
  change: number
}

/** The year against the median of all the other full years; null when the year is not in the series. */
export function yearVsMedian(points: readonly YearPoint[], year: number): YearVsMedian | null {
  const point = points.find((p) => p.year === year)
  const others = median(points.filter((p) => p.year !== year).map((p) => p.count))
  if (!point || others === null || others === 0) return null
  return { point, median: others, change: point.count / others - 1 }
}

const SATELLITE_NAMES: Record<string, string> = { Terra: 'Terra', Aqua: 'Aqua', N: 'S-NPP', N20: 'NOAA-20', N21: 'NOAA-21' }

export function satelliteName(code: string): string {
  return SATELLITE_NAMES[code] ?? code
}
