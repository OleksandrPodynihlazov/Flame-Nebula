import type {
  PatternCell,
  PatternQuery,
  PatternsResponse,
  PatternSummaryResponse,
  ApiQuery,
  CalendarResponse,
  DayNight,
  FireType,
  GridCell,
  GridResponse,
  HotspotCollection,
  HotspotFeature,
  LonLat,
  Region,
  RegionFeature,
  SelectionSummaryResponse,
  Sensor,
  StatsResponse,
} from '../types/api'
import { SENSORS } from '../constants/fire'
import { haversineKm, inGeometry, inPolygon } from '../utils/area'
import { summarizeFeatures } from '../utils/selectionSummary'

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
  const region = q.region === undefined ? null : mockRegionFeature(q.region).geometry
  return dataset(q).filter(({ properties: p, geometry }) => {
    if (p.acq_date < q.from || p.acq_date > q.to) return false
    if (q.bbox && (p.latitude < south || p.latitude > north || p.longitude < west || p.longitude > east)) return false
    if (types && (p.type === null || !types.has(p.type))) return false
    if (q.daynight && p.daynight !== q.daynight) return false
    if (region) return inGeometry(geometry.coordinates, region)
    if (polygon) return inPolygon(geometry.coordinates, polygon)
    if (circle) return haversineKm(q.lat!, q.lon!, p.latitude, p.longitude) <= q.radius_km!
    return true
  })
}

function delay<T>(value: T): Promise<T> {
  if (MOCK_DELAY_MS === null) return Promise.resolve(value)
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_DELAY_MS))
}

const ITALY = 'Italy'
const MOCK_REGION_DEFS: { id: number; name: string; parent_id: number; zone: string; ring: LonLat[] }[] = [
  { id: 9101, name: 'Sicilia', parent_id: 9001, zone: 'Isole', ring: [[15.65, 38.27], [15.25, 37.85], [15.3, 37.05], [15.13, 36.68], [14.85, 36.72], [13.95, 37.1], [13.1, 37.5], [12.45, 37.8], [12.7, 38.1], [13.35, 38.12], [14, 38.02], [14.8, 38.15]] },
  { id: 9102, name: 'Sardegna', parent_id: 9001, zone: 'Isole', ring: [[9.2, 41.25], [9.65, 40.9], [9.75, 40.3], [9.65, 39.6], [9.6, 39.25], [9.2, 39.2], [8.85, 38.88], [8.4, 39.1], [8.45, 39.9], [8.4, 40.3], [8.2, 40.65], [8.2, 40.95], [8.5, 41.1]] },
  { id: 9103, name: 'Calabria', parent_id: 9002, zone: 'Sud', ring: [[15.75, 39.95], [15.85, 39.5], [16.15, 39], [15.85, 38.65], [15.65, 38.25], [16, 37.92], [16.55, 38.4], [16.55, 38.8], [17.15, 39], [17.1, 39.35], [16.6, 39.7], [16.65, 40.05], [16.1, 40.05]] },
  { id: 9104, name: 'Puglia', parent_id: 9002, zone: 'Sud', ring: [[15.15, 41.95], [16.2, 41.95], [15.9, 41.6], [16.3, 41.25], [16.9, 41.1], [17.95, 40.65], [18.5, 40.15], [18.35, 39.8], [17.9, 40.3], [17.2, 40.45], [16.85, 40.4], [16.2, 40.85], [15.7, 41.1], [15.15, 41.4]] },
  { id: 9105, name: 'Campania', parent_id: 9002, zone: 'Sud', ring: [[13.8, 41.2], [14.3, 40.85], [14.4, 40.6], [14.8, 40.65], [15.3, 40], [15.65, 39.95], [15.9, 40.3], [15.4, 40.75], [15.1, 41.2], [14.8, 41.5], [14.2, 41.5], [13.9, 41.4]] },
  { id: 9106, name: 'Lazio', parent_id: 9003, zone: 'Centro', ring: [[11.6, 42.4], [11.85, 42.1], [12.3, 41.75], [12.65, 41.4], [13.25, 41.3], [13.75, 41.25], [13.9, 41.65], [13.6, 42], [13.3, 42.4], [13.2, 42.8], [12.5, 42.75], [12, 42.7]] },
  { id: 9107, name: 'Toscana', parent_id: 9003, zone: 'Centro', ring: [[10.05, 44.05], [10.3, 43.55], [10.55, 42.95], [11.1, 42.4], [11.6, 42.45], [11.9, 42.75], [12.2, 43.2], [12.2, 43.6], [11.8, 43.95], [11.4, 44.2], [10.8, 44.3], [10.2, 44.3]] },
  { id: 9108, name: 'Lombardia', parent_id: 9004, zone: 'Nord', ring: [[8.7, 45.3], [8.45, 45.7], [8.95, 46], [9.35, 46.5], [10.1, 46.65], [10.5, 46.5], [10.55, 46], [10.75, 45.7], [11, 45.2], [10.6, 44.95], [9.7, 45], [9.1, 44.8], [8.75, 44.95]] },
]

/** Demo regions: one per hotspot cluster; coarse outlines (rings closed), shaped like `GET /api/regions/:id`. */
const MOCK_REGIONS: RegionFeature[] = MOCK_REGION_DEFS.map(({ id, name, parent_id, zone, ring }) => ({
  type: 'Feature',
  id,
  geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
  properties: { id, name, level: 2, country: 'ITA', parent_id, path: `${ITALY} › ${zone}` },
}))

const MIN_REGION_QUERY = 2
const MAX_REGION_QUERY = 100
const MAX_REGION_RESULTS = 20

/** Lower-case, accents dropped: the API's `name_norm`. */
const normalize = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

/** `GET /api/regions?q=` over `regions`: 2–100 chars, case- and accent-insensitive, prefix matches first, then substring, sorted by name, max 20. */
export function matchRegions(regions: readonly Region[], q: string): Region[] {
  if (q.length < MIN_REGION_QUERY || q.length > MAX_REGION_QUERY) {
    throw new Error(`q must be ${MIN_REGION_QUERY}-${MAX_REGION_QUERY} characters: "${q}"`)
  }
  const needle = normalize(q)
  const byName = (a: Region, b: Region) => a.name.localeCompare(b.name)
  const prefix: Region[] = []
  const inside: Region[] = []
  for (const r of regions) {
    const at = normalize(r.name).indexOf(needle)
    if (at === 0) prefix.push(r)
    else if (at > 0) inside.push(r)
  }
  return [...prefix.sort(byName), ...inside.sort(byName)].slice(0, MAX_REGION_RESULTS)
}

function mockRegionFeature(id: number): RegionFeature {
  const feature = MOCK_REGIONS.find((r) => r.id === id)
  if (!feature) throw new Error(`region not found: ${id}`)
  return feature
}

export function mockSearchRegions(q: string): Promise<Region[]> {
  return delay(matchRegions(MOCK_REGIONS.map((r) => r.properties), q))
}

export function mockRegion(id: number): Promise<RegionFeature> {
  return delay(mockRegionFeature(id))
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
  const res: StatsResponse = { total: 0, frp_sum: 0, by_type: {}, by_daynight: {} }
  for (const { properties: p } of filter(q)) {
    res.total++
    res.frp_sum += p.frp ?? 0
    if (p.type !== null) res.by_type[`${p.type}`] = (res.by_type[`${p.type}`] ?? 0) + 1
    res.by_daynight[p.daynight] = (res.by_daynight[p.daynight] ?? 0) + 1
  }
  res.frp_sum = Math.round(res.frp_sum * 10) / 10
  return delay(res)
}

export function mockCalendar(q: ApiQuery): Promise<CalendarResponse> {
  const byDay = new Map<string, { count: number; frp: number }>()
  for (const { properties: p } of filter(q)) {
    const d = byDay.get(p.acq_date) ?? { count: 0, frp: 0 }
    d.count++
    d.frp += p.frp ?? 0
    byDay.set(p.acq_date, d)
  }
  const days = [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, count: d.count, frp: Math.round(d.frp * 10) / 10 }))
  return delay({ days })
}

const PATTERN_YEARS = 14

function patternInArea(c: PatternCell, q: PatternQuery) {
  if (q.min_probability !== undefined && c.probability < q.min_probability) return false
  if (q.region !== undefined) return inGeometry([c.lon, c.lat], mockRegionFeature(q.region).geometry)
  if (q.polygon) return inPolygon([c.lon, c.lat], JSON.parse(q.polygon))
  if (q.lat !== undefined && q.lon !== undefined && q.radius_km !== undefined) return haversineKm(q.lat, q.lon, c.lat, c.lon) <= q.radius_km
  return true
}

const patternCache = new Map<number, PatternCell[]>()

function patternCells(month: number): PatternCell[] {
  const cached = patternCache.get(month)
  if (cached) return cached
  const rand = rng(9000 + month)
  const season = MONTH_WEIGHTS[month - 1] / Math.max(...MONTH_WEIGHTS)
  const cells = new Map<string, PatternCell>()
  for (const c of CLUSTERS) {
    const reach = Math.ceil(c.spread * 25)
    for (let i = -reach; i <= reach; i++) {
      for (let j = -reach; j <= reach; j++) {
        const lat = Math.floor((c.lat + i / 10) * 10)
        const lon = Math.floor((c.lon + j / 10) * 10)
        const d = Math.hypot(i / 10, j / 10) / c.spread
        const p = Math.min(1, season * Math.exp(-d * d) * (0.9 + 0.8 * rand()) * (c.weight / 12))
        const burned = Math.round(p * PATTERN_YEARS)
        if (burned < 1 || rand() > 0.85) continue
        const key = `${lat},${lon}`
        if (cells.has(key)) continue
        cells.set(key, {
          lat: +((lat + 0.5) / 10).toFixed(2),
          lon: +((lon + 0.5) / 10).toFixed(2),
          years_burned: burned,
          years_observed: PATTERN_YEARS,
          probability: +(burned / PATTERN_YEARS).toFixed(3),
          median_count: Math.max(1, Math.round(1 + p * 12 * rand())),
        })
      }
    }
  }
  const out = [...cells.values()].sort((a, b) => b.probability - a.probability || b.median_count - a.median_count)
  patternCache.set(month, out)
  return out
}

export function mockPatterns(q: PatternQuery): Promise<PatternsResponse> {
  const month = q.month ?? 8
  return delay({ month, cells: patternCells(month).filter((c) => patternInArea(c, q)) })
}

export function mockPatternSummary(q: PatternQuery): Promise<PatternSummaryResponse> {
  const months = Array.from({ length: 12 }, (_, i) => {
    const cells = patternCells(i + 1).filter((c) => patternInArea(c, q))
    return {
      month: i + 1,
      cells: cells.length,
      likely: cells.filter((c) => c.probability >= 0.5).length,
      max_probability: cells.reduce((m, c) => Math.max(m, c.probability), 0),
    }
  })
  return delay({ months })
}

/** Same numbers as the API, computed from the filtered dots (the browser summary the endpoint replaced). */
export function mockSelectionSummary(q: ApiQuery): Promise<SelectionSummaryResponse> {
  return delay(summarizeFeatures(filter(q)))
}
