import { SENSORS, YEARS } from '../constants/fire'
import type { CompareYears } from '../constants/compare'
import type { Filters } from '../types/api'
import { sensorAvailable } from './filters'

export function defaultCompareYears(year: number): CompareYears {
  const last = YEARS[YEARS.length - 1]
  return year < last ? { a: year, b: last } : { a: year - 1, b: year }
}

export function filtersForYear(f: Filters, year: number): Filters {
  const kept = f.sensors.filter((s) => sensorAvailable(s, year))
  return { ...f, year, month: null, date: null, sensors: kept.length ? kept : [fallbackSensor(year)] }
}

function fallbackSensor(year: number) {
  return sensorAvailable('MODIS', year) ? 'MODIS' : year >= SENSORS.VIIRS.from ? 'VIIRS' : 'MODIS'
}

export function pctChange(from: number, to: number): number | null {
  if (from === 0) return null
  return Math.round(((to - from) / from) * 100)
}

export function formatPct(p: number | null): string {
  if (p === null) return '—'
  return `${p > 0 ? '+' : ''}${p}%`
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

export function formatMW(mw: number): string {
  return `${compact.format(mw)} MW`
}

export function peakIndex(values: readonly number[]): number | null {
  let best: number | null = null
  values.forEach((v, i) => {
    if (v > 0 && (best === null || v > values[best])) best = i
  })
  return best
}
