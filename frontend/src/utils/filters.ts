import { ALL_TYPES, DEFAULT_FILTERS, FIRE_TYPES, MONTHS, MONTHS_FULL, SENSORS } from '../constants/fire'
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
  if (f.area?.kind === 'region') q.region = f.area.id
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

const sameMembers = <T,>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x) => b.includes(x))

/** How many of fire type, pass, hide noise and sensors differ from DEFAULT_FILTERS (the Filters button badge). */
export function countChangedFilters(f: Filters): number {
  return [
    !sameMembers(f.types, DEFAULT_FILTERS.types),
    f.daynight !== DEFAULT_FILTERS.daynight,
    f.hideNoise !== DEFAULT_FILTERS.hideNoise,
    !sameMembers(f.sensors, DEFAULT_FILTERS.sensors),
  ].filter(Boolean).length
}

/** Fire type, pass, hide noise and sensors back to DEFAULT_FILTERS; year, period and area stay. */
export function clearedFilters(f: Filters): Filters {
  return {
    ...f,
    types: DEFAULT_FILTERS.types,
    daynight: DEFAULT_FILTERS.daynight,
    hideNoise: DEFAULT_FILTERS.hideNoise,
    sensors: DEFAULT_FILTERS.sensors,
  }
}

const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

/** What narrows the selection, for the empty state: "Aug 2008 · Night only · Active volcano · Selected area". */
export function filterSummary(f: Filters): string {
  const parts = [selectionLabel(f)]
  if (f.daynight) parts.push(f.daynight === 'D' ? 'Day only' : 'Night only')
  if (!sameMembers(f.types, ALL_TYPES)) parts.push(f.types.map((t) => sentenceCase(FIRE_TYPES[t].label)).join(', ') || 'No fire types')
  if (f.hideNoise) parts.push('Noise hidden')
  if (!sameMembers(f.sensors, DEFAULT_FILTERS.sensors)) parts.push(activeSensors(f).join(' + '))
  if (f.area) parts.push(f.area.kind === 'region' ? f.area.name : 'Selected area')
  return parts.join(' · ')
}
