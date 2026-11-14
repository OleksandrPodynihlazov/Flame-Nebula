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

/** `query` null = nothing to load: no request, no data. */
function useEndpoint<T>(fetcher: (q: ApiQuery, s: AbortSignal) => Promise<T>, query: ApiQuery | null): State<T> {
  const [settled, setSettled] = useState<Settled<T>>({ key: null, data: null, error: null })
  const key = query === null ? null : JSON.stringify(query)

  useEffect(() => {
    if (key === null) return
    const ctrl = new AbortController()
    fetcher(JSON.parse(key) as ApiQuery, ctrl.signal)
      .then((data) => {
        // Mocks ignore the signal: a superseded response must never overwrite a newer query.
        if (!ctrl.signal.aborted) setSettled({ key, data, error: null })
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted)
          setSettled((s) => ({ ...s, key, error: err instanceof Error ? err.message : String(err) }))
      })
    return () => ctrl.abort()
  }, [fetcher, key])

  if (key === null) return { data: null, loading: false, error: null }
  return { data: settled.data, error: settled.error, loading: settled.key !== key }
}

export function useDashboardData(filters: Filters) {
  const yearQ = useMemo(() => yearQuery(filters), [filters])
  const selQ = useMemo(() => selectionQuery(filters), [filters])

  const calendar = useEndpoint<CalendarResponse>(fetchCalendar, yearQ)
  const stats = useEndpoint<StatsResponse>(fetchStats, selQ)
  // The map loads only its visible area (useViewportData). Whole-selection dots are needed only
  // for the selection card, so /hotspots without a bbox runs only while an area is selected.
  const selection = useEndpoint<HotspotCollection>(fetchHotspots, filters.area ? selQ : null)

  return { calendar, stats, selection, isDemo: USE_MOCKS, selectionQuery: selQ }
}
