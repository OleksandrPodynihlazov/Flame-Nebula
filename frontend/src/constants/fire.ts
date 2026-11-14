import type { FireType, Filters } from '../types/api'

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

export const DEFAULT_FILTERS: Filters = {
  year: MVP_YEAR,
  month: null,
  date: null,
  area: null,
  types: ALL_TYPES,
  hideNoise: false,
  daynight: null,
}