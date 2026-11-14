import { FIRE_TYPES, MONTHS, MONTHS_FULL } from '../constants/fire'
import type { ApiQuery, FireType, Filters, Month } from '../types/api'

const pad = (n: number) => String(n).padStart(2, '0')

export function daysInMonth(year: number, month: Month): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

export function isoDate(year: number, month: Month, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

/** Fire types actually requested, after the Hide Noise toggle. */
export function activeTypes(f: Filters): FireType[] {
  return f.hideNoise ? f.types.filter((t) => !FIRE_TYPES[t].noise) : f.types
}

/** Filters shared by every request: types, day/night, area (contracts.md [3]). */
function baseQuery(f: Filters, from: string, to: string): ApiQuery {
  const q: ApiQuery = { from, to, type: activeTypes(f).join(',') }
  if (f.daynight) q.daynight = f.daynight
  if (f.area?.kind === 'circle') Object.assign(q, { lat: f.area.lat, lon: f.area.lon, radius_km: f.area.radiusKm })
  if (f.area?.kind === 'polygon') q.polygon = JSON.stringify(f.area.points)
  return q
}

/** Whole selected year — what the calendar always shows. */
export function yearQuery(f: Filters): ApiQuery {
  return baseQuery(f, `${f.year}-01-01`, `${f.year}-12-31`)
}

/** Selected day, month, or year — what the map, stats and CSV show. */
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
