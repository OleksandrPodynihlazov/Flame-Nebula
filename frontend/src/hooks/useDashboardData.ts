import { useEffect, useMemo, useState } from 'react'
import { USE_MOCKS, fetchCalendar, fetchSelectionSummary, fetchStats } from '../api/client'
import type { ApiQuery, CalendarResponse, Filters, SelectionSummaryResponse, StatsResponse } from '../types/api'
import { selectionQuery, yearQuery } from '../utils/filters'
import { FILTER_DEBOUNCE_MS, useDebouncedValue } from './useDebouncedValue'

export interface State<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface Settled<T> {
  key: string | null
  data: T | null
  error: string | null
}

/**
 * `query` null = nothing to load: no request, no data. A changed query is asked for only after it has
 * stayed the same for FILTER_DEBOUNCE_MS; meanwhile `loading` is true and the previous data stays.
 */
export function useEndpoint<T, Q = ApiQuery>(fetcher: (q: Q, s: AbortSignal) => Promise<T>, query: Q | null): State<T> {
  const [settled, setSettled] = useState<Settled<T>>({ key: null, data: null, error: null })
  const key = query === null ? null : JSON.stringify(query)
  const requestKey = useDebouncedValue(key, FILTER_DEBOUNCE_MS)

  useEffect(() => {
    if (requestKey === null) return
    const ctrl = new AbortController()
    fetcher(JSON.parse(requestKey) as Q, ctrl.signal)
      .then((data) => {
        // Mocks ignore the signal: a superseded response must never overwrite a newer query.
        if (!ctrl.signal.aborted) setSettled({ key: requestKey, data, error: null })
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted)
          setSettled((s) => ({ ...s, key: requestKey, error: err instanceof Error ? err.message : String(err) }))
      })
    return () => ctrl.abort()
  }, [fetcher, requestKey])

  if (key === null) return { data: null, loading: false, error: null }
  return { data: settled.data, error: settled.error, loading: settled.key !== key }
}

/**
 * `enabled` false = no requests (e.g. the second compare year while compare mode is off).
 * `withSummary` = the selection card is on screen: load its numbers (`/selection-summary`).
 */
export function useDashboardData(filters: Filters, enabled = true, withSummary = false) {
  const yearQ = useMemo(() => yearQuery(filters), [filters])
  const selQ = useMemo(() => selectionQuery(filters), [filters])

  const calendar = useEndpoint<CalendarResponse>(fetchCalendar, enabled ? yearQ : null)
  const stats = useEndpoint<StatsResponse>(fetchStats, enabled ? selQ : null)
  // Aggregated by the API: the card never downloads the area's dots (GeoJSON export fetches them on click).
  const summary = useEndpoint<SelectionSummaryResponse>(
    fetchSelectionSummary,
    enabled && withSummary && filters.area ? selQ : null,
  )

  return { calendar, stats, summary, isDemo: USE_MOCKS, selectionQuery: selQ }
}
