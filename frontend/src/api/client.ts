import type { ApiQuery, CalendarResponse, HotspotCollection, StatsResponse } from '../types/api'
import { mockCalendar, mockHotspots, mockStats } from './mocks'

/** 'api' = real backend answered; 'demo' = backend missing, synthetic mock data shown. */
export type DataSource = 'api' | 'demo'

export interface Result<T> {
  data: T
  source: DataSource
}

export function toSearchParams(q: ApiQuery): URLSearchParams {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v))
  return p
}

async function getJson<T>(
  path: string,
  q: ApiQuery,
  fallback: (q: ApiQuery) => Promise<T>,
  signal?: AbortSignal,
): Promise<Result<T>> {
  try {
    const res = await fetch(`/api/${path}?${toSearchParams(q)}`, { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`${res.status}`)
    return { data: (await res.json()) as T, source: 'api' }
  } catch (err) {
    if (signal?.aborted) throw err
    // TODO: remove this fallback once api/ serves the endpoints in contracts.md [3].
    return { data: await fallback(q), source: 'demo' }
  }
}

export const fetchHotspots = (q: ApiQuery, signal?: AbortSignal) =>
  getJson<HotspotCollection>('hotspots', q, mockHotspots, signal)

export const fetchStats = (q: ApiQuery, signal?: AbortSignal) => getJson<StatsResponse>('stats', q, mockStats, signal)

export const fetchCalendar = (q: ApiQuery, signal?: AbortSignal) =>
  getJson<CalendarResponse>('calendar', q, mockCalendar, signal)

const CSV_COLUMNS = ['id', 'latitude', 'longitude', 'acq_date', 'acq_time', 'sensor', 'satellite', 'daynight', 'frp', 'confidence', 'type'] as const

async function mockCsv(q: ApiQuery): Promise<Blob> {
  const { features } = await mockHotspots(q)
  const rows = features.map(({ properties: p }) => CSV_COLUMNS.map((c) => p[c] ?? '').join(','))
  return new Blob([[CSV_COLUMNS.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
}

/** Downloads the filtered CSV from GET /api/hotspots.csv, or a demo CSV (marked _DEMO) when the API is down. */
export async function downloadCsv(q: ApiQuery, filename: string): Promise<DataSource> {
  let blob: Blob
  let source: DataSource = 'api'
  try {
    const res = await fetch(`/api/hotspots.csv?${toSearchParams(q)}`)
    if (!res.ok) throw new Error(`${res.status}`)
    blob = await res.blob()
  } catch {
    blob = await mockCsv(q)
    source = 'demo'
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = source === 'demo' ? filename.replace(/\.csv$/, '_DEMO.csv') : filename
  a.click()
  URL.revokeObjectURL(url)
  return source
}
