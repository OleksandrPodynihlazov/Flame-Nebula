import turfArea from '@turf/area'
import type { Area, DayNight, FireType, HotspotFeature, Month, SelectionSummaryResponse } from '../types/api'

export interface SelectionSummary {
  areaKm2: number
  count: number
  /** Hotspots per 1,000 km²; null when the area is 0. */
  densityPer1000Km2: number | null
  byType: Record<FireType, number>
  byDaynight: Record<DayNight, number>
  /** Over non-null `frp` values only; null when every value is null (or no hotspots). */
  frp: { sum: number; mean: number; max: number } | null
  /** Busiest month and day; ties go to the earliest. */
  peakMonth: { month: Month; count: number } | null
  peakDay: { date: string; count: number } | null
  firstDate: string | null
  lastDate: string | null
}

const isMonth = (n: number): n is Month => Number.isInteger(n) && n >= 0 && n <= 11

/** Area of the selection in km². Polygon and region outline: geodesic (@turf/area). Circle: π·r². */
export function areaKm2(area: Area): number {
  if (area.kind === 'circle') return Math.PI * area.radiusKm ** 2
  if (area.kind === 'region') return turfArea(area.geometry) / 1e6
  if (area.points.length < 3) return 0
  const ring = [...area.points, area.points[0]]
  return turfArea({ type: 'Polygon', coordinates: [ring] }) / 1e6
}

/** 1 decimal under 100 km², whole number from 100 up. */
export function formatAreaKm2(km2: number, locale?: string): string {
  return Math.round(km2 * 10) / 10 < 100
    ? km2.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : Math.round(km2).toLocaleString(locale)
}

/**
 * `GET /api/selection-summary` from already loaded dots: what mocks answer, with the API's rules
 * (FRP over non-null values; busiest `YYYY-MM` month and day, ties to the earliest; no zero counts).
 */
export function summarizeFeatures(features: readonly HotspotFeature[]): SelectionSummaryResponse {
  const res: SelectionSummaryResponse = {
    total: features.length,
    frp: null,
    peak_month: null,
    peak_day: null,
    first: null,
    last: null,
    by_type: {},
    by_daynight: {},
  }
  const days = new Map<string, number>()
  let frpSum = 0
  let frpCount = 0
  let frpMax = -Infinity

  for (const { properties: p } of features) {
    if (p.type !== null) res.by_type[`${p.type}`] = (res.by_type[`${p.type}`] ?? 0) + 1
    res.by_daynight[p.daynight] = (res.by_daynight[p.daynight] ?? 0) + 1
    if (p.frp !== null) {
      frpSum += p.frp
      frpCount++
      frpMax = Math.max(frpMax, p.frp)
    }
    days.set(p.acq_date, (days.get(p.acq_date) ?? 0) + 1)
  }
  if (frpCount > 0) res.frp = { sum: frpSum, mean: frpSum / frpCount, max: frpMax }

  const months = new Map<string, number>()
  const sorted = [...days.keys()].sort()
  for (const date of sorted) {
    const count = days.get(date) ?? 0
    months.set(date.slice(0, 7), (months.get(date.slice(0, 7)) ?? 0) + count)
    if (res.peak_day === null || count > res.peak_day.count) res.peak_day = { date, count }
  }
  for (const [month, count] of months) {
    if (res.peak_month === null || count > res.peak_month.count) res.peak_month = { month, count }
  }
  res.first = sorted[0] ?? null
  res.last = sorted[sorted.length - 1] ?? null
  return res
}

/** The card's numbers: the API summary (null = none loaded yet) plus the area, which only the shape decides. */
export function selectionSummary(area: Area, res: SelectionSummaryResponse | null): SelectionSummary {
  const km2 = areaKm2(area)
  const count = res?.total ?? 0
  const month = res?.peak_month ? Number(res.peak_month.month.slice(5, 7)) - 1 : NaN
  return {
    areaKm2: km2,
    count,
    densityPer1000Km2: km2 > 0 ? (count / km2) * 1000 : null,
    byType: {
      0: res?.by_type['0'] ?? 0,
      1: res?.by_type['1'] ?? 0,
      2: res?.by_type['2'] ?? 0,
      3: res?.by_type['3'] ?? 0,
    },
    byDaynight: { D: res?.by_daynight.D ?? 0, N: res?.by_daynight.N ?? 0 },
    frp: res?.frp ?? null,
    peakMonth: res?.peak_month && isMonth(month) ? { month, count: res.peak_month.count } : null,
    peakDay: res?.peak_day ?? null,
    firstDate: res?.first ?? null,
    lastDate: res?.last ?? null,
  }
}
