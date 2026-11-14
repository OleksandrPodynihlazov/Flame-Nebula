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
  /** At least one. Sensors with no data in `year` are dropped from requests. */
  sensors: Sensor[]
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
  /** Comma list, e.g. `MODIS,VIIRS`. */
  sensor?: string
  /** Visible map area `west,south,east,north`; map requests only (never stats, calendar, CSV). */
  bbox?: string
  /** Grid cell in degrees; `/hotspots/grid` only. */
  cell?: number
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
  type: FireType | null
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

/** One non-empty cell of `GET /api/hotspots/grid`. */
export interface GridCell {
  /** Average position of the cell's hotspots. */
  lat: number
  lon: number
  count: number
  /** Most common type; null when no hotspot in the cell has one (FIRMS API rows). */
  type: FireType | null
}

export interface GridResponse {
  cell: number
  cells: GridCell[]
}

export interface StatsResponse {
  total: number
  /** Summed FRP (MW) of the matching hotspots. */
  frp_sum: number
  by_type: Partial<Record<`${FireType}` | 'null', number>>
  by_daynight: Partial<Record<DayNight, number>>
}

export interface CalendarDay {
  date: string
  count: number
  /** Summed FRP (MW) of the day. */
  frp: number
}

export interface CalendarResponse {
  days: CalendarDay[]
}

export interface ApiError {
  error: string
}
