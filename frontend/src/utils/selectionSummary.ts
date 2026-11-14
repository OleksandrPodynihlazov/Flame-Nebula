import turfArea from '@turf/area'
import type { Area, DayNight, FireType, HotspotFeature, Month } from '../types/api'

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

export function selectionSummary(area: Area, features: readonly HotspotFeature[]): SelectionSummary {
  const km2 = areaKm2(area)
  const byType: Record<FireType, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
  const byDaynight: Record<DayNight, number> = { D: 0, N: 0 }
  const months = new Array<number>(12).fill(0)
  const days = new Map<string, number>()
  let frpSum = 0
  let frpCount = 0
  let frpMax = -Infinity
  let firstDate: string | null = null
  let lastDate: string | null = null

  for (const { properties: p } of features) {
    if (p.type !== null) byType[p.type]++
    byDaynight[p.daynight]++
    if (p.frp !== null) {
      frpSum += p.frp
      frpCount++
      frpMax = Math.max(frpMax, p.frp)
    }
    const m = Number(p.acq_date.slice(5, 7)) - 1
    if (isMonth(m)) months[m]++
    days.set(p.acq_date, (days.get(p.acq_date) ?? 0) + 1)
    if (firstDate === null || p.acq_date < firstDate) firstDate = p.acq_date
    if (lastDate === null || p.acq_date > lastDate) lastDate = p.acq_date
  }

  let peakMonth: SelectionSummary['peakMonth'] = null
  months.forEach((count, m) => {
    if (count > 0 && isMonth(m) && (peakMonth === null || count > peakMonth.count)) peakMonth = { month: m, count }
  })

  let peakDay: SelectionSummary['peakDay'] = null
  for (const date of [...days.keys()].sort()) {
    const count = days.get(date) ?? 0
    if (peakDay === null || count > peakDay.count) peakDay = { date, count }
  }

  return {
    areaKm2: km2,
    count: features.length,
    densityPer1000Km2: km2 > 0 ? (features.length / km2) * 1000 : null,
    byType,
    byDaynight,
    frp: frpCount > 0 ? { sum: frpSum, mean: frpSum / frpCount, max: frpMax } : null,
    peakMonth,
    peakDay,
    firstDate,
    lastDate,
  }
}
