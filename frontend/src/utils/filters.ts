import { ALL_TYPES, FIRE_TYPES, MONTHS, MONTHS_FULL, SENSORS } from '../constants/fire'
import type { ApiQuery, FireType, Filters, Month, Sensor } from '../types/api'

const pad = (n: number) => String(n).padStart(2, '0')

export function daysInMonth(year: number, month: Month): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

export function isoDate(year: number, month: Month, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

export function activeTypes(f: Filters): FireType[] {
  return f.hideNoise ? f.types.filter((t) => !FIRE_TYPES[t].noise) : f.types
}

export function sensorAvailable(s: Sensor, year: number): boolean {
  return year >= SENSORS[s].from && year <= SENSORS[s].to
}

export function activeSensors(f: Filters): Sensor[] {
  return f.sensors.filter((s) => sensorAvailable(s, f.year))
}

function baseQuery(f: Filters, from: string, to: string): ApiQuery {
  const q: ApiQuery = { from, to, sensor: activeSensors(f).join(',') }
  const types = activeTypes(f)
  if (types.length < ALL_TYPES.length) q.type = types.join(',')
  if (f.daynight) q.daynight = f.daynight
  if (f.area?.kind === 'circle') Object.assign(q, { lat: f.area.lat, lon: f.area.lon, radius_km: f.area.radiusKm })
  if (f.area?.kind === 'polygon') q.polygon = JSON.stringify(f.area.points)
  return q
}

export function yearQuery(f: Filters): ApiQuery {
  return baseQuery(f, `${f.year}-01-01`, `${f.year}-12-31`)
}

export function selectionQuery(f: Filters): ApiQuery {
  if (f.date) return baseQuery(f, f.date, f.date)
  if (f.month !== null) {
    return baseQuery(f, isoDate(f.year, f.month, 1), isoDate(f.year, f.month, daysInMonth(f.year, f.month)))
  }
  return yearQuery(f)
}

export function selectionLabel(f: Filters, long = false): string {
  const names = long ? MONTHS_FULL : MONTHS
  if (f.date) {
    const [, m, d] = f.date.split('-').map(Number)
    return `${d} ${names[m - 1]} ${f.year}`
  }
  if (f.month !== null) return `${names[f.month]} ${f.year}`
  return `Full year ${f.year}`
}

export function yearPatch(f: Filters, year: number): Partial<Filters> {
  const kept = f.sensors.filter((s) => sensorAvailable(s, year))
  return { year, month: null, date: null, sensors: kept.length ? kept : ['MODIS'] }
}

export function toggleMonthPatch(f: Filters, month: Month): Partial<Filters> {
  return f.month === month && f.date === null ? { month: null, date: null } : { month, date: null }
}

export function toggleDatePatch(f: Filters, date: string): Partial<Filters> {
  if (f.date === date) return { date: null }
  return { month: (Number(date.slice(5, 7)) - 1) as Month, date }
}
