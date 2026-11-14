// leaflet must evaluate before geoman: geoman reads the global `L` that leaflet sets.
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import type { Area, LonLat } from '../types/api'

/** Pane that holds the hotspot dots; it stops taking clicks while a tool is active. */
export const HOTSPOT_PANE = 'hotspots'

const SHAPE_STYLE: L.PathOptions = { color: '#fb923c', weight: 2, fillColor: '#f97316', fillOpacity: 0.08 }

const round = (n: number, digits: number) => Number(n.toFixed(digits))

type Shape = L.Polygon | L.Circle

function outerRing(latlngs: unknown): L.LatLng[] {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return []
  const items: unknown[] = latlngs
  const points = items.filter((p): p is L.LatLng => p instanceof L.LatLng)
  return points.length === items.length ? points : outerRing(items[0])
}

/** Leaflet shape → `filters.area`. Null when the shape is not a valid area (polygon with < 3 points). */
export function areaFromLayer(layer: L.Layer): Area | null {
  if (layer instanceof L.Circle) {
    const c = layer.getLatLng().wrap()
    return { kind: 'circle', lat: round(c.lat, 5), lon: round(c.lng, 5), radiusKm: round(layer.getRadius() / 1000, 3) }
  }
  if (layer instanceof L.Polygon) {
    const points = outerRing(layer.getLatLngs()).map((p): LonLat => {
      const w = p.wrap()
      return [round(w.lng, 5), round(w.lat, 5)]
    })
    return points.length >= 3 ? { kind: 'polygon', points } : null
  }
  return null
}

function layerFromArea(area: Area): Shape {
  return area.kind === 'circle'
    ? L.circle([area.lat, area.lon], { ...SHAPE_STYLE, radius: area.radiusKm * 1000 })
    : L.polygon(area.points.map(([lon, lat]) => [lat, lon] as L.LatLngTuple), SHAPE_STYLE)
}

const sameArea = (a: Area | null, b: Area | null) => JSON.stringify(a) === JSON.stringify(b)

type AreaCallback = { current: (area: Area | null) => void }
type ShapeSlot = { current: Shape | null }

/** Make `shape` the one selection shape: report its area when an edit or drag ends. */
function adopt(slot: ShapeSlot, shape: Shape, onChange: AreaCallback) {
  shape.on('pm:edit', () => {
    const next = areaFromLayer(shape)
    if (next) onChange.current(next)
  })
  slot.current = shape
}

function drop(slot: ShapeSlot) {
  slot.current?.off('pm:edit').remove()
  slot.current = null
}

const MODE_EVENTS = 'pm:globaldrawmodetoggled pm:globaleditmodetoggled pm:globaldragmodetoggled pm:globalremovalmodetoggled'

/**
 * Geoman draw tools (polygon, rectangle, circle, edit, drag, remove) bound to `filters.area`.
 * `area` is the source of truth: the map shape follows it; drawing a shape or ending an edit reports a new one.
 */
export function useGeoman(area: Area | null, onAreaChange: (area: Area | null) => void, position: L.ControlPosition) {
  const map = useMap()
  const shapeRef = useRef<Shape | null>(null)
  const onChangeRef = useRef(onAreaChange)

  useEffect(() => {
    onChangeRef.current = onAreaChange
  }, [onAreaChange])

  useEffect(() => {
    const onCreate = (e: { layer: L.Layer }) => {
      const next = areaFromLayer(e.layer)
      if (!next || !(e.layer instanceof L.Polygon || e.layer instanceof L.Circle)) {
        e.layer.remove()
        return
      }
      drop(shapeRef)
      adopt(shapeRef, e.layer, onChangeRef)
      onChangeRef.current(next)
    }
    const onRemove = (e: { layer: L.Layer }) => {
      if (e.layer !== shapeRef.current) return
      drop(shapeRef)
      onChangeRef.current(null)
    }
    // While a tool is active, clicks must reach the map, not open dot popups.
    const onModeToggle = () => {
      const pm = map.pm
      const active =
        pm.globalDrawModeEnabled() || pm.globalEditModeEnabled() || pm.globalDragModeEnabled() || pm.globalRemovalModeEnabled()
      const pane = map.getPane(HOTSPOT_PANE)
      if (pane) pane.style.pointerEvents = active ? 'none' : ''
    }

    map.pm.setGlobalOptions({ allowSelfIntersection: false, snappable: false, pathOptions: SHAPE_STYLE })
    map.pm.addControls({
      position,
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawText: false,
      drawRectangle: true,
      drawPolygon: true,
      drawCircle: true,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: true,
      rotateMode: false,
    })
    map.on('pm:create', onCreate)
    map.on('pm:remove', onRemove)
    map.on(MODE_EVENTS, onModeToggle)

    return () => {
      map.off('pm:create', onCreate)
      map.off('pm:remove', onRemove)
      map.off(MODE_EVENTS, onModeToggle)
      map.pm.disableDraw()
      map.pm.disableGlobalEditMode()
      map.pm.disableGlobalDragMode()
      map.pm.disableGlobalRemovalMode()
      map.pm.removeControls()
      drop(shapeRef)
      onModeToggle()
    }
  }, [map, position])

  // Mirror `area` onto the map: remove or rebuild the shape when it no longer matches.
  useEffect(() => {
    if (shapeRef.current && sameArea(areaFromLayer(shapeRef.current), area)) return
    drop(shapeRef)
    if (area) adopt(shapeRef, layerFromArea(area).addTo(map), onChangeRef)
  }, [map, area])
}
