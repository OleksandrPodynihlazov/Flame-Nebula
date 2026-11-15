import type { CalendarResponse, Month } from '../types/api'
import { isoDate } from './filters'

export interface CalendarGrid {
  counts: (number | null)[][]
  monthTotals: number[]
  /** Summed FRP (MW) per month. */
  monthFrp: number[]
  total: number
  maxDay: number
  peakMonth: { month: Month; count: number } | null
}

export function buildGrid(year: number, cal: CalendarResponse): CalendarGrid {
  const counts: (number | null)[][] = Array.from({ length: 12 }, (_, m) => {
    const len = new Date(Date.UTC(year, m + 1, 0)).getUTCDate()
    return Array.from({ length: 31 }, (_, d) => (d < len ? 0 : null))
  })
  const monthFrp = new Array<number>(12).fill(0)
  for (const { date, count, frp } of cal.days) {
    const [y, m, d] = date.split('-').map(Number)
    if (y === year && counts[m - 1]?.[d - 1] !== null) {
      counts[m - 1][d - 1] = count
      monthFrp[m - 1] += frp ?? 0
    }
  }
  const monthTotals = counts.map((row) => row.reduce<number>((a, c) => a + (c ?? 0), 0))
  const total = monthTotals.reduce((a, c) => a + c, 0)
  const maxDay = Math.max(0, ...counts.flat().map((c) => c ?? 0))
  let peak: CalendarGrid['peakMonth'] = null
  monthTotals.forEach((c, m) => {
    if (c > 0 && (!peak || c > peak.count)) peak = { month: m as Month, count: c }
  })
  return { counts, monthTotals, monthFrp: monthFrp.map((v) => Math.round(v * 10) / 10), total, maxDay, peakMonth: peak }
}
export const RAMP = ['#1a1f29', '#4a1208', '#8e1f0b', '#d2400f', '#ff7a1a', '#ffb43c', '#ffe7a3'] as const

export function rampIndex(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0
  const r = Math.log1p(count) / Math.log1p(max)
  return Math.min(RAMP.length - 1, 1 + Math.floor(r * (RAMP.length - 1 - 1e-9)))
}
export function rampBounds(max: number): number[] {
  const steps = RAMP.length - 1
  return Array.from({ length: steps }, (_, i) => Math.round(Math.expm1(((i + 1) / steps) * Math.log1p(max))))
}

/** Heat scale step as a CSS colour (the `--heat-*` tokens in index.css mirror RAMP). */
export const heatVar = (idx: number): string => `var(--heat-${idx})`

/**
 * Text class that stays readable on a heat step: dark ink from heat-4 up; white on heat-3, where dark ink
 * only reaches 4.2:1 and white 4.7:1; the regular foreground on the darker steps.
 */
export function heatInk(idx: number): string {
  if (idx >= 4) return 'text-background'
  return idx === 3 ? 'text-white' : 'text-foreground'
}

export interface BusyDay {
  date: string
  count: number
}

/** The `n` days with the most detections (ties: earlier date first), optionally within one month. Days without detections are never listed. */
export function topDays(grid: CalendarGrid, year: number, month: Month | null, n: number): BusyDay[] {
  const days: BusyDay[] = []
  grid.counts.forEach((row, m) => {
    if (month !== null && m !== month) return
    row.forEach((count, d) => {
      if (count !== null && count > 0) days.push({ date: isoDate(year, m as Month, d + 1), count })
    })
  })
  return days.sort((x, y) => y.count - x.count || x.date.localeCompare(y.date)).slice(0, n)
}
