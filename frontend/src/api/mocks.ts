import type {
  ApiQuery,
  CalendarResponse,
  DayNight,
  FireType,
  HotspotCollection,
  HotspotFeature,
  LonLat,
  StatsResponse,
} from '../types/api'

const MOCK_SIZE = 6689
const MOCK_DELAY_MS = 300
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

function generate(): HotspotFeature[] {
  const rand = rng(2008)
  const clusters = CLUSTERS.map((c) => [c, c.weight] as [typeof c, number])
  const months = MONTH_WEIGHTS.map((w, i) => [i, w] as [number, number])
  const features: HotspotFeature[] = []
  for (let id = 1; id <= MOCK_SIZE; id++) {
    const c = pickWeighted(clusters, rand())
    const latitude = +(c.lat + gaussian(rand) * c.spread).toFixed(4)
    const longitude = +(c.lon + gaussian(rand) * c.spread).toFixed(4)
    const month = pickWeighted(months, rand())
    const day = 1 + Math.floor(rand() * new Date(Date.UTC(2008, month + 1, 0)).getUTCDate())
    const daynight: DayNight = rand() < 0.87 ? 'D' : 'N'
    const terra = rand() < 0.5
    const hour = daynight === 'D' ? (terra ? 9 : 12) : (terra ? 21 : 0)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [longitude, latitude] },
      properties: {
        id,
        latitude,
        longitude,
        acq_date: `2008-${pad(month + 1)}-${pad(day)}`,
        acq_time: `${pad(hour)}${pad(Math.floor(rand() * 60))}`,
        sensor: 'MODIS',
        satellite: terra ? 'Terra' : 'Aqua',
        daynight,
        frp: +(5 + rand() * rand() * 300).toFixed(1),
        confidence: 30 + Math.floor(rand() * 71),
        type: pickWeighted(TYPE_WEIGHTS, rand()),
      },
    })
  }
  return features.sort((a, b) => a.properties.acq_date.localeCompare(b.properties.acq_date))
}

let cache: HotspotFeature[] | null = null

function dataset() {
  cache ??= generate()
  return cache
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

function inPolygon([lon, lat]: LonLat, poly: LonLat[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function filter(q: ApiQuery) {
  const types = q.type ? new Set(q.type.split(',').map(Number)) : null
  const polygon: LonLat[] | null = q.polygon ? JSON.parse(q.polygon) : null
  const circle = q.lat !== undefined && q.lon !== undefined && q.radius_km !== undefined
  return dataset().filter(({ properties: p, geometry }) => {
    if (p.acq_date < q.from || p.acq_date > q.to) return false
    if (types && !types.has(p.type)) return false
    if (q.daynight && p.daynight !== q.daynight) return false
    if (polygon) return inPolygon(geometry.coordinates, polygon)
    if (circle) return haversineKm(q.lat!, q.lon!, p.latitude, p.longitude) <= q.radius_km!
    return true
  })
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_DELAY_MS))
}

export function mockHotspots(q: ApiQuery): Promise<HotspotCollection> {
  return delay({ type: 'FeatureCollection', features: filter(q) })
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
