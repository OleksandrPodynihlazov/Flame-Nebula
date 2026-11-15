import type L from 'leaflet'
import { useCallback, useEffect, useState } from 'react'
import { useMap } from 'react-leaflet'
import { fetchGrid, fetchHotspots } from '../api/client'
import type { ApiQuery, GridCell, HotspotFeature } from '../types/api'
import { viewFor, type View } from '../utils/viewport'
import { useDebouncedValue } from './useDebouncedValue'

/** Wait this long after the map stops moving before asking the API. */
export const VIEW_DEBOUNCE_MS = 300

export type MapData = { kind: 'grid'; cell: number; cells: GridCell[] } | { kind: 'points'; features: HotspotFeature[] }

export interface ViewportData {
  /** What to draw; null = nothing (first load, filters changed, failed request). */
  data: MapData | null
  loading: boolean
  error: string | null
  /** Asks again for the same view and query, e.g. after an error. */
  reload: () => void
}

interface Settled {
  key: string
  queryKey: string
  data: MapData | null
  error: string | null
}

function currentView(map: L.Map): View | null {
  const b = map.getBounds()
  return viewFor({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, map.getZoom())
}

function load(q: ApiQuery, view: View, signal: AbortSignal): Promise<MapData> {
  if (view.cell === null) {
    return fetchHotspots({ ...q, bbox: view.bbox }, signal).then((fc) => ({ kind: 'points', features: fc.features }))
  }
  const cell = view.cell
  return fetchGrid({ ...q, bbox: view.bbox, cell }, signal).then((g) => ({ kind: 'grid', cell, cells: g.cells }))
}

/**
 * Hotspots for the visible map area only: grid cells below SINGLE_DOT_ZOOM, single points from it.
 * Asks again VIEW_DEBOUNCE_MS after the map stops or the query last changed; a newer view or query aborts
 * the older request.
 * Data from another query (other filters / area) is never returned, and a failed request returns
 * no data, so the map never shows old dots under a new label.
 */
export function useViewportData(query: ApiQuery): ViewportData {
  const map = useMap()
  const [view, setView] = useState<View | null>(() => currentView(map))
  const [settled, setSettled] = useState<Settled | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onMoveEnd = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const next = currentView(map)
        // Same view (e.g. a pan back below 0.01°): keep the state, no new request.
        setView((v) => (JSON.stringify(v) === JSON.stringify(next) ? v : next))
      }, VIEW_DEBOUNCE_MS)
    }
    map.on('moveend', onMoveEnd)
    return () => {
      clearTimeout(timer)
      map.off('moveend', onMoveEnd)
    }
  }, [map])

  const queryKey = JSON.stringify(query)
  const key = JSON.stringify([queryKey, view, nonce])
  // Filter changes wait like map moves do, so quick clicks (e.g. sensor on/off/on) load once.
  const requestQueryKey = useDebouncedValue(queryKey, VIEW_DEBOUNCE_MS)

  useEffect(() => {
    if (view === null) return
    const requestKey = JSON.stringify([requestQueryKey, view, nonce])
    const ctrl = new AbortController()
    load(JSON.parse(requestQueryKey) as ApiQuery, view, ctrl.signal)
      .then((data) => {
        // Mocks ignore the signal: a superseded answer must never replace a newer one.
        if (!ctrl.signal.aborted) setSettled({ key: requestKey, queryKey: requestQueryKey, data, error: null })
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) {
          setSettled({
            key: requestKey,
            queryKey: requestQueryKey,
            data: null,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })
    return () => ctrl.abort()
  }, [requestQueryKey, view, nonce])

  if (view === null) return { data: null, loading: false, error: null, reload }
  const loading = settled?.key !== key
  // Old data stays only while the same query loads a new view (pan / zoom); never across filters.
  const data = settled?.queryKey === queryKey ? settled.data : null
  return { data, loading, error: loading ? null : (settled?.error ?? null), reload }
}
