import type { FireType, Filters, Sensor } from '../types/api'

export const FIRE_TYPES: Record<FireType, { label: string; color: string; noise: boolean }> = {
  0: { label: 'Vegetation Fire', color: '#F07A2E', noise: false },
  1: { label: 'Active Volcano', color: '#9B5DE5', noise: true },
  2: { label: 'Static Land / Ind.', color: '#4FB3F0', noise: true },
  3: { label: 'Offshore Source', color: '#5ED1B8', noise: true },
}

export const ALL_TYPES: FireType[] = [0, 1, 2, 3]

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
export const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export const ITALY_CENTER: [number, number] = [41.87, 12.57]

export const MVP_YEAR = 2008

/**
 * Years each sensor has data in the FIRMS archive (ingest/firms_archive_fetch.py).
 * `radius` is the map dot size in px: MODIS pixels (1 km) are bigger than VIIRS (375 m), as on the FIRMS map.
 */
export const SENSORS: Record<Sensor, { from: number; to: number; pixel: string; radius: number }> = {
  MODIS: { from: 2000, to: 2025, pixel: '1 km', radius: 6 },
  VIIRS: { from: 2012, to: 2025, pixel: '375 m', radius: 3 },
}
export const ALL_SENSORS: Sensor[] = ['MODIS', 'VIIRS']

export const YEARS: number[] = Array.from({ length: SENSORS.MODIS.to - SENSORS.MODIS.from + 1 }, (_, i) => SENSORS.MODIS.from + i)

export const DEFAULT_FILTERS: Filters = {
  year: MVP_YEAR,
  month: null,
  date: null,
  area: null,
  sensors: ['MODIS'],
  types: ALL_TYPES,
  hideNoise: false,
  daynight: null,
}