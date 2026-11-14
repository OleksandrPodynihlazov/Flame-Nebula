import type { ApiError, ApiQuery, CalendarResponse, HotspotCollection, StatsResponse } from '../types/api'
import { mockCalendar, mockHotspots, mockStats } from './mocks'

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

export function toSearchParams(q: ApiQuery): URLSearchParams {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v))
  return p
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Partial<ApiError>
    if (typeof body.error === 'string' && body.error) return body.error
  } catch {
    return `HTTP ${res.status}`
  }
  return `HTTP ${res.status}`
}

async function getJson<T>(
  path: string,
  q: ApiQuery,
  mock: (q: ApiQuery) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (USE_MOCKS) return mock(q)
  const res = await fetch(`/api/${path}?${toSearchParams(q)}`, { signal })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as T
}

export const fetchHotspots = (q: ApiQuery, signal?: AbortSignal) =>
  getJson<HotspotCollection>('hotspots', q, mockHotspots, signal)

export const fetchStats = (q: ApiQuery, signal?: AbortSignal) => getJson<StatsResponse>('stats', q, mockStats, signal)

export const fetchCalendar = (q: ApiQuery, signal?: AbortSignal) =>
  getJson<CalendarResponse>('calendar', q, mockCalendar, signal)

export const csvUrl = (q: ApiQuery) => `/api/hotspots.csv?${toSearchParams(q)}`

const CSV_COLUMNS = ['id', 'latitude', 'longitude', 'acq_date', 'acq_time', 'sensor', 'satellite', 'daynight', 'frp', 'confidence', 'type'] as const

async function mockCsv(q: ApiQuery): Promise<Blob> {
  const { features } = await mockHotspots(q)
  const rows = features.map(({ properties: p }) => CSV_COLUMNS.map((c) => p[c] ?? '').join(','))
  return new Blob([[CSV_COLUMNS.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
}

/** Save a browser-made file; the object URL is revoked once the click is dispatched. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function downloadCsv(q: ApiQuery, filename: string): Promise<void> {
  if (!USE_MOCKS) return triggerDownload(csvUrl(q), filename)
  downloadBlob(await mockCsv(q), filename.replace(/\.csv$/, '_DEMO.csv'))
}