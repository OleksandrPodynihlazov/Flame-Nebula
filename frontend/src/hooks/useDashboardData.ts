import { useEffect, useMemo, useState } from 'react'
import { fetchCalendar, fetchHotspots, fetchStats, type DataSource } from '../api/client'
import type { CalendarResponse, Filters, HotspotCollection, StatsResponse } from '../types/api'
import { selectionQuery, yearQuery } from '../utils/filters'

interface State<T> {
  data: T | null
  loading: boolean
  error: string | null
  source: DataSource | null
}

interface Settled<T> {
  key: string | null
  data: T | null
  error: string | null
  source: DataSource | null
}

/**
 * Loads one endpoint and re-loads when the query changes, cancelling stale requests.
 * Previous data stays on screen while the next request runs; `loading` is true until
 * the response for the current query arrives.
 */
function useEndpoint<T>(
  fetcher: (q: ReturnType<typeof yearQuery>, s: AbortSignal) => Promise<{ data: T; source: DataSource }>,
  query: ReturnType<typeof yearQuery>,
): State<T> {
  const [settled, setSettled] = useState<Settled<T>>({ key: null, data: null, error: null, source: null })
  const key = JSON.stringify(query)

  useEffect(() => {
    const ctrl = new AbortController()
    fetcher(JSON.parse(key), ctrl.signal)
      .then(({ data, source }) => setSettled({ key, data, source, error: null }))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setSettled((s) => ({ ...s, key, error: String(err) }))
      })
    return () => ctrl.abort()
  }, [fetcher, key])

  return { data: settled.data, source: settled.source, error: settled.error, loading: settled.key !== key }
}

export function useDashboardData(filters: Filters) {
  const yearQ = useMemo(() => yearQuery(filters), [filters])
  const selQ = useMemo(() => selectionQuery(filters), [filters])

  const calendar = useEndpoint<CalendarResponse>(fetchCalendar, yearQ)
  const stats = useEndpoint<StatsResponse>(fetchStats, selQ)
  const hotspots = useEndpoint<HotspotCollection>(fetchHotspots, selQ)

  const isDemo = [calendar, stats, hotspots].some((s) => s.source === 'demo')
  return { calendar, stats, hotspots, isDemo, selectionQuery: selQ }
}
