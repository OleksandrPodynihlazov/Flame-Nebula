export type FireType = 0 | 1 | 2 | 3
export type DayNight = 'D' | 'N'
export type Sensor = 'MODIS' | 'VIIRS'
export type Month = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
export type LonLat = [number, number]

export type Area =
  | { kind: 'circle'; lat: number; lon: number; radiusKm: number }
  | { kind: 'polygon'; points: LonLat[] }

export interface Filters {
  year: number
  month: Month | null
  date: string | null
  area: Area | null
  types: FireType[]
  hideNoise: boolean
  daynight: DayNight | null
}

export interface ApiQuery {
  from: string
  to: string
  lat?: number
  lon?: number
  radius_km?: number
  polygon?: string
  daynight?: DayNight
  type?: string
}

export interface HotspotProperties {
  id: number
  latitude: number
  longitude: number
  acq_date: string
  acq_time: string
  sensor: Sensor
  satellite: string
  daynight: DayNight
  frp: number | null
  confidence: number | null
  type: FireType
}

export interface HotspotFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: LonLat }
  properties: HotspotProperties
}

export interface HotspotCollection {
  type: 'FeatureCollection'
  features: HotspotFeature[]
}

export interface StatsResponse {
  total: number
  by_type: Partial<Record<`${FireType}`, number>>
  by_daynight: Partial<Record<DayNight, number>>
}

export interface CalendarDay {
  date: string
  count: number
}

export interface CalendarResponse {
  days: CalendarDay[]
}

export interface ApiError {
  error: string
}
