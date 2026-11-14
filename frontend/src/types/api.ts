export type Region = 'italy'
export type Sensor = 'modis' | 'viirs'
export type FireType = 0 | 1 | 2 | 3
export type DayNight = 'D' | 'N'
export type Month = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

export interface Filters {
  region: Region
  sensor: Sensor
  year: number
  month: Month | null
  types: FireType[]
  hideNoise: boolean
}

export interface Hotspot {
  lat: number
  lon: number
  date: string
  type: FireType
  daynight: DayNight
  frp: number
  confidence: number
}

export interface CalendarData {
  year: number
  months: number[]
  total: number
}

export interface Stats {
  total: number
  peakMonth: { month: Month; count: number } | null
}

export interface HotspotsQuery {
  region: Region
  sensor: Sensor
  from: string
  to: string
  types: FireType[]
}

export interface CalendarQuery {
  region: Region
  sensor: Sensor
  year: number
  types: FireType[]
}
