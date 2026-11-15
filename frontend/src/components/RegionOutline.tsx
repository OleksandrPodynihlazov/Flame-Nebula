import L from 'leaflet'
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { flyToFit } from '../utils/flyTo'
import type { Area } from '../types/api'

/** Mirrors --flare (outline) and --primary (fill); the drawn shapes in useGeoman use the same. */
const STYLE: L.PathOptions = { color: '#ffc24b', weight: 2, fillColor: '#ff6a1a', fillOpacity: 0.08, interactive: false }
const CREDIT = 'Boundaries: <a href="https://www.geoboundaries.org" target="_blank" rel="noreferrer">geoBoundaries</a>'

/**
 * Draws the selected region's outline (not editable, ignored by the draw tools), zooms to it,
 * and shows the geoBoundaries credit (CC BY) while a region is selected.
 */
export function RegionOutline({ area, fitOptions }: { area: Area | null; fitOptions?: L.FitBoundsOptions }) {
  const map = useMap()
  const region = area?.kind === 'region' ? area : null

  useEffect(() => {
    if (!region) return
    const layer = L.geoJSON(region.geometry, {
      style: STYLE,
      // Geoman must not pick this up for edit / drag / remove.
      onEachFeature: (_f, l) => {
        ;(l.options as { pmIgnore?: boolean }).pmIgnore = true
      },
    })
    ;(layer.options as { pmIgnore?: boolean }).pmIgnore = true
    layer.addTo(map)
    map.attributionControl?.addAttribution(CREDIT)
    const bounds = layer.getBounds()
    if (bounds.isValid()) flyToFit(map, bounds, { padding: [24, 24], ...fitOptions })
    return () => {
      layer.remove()
      map.attributionControl?.removeAttribution(CREDIT)
    }
    // Redraw only when another region is picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, region?.id])

  return null
}
