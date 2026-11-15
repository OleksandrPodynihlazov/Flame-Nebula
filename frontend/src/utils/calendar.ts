import type { CalendarResponse, Month } from '../types/api'
import { daysInMonth, isoDate } from './filters'

export interface CalendarGrid {
  counts: (number | null)[][]
  /** Summed FRP (MW) per day, same shape as `counts`; 0 where there is no day. */
  dayFrp: number[][]
  monthTotals: number[]
  /** Summed FRP (MW) per month. */
  monthFrp: number[]
  total: number
  maxDay: number
  peakMonth: { month: Month; count: number } | null
}

/**
 * The grid for `year`, or null while `cal` is not for that year: null (no answer yet) or the previous
 * year's days still on screen after the year changed. Never a grid of zeros that only looks empty.
 */
export function gridForYear(year: number, cal: CalendarResponse | null): CalendarGrid | null {
  if (cal === null) return null
  const first = cal.days[0]
  return first && !first.date.startsWith(`${year}-`) ? null : buildGrid(year, cal)
}

export function buildGrid(year: number, cal: CalendarResponse): CalendarGrid {
  const counts: (number | null)[][] = Array.from({ length: 12 }, (_, m) => {
    const len = new Date(Date.UTC(year, m + 1, 0)).getUTCDate()
    return Array.from({ length: 31 }, (_, d) => (d < len ? 0 : null))
  })
  const dayFrp = counts.map((row) => row.map(() => 0))
  const monthFrp = new Array<number>(12).fill(0)
  for (const { date, count, frp } of cal.days) {
    const [y, m, d] = date.split('-').map(Number)
    if (y === year && counts[m - 1]?.[d - 1] !== null) {
      counts[m - 1][d - 1] = count
      dayFrp[m - 1][d - 1] = frp ?? 0
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
  return { counts, dayFrp, monthTotals, monthFrp: monthFrp.map((v) => Math.round(v * 10) / 10), total, maxDay, peakMonth: peak }
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

/** The busiest day of one month (earliest on ties), or null when the month has no detections. */
export function peakDay(grid: CalendarGrid, month: Month): { day: number; count: number } | null {
  let best: { day: number; count: number } | null = null
  grid.counts[month].forEach((count, di) => {
    if (count !== null && count > 0 && (!best || count > best.count)) best = { day: di + 1, count }
  })
  return best
}

const UTC_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** "Fri 15 Aug 2008", always in UTC. */
export function formatUtcDate(year: number, month: Month, day: number): string {
  return UTC_DATE.format(new Date(Date.UTC(year, month, day))).replace(',', '')
}

export interface CellPos {
  month: Month
  day: number
}

export const GRID_NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'] as const
export type GridNavKey = (typeof GRID_NAV_KEYS)[number]

export const isGridNavKey = (key: string): key is GridNavKey => (GRID_NAV_KEYS as readonly string[]).includes(key)

/**
 * Where a navigation key moves the calendar focus. Left/Right step one day and cross month boundaries; Up/Down and
 * PageUp/PageDown step one month and keep the day, clamped to the shorter month (29 Feb, 30 Apr); Home/End jump to the
 * first/last day of the row. At the edges of the year the position stays put.
 */
export function moveCell(key: GridNavKey, pos: CellPos, year: number): CellPos {
  const { month, day } = pos
  const monthStep = (delta: number): CellPos => {
    const next = month + delta
    if (next < 0 || next > 11) return pos
    return { month: next as Month, day: Math.min(day, daysInMonth(year, next as Month)) }
  }
  switch (key) {
    case 'ArrowLeft':
      if (day > 1) return { month, day: day - 1 }
      return month === 0 ? pos : { month: (month - 1) as Month, day: daysInMonth(year, (month - 1) as Month) }
    case 'ArrowRight':
      if (day < daysInMonth(year, month)) return { month, day: day + 1 }
      return month === 11 ? pos : { month: (month + 1) as Month, day: 1 }
    case 'ArrowUp':
    case 'PageUp':
      return monthStep(-1)
    case 'ArrowDown':
    case 'PageDown':
      return monthStep(1)
    case 'Home':
      return { month, day: 1 }
    case 'End':
      return { month, day: daysInMonth(year, month) }
  }
}

/** The one tabbable cell: the selected day, else today (when `todayIso` is in `year`), else the first day with data, else 1 Jan. */
export function defaultCell(grid: CalendarGrid, year: number, selectedDate: string | null, todayIso: string): CellPos {
  const fromIso = (iso: string): CellPos | null => {
    if (!iso.startsWith(`${year}-`)) return null
    const month = (Number(iso.slice(5, 7)) - 1) as Month
    const day = Number(iso.slice(8, 10))
    return grid.counts[month]?.[day - 1] !== undefined && grid.counts[month][day - 1] !== null ? { month, day } : null
  }
  const chosen = (selectedDate && fromIso(selectedDate)) || fromIso(todayIso)
  if (chosen) return chosen
  for (let m = 0; m < 12; m++) {
    const di = grid.counts[m].findIndex((c) => c !== null && c > 0)
    if (di >= 0) return { month: m as Month, day: di + 1 }
  }
  return { month: 0, day: 1 }
}

export interface Size {
  width: number
  height: number
}

export interface Placement {
  left: number
  top: number
  side: 'top' | 'bottom'
}

/** Position a floating tip of `tip` size near `anchor`: above it, flipped below when there is no room, clamped horizontally into the viewport. */
export function placeTip(anchor: { left: number; right: number; top: number; bottom: number }, tip: Size, viewport: Size, gap = 8, margin = 8): Placement {
  const side = anchor.top - gap - tip.height >= margin ? 'top' : 'bottom'
  const top = side === 'top' ? anchor.top - gap - tip.height : anchor.bottom + gap
  const centered = (anchor.left + anchor.right) / 2 - tip.width / 2
  const left = Math.max(margin, Math.min(centered, viewport.width - tip.width - margin))
  return { left, top, side }
}
