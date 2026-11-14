import { useEffect, useMemo, useState } from 'react'
import { USE_MOCKS, fetchCalendar, fetchHotspots, fetchStats } from '../api/client'
import type { ApiQuery, CalendarResponse, Filters, HotspotCollection, StatsResponse } from '../types/api'
import { filterByArea } from '../utils/area'
import { selectionQuery, yearQuery } from '../utils/filters'

interface State<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface Kept<T> {
  key: string
  data: T
}

interface Settled<T> {
  key: string | null
  data: T | null
  error: string | null
  /** Last success whose query passed `keep`; survives later responses. */
  kept: Kept<T> | null
}

function useEndpoint<T>(
  fetcher: (q: ApiQuery, s: AbortSignal) => Promise<T>,
  query: ApiQuery,
  keep?: (q: ApiQuery) => boolean,
): State<T> & { kept: Kept<T> | null } {
  const [settled, setSettled] = useState<Settled<T>>({ key: null, data: null, error: null, kept: null })
  const key = JSON.stringify(query)

  useEffect(() => {
    const ctrl = new AbortController()
    const q: ApiQuery = JSON.parse(key)
    fetcher(q, ctrl.signal)
      .then((data) => {
        // Mocks ignore the signal: a superseded response must never overwrite a newer query.
        if (ctrl.signal.aborted) return
        setSettled((s) => ({ key, data, error: null, kept: keep?.(q) ? { key, data } : s.kept }))
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted)
          setSettled((s) => ({ ...s, key, error: err instanceof Error ? err.message : String(err) }))
      })
    return () => ctrl.abort()
  }, [fetcher, key, keep])

  return { data: settled.data, error: settled.error, loading: settled.key !== key, kept: settled.kept }
}

const hasNoArea = (q: ApiQuery) => q.polygon === undefined && q.lat === undefined

export function useDashboardData(filters: Filters) {
  const yearQ = useMemo(() => yearQuery(filters), [filters])
  const selQ = useMemo(() => selectionQuery(filters), [filters])
  const noAreaKey = useMemo(() => JSON.stringify(selectionQuery({ ...filters, area: null })), [filters])

  const calendar = useEndpoint<CalendarResponse>(fetchCalendar, yearQ)
  const stats = useEndpoint<StatsResponse>(fetchStats, selQ)
  const rawHotspots = useEndpoint<HotspotCollection>(fetchHotspots, selQ, hasNoArea)

  // While /hotspots loads, answer from the dots already loaded for the same filters without an
  // area: filter them in the browser now; the server response replaces them when it lands.
  const { loading, kept } = rawHotspots
  const area = filters.area
  const preview = useMemo((): HotspotCollection | null => {
    if (!loading || kept?.key !== noAreaKey) return null
    return area ? { type: 'FeatureCollection', features: filterByArea(kept.data.features, area) } : kept.data
  }, [loading, kept, noAreaKey, area])

  const hotspots = {
    data: preview ?? rawHotspots.data,
    loading: rawHotspots.loading,
    error: rawHotspots.error,
    /** True while the shown dots belong to an older query (no browser preview available). */
    stale: rawHotspots.loading && preview === null,
  }

  return { calendar, stats, hotspots, isDemo: USE_MOCKS, selectionQuery: selQ }
}
