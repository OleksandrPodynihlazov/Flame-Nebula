import type {
  ApiQuery,
  CalendarResponse,
  DayNight,
  FireType,
  GridCell,
  GridResponse,
  HotspotCollection,
  HotspotFeature,
  LonLat,
  Sensor,
  StatsResponse,
} from '../types/api'
import { SENSORS } from '../constants/fire'
import { haversineKm, inPolygon } from '../utils/area'

/** Positive integer from an env value, else null. */
function envCount(raw: string | undefined): number | null {
  const n = Number(raw)
  return raw !== undefined && raw !== '' && Number.isInteger(n) && n > 0 ? n : null
}

const DEFAULT_MOCK_SIZE = 6689
// VITE_MOCK_SIZE only on the dev server, so a production build always ships the same demo set.
const MOCK_SIZE = (import.meta.env.DEV ? envCount(import.meta.env.VITE_MOCK_SIZE) : null) ?? DEFAULT_MOCK_SIZE
const MOCK_DELAY_MS = envCount(import.meta.env.VITE_MOCK_DELAY_MS)
const MONTH_WEIGHTS = [3, 3, 4, 5, 5, 8, 16, 22, 12, 9, 7, 6]
const TYPE_WEIGHTS: [FireType, number][] = [[0, 967], [1, 1], [2, 30], [3, 2]]
const CLUSTERS: { lat: number; lon: number; spread: number; weight: number }[] = [
  { lat: 37.6, lon: 14.2, spread: 0.6, weight: 22 },
  { lat: 40.1, lon: 9.0, spread: 0.5, weight: 16 },
  { lat: 39.0, lon: 16.4, spread: 0.4, weight: 14 },
  { lat: 41.0, lon: 16.3, spread: 0.5, weight: 12 },
  { lat: 40.9, lon: 14.6, spread: 0.4, weight: 10 },
  { lat: 42.0, lon: 12.6, spread: 0.4, weight: 9 },
  { lat: 43.3, lon: 11.2, spread: 0.4, weight: 7 },
  { lat: 45.2, lon: 10.5, spread: 0.7, weight: 10 },
]

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickWeighted<T>(items: [T, number][], r: number): T {
  const total = items.reduce((acc, [, w]) => acc + w, 0)
  let x = r * total
  for (const [item, w] of items) {
    x -= w
    if (x < 0) return item
  }
  return items[items.length - 1][0]
}

function gaussian(rand: () => number) {
  return Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand())
}

function pad(n: number, len = 2) {
  return String(n).padStart(len, '0')
}

/** VIIRS (375 m) detects many more small fires than MODIS (1 km). Rough ratio, mock only. */
const VIIRS_FACTOR = 2.2

function generate(year: number, sensor: Sensor): HotspotFeature[] {
  const { from, to } = SENSORS[sensor]
  if (year < from || year > to) return []
  const viirs = sensor === 'VIIRS'
  // MODIS 2008 keeps seed 2008 and MOCK_SIZE so existing demo numbers don't change.
  const rand = rng(viirs ? year * 7 + 1 : year)
  const yearFactor = year === 2008 ? 1 : 0.6 + rng(year * 31)() * 0.9
  const size = Math.round(MOCK_SIZE * yearFactor * (viirs ? VIIRS_FACTOR : 1))
  // FIRMS MODIS archive starts in Nov 2000.
  const firstMonth = sensor === 'MODIS' && year === 2000 ? 10 : 0
  const clusters = CLUSTERS.map((c) => [c, c.weight] as [typeof c, number])
  const months = MONTH_WEIGHTS.map((w, i) => [i, i < firstMonth ? 0 : w] as [number, number])
  const idBase = year * 1_000_000 + (viirs ? 500_000 : 0)
  const features: HotspotFeature[] = []
  for (let i = 1; i <= size; i++) {
    const c = pickWeighted(clusters, rand())
    const latitude = +(c.lat + gaussian(rand) * c.spread).toFixed(4)
    const longitude = +(c.lon + gaussian(rand) * c.spread).toFixed(4)
    const month = pickWeighted(months, rand())
    const day = 1 + Math.floor(rand() * new Date(Date.UTC(year, month + 1, 0)).getUTCDate())
    const daynight: DayNight = rand() < 0.87 ? 'D' : 'N'
    const terra = rand() < 0.5
    // Overpass hours (UTC): Terra ~09/21, Aqua and S-NPP ~12/00-01.
    const hour = daynight === 'D' ? (terra && !viirs ? 9 : 12) : terra && !viirs ? 21 : 0
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [longitude, latitude] },
      properties: {
        id: idBase + i,
        latitude,
        longitude,
        acq_date: `${year}-${pad(month + 1)}-${pad(day)}`,
        acq_time: `${pad(hour)}${pad(Math.floor(rand() * 60))}`,
        sensor,
        satellite: viirs ? 'N' : terra ? 'Terra' : 'Aqua',
        daynight,
        frp: +((viirs ? 1 : 5) + rand() * rand() * (viirs ? 80 : 300)).toFixed(1),
        // VIIRS confidence is l/n/h; the numeric mapping is TBD in contracts.md, so null for now.
        confidence: viirs ? null : 30 + Math.floor(rand() * 71),
        type: pickWeighted(TYPE_WEIGHTS, rand()),
      },
    })
  }
  return features.sort((a, b) => a.properties.acq_date.localeCompare(b.properties.acq_date))
}

const cache = new Map<string, HotspotFeature[]>()

/** Features for every year in [from, to] and every requested sensor (absent = all). */
function dataset(q: ApiQuery): HotspotFeature[] {
  const sensors = (q.sensor ? q.sensor.split(',') : ['MODIS', 'VIIRS']) as Sensor[]
  const out: HotspotFeature[] = []
  for (let y = Number(q.from.slice(0, 4)); y <= Number(q.to.slice(0, 4)); y++) {
    for (const s of sensors) {
      const key = `${y}-${s}`
      if (!cache.has(key)) cache.set(key, generate(y, s))
      out.push(...cache.get(key)!)
    }
  }
  return out
}

function filter(q: ApiQuery) {
  const types = q.type ? new Set(q.type.split(',').map(Number)) : null
  const polygon: LonLat[] | null = q.polygon ? JSON.parse(q.polygon) : null
  const circle = q.lat !== undefined && q.lon !== undefined && q.radius_km !== undefined
  const [west, south, east, north] = q.bbox ? q.bbox.split(',').map(Number) : []
  return dataset(q).filter(({ properties: p, geometry }) => {
    if (p.acq_date < q.from || p.acq_date > q.to) return false
    if (q.bbox && (p.latitude < south || p.latitude > north || p.longitude < west || p.longitude > east)) return false
    if (types && (p.type === null || !types.has(p.type))) return false
    if (q.daynight && p.daynight !== q.daynight) return false
    if (polygon) return inPolygon(geometry.coordinates, polygon)
    if (circle) return haversineKm(q.lat!, q.lon!, p.latitude, p.longitude) <= q.radius_km!
    return true
  })
}

function delay<T>(value: T): Promise<T> {
  if (MOCK_DELAY_MS === null) return Promise.resolve(value)
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_DELAY_MS))
}

export function mockHotspots(q: ApiQuery): Promise<HotspotCollection> {
  return delay({ type: 'FeatureCollection', features: filter(q) })
}

/** Same grouping as the API: floor(lat / cell), floor(lon / cell); type = most common, lowest on a tie. */
export function mockGrid(q: ApiQuery): Promise<GridResponse> {
  const cell = q.cell ?? 1
  const groups = new Map<string, { lat: number; lon: number; count: number; types: [number, number, number, number] }>()
  for (const { properties: p } of filter(q)) {
    const key = `${Math.floor(p.latitude / cell)}|${Math.floor(p.longitude / cell)}`
    const g = groups.get(key) ?? { lat: 0, lon: 0, count: 0, types: [0, 0, 0, 0] }
    g.lat += p.latitude
    g.lon += p.longitude
    g.count++
    if (p.type !== null) g.types[p.type]++
    groups.set(key, g)
  }
  const cells: GridCell[] = [...groups.values()].map((g) => {
    let type: FireType = 0
    for (const t of [1, 2, 3] as const) if (g.types[t] > g.types[type]) type = t
    return { lat: +(g.lat / g.count).toFixed(4), lon: +(g.lon / g.count).toFixed(4), count: g.count, type }
  })
  return delay({ cell, cells })
}

export function mockStats(q: ApiQuery): Promise<StatsResponse> {
  const res: StatsResponse = { total: 0, by_type: {}, by_daynight: {} }
  for (const { properties: p } of filter(q)) {
    res.total++
    res.by_type[`${p.type}`] = (res.by_type[`${p.type}`] ?? 0) + 1
    res.by_daynight[p.daynight] = (res.by_daynight[p.daynight] ?? 0) + 1
  }
  return delay(res)
}

export function mockCalendar(q: ApiQuery): Promise<CalendarResponse> {
  const counts = new Map<string, number>()
  for (const { properties: p } of filter(q)) counts.set(p.acq_date, (counts.get(p.acq_date) ?? 0) + 1)
  const days = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }))
  return delay({ days })
}
