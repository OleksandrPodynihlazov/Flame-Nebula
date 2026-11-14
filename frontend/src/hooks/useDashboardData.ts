import { useEffect, useMemo, useState } from 'react'
import { USE_MOCKS, fetchCalendar, fetchHotspots, fetchStats } from '../api/client'
import type { ApiQuery, CalendarResponse, Filters, HotspotCollection, StatsResponse } from '../types/api'
import { selectionQuery, yearQuery } from '../utils/filters'

interface State<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface Settled<T> {
  key: string | null
  data: T | null
  error: string | null
}

function useEndpoint<T>(fetcher: (q: ApiQuery, s: AbortSignal) => Promise<T>, query: ApiQuery): State<T> {
  const [settled, setSettled] = useState<Settled<T>>({ key: null, data: null, error: null })
  const key = JSON.stringify(query)

  useEffect(() => {
    const ctrl = new AbortController()
    fetcher(JSON.parse(key), ctrl.signal)
      .then((data) => setSettled({ key, data, error: null }))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted)
          setSettled((s) => ({ ...s, key, error: err instanceof Error ? err.message : String(err) }))
      })
    return () => ctrl.abort()
  }, [fetcher, key])

  return { data: settled.data, error: settled.error, loading: settled.key !== key }
}

export function useDashboardData(filters: Filters) {
  const yearQ = useMemo(() => yearQuery(filters), [filters])
  const selQ = useMemo(() => selectionQuery(filters), [filters])

  const calendar = useEndpoint<CalendarResponse>(fetchCalendar, yearQ)
  const stats = useEndpoint<StatsResponse>(fetchStats, selQ)
  const hotspots = useEndpoint<HotspotCollection>(fetchHotspots, selQ)

  return { calendar, stats, hotspots, isDemo: USE_MOCKS, selectionQuery: selQ }
}