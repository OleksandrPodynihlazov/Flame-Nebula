import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import type { PatternCell } from '../types/api'
import { formatProbability, patternShade } from '../utils/patterns'
import { HOTSPOT_PANE } from './useGeoman'

const HALF = 0.05
const DIM_OPACITY = '0.45'

export function patternTooltip(c: PatternCell, monthName: string): string {
  return (
    `<div class="pattern-tip">` +
    `<div class="pattern-tip-title">${formatProbability(c.probability)} chance of fire in ${monthName}</div>` +
    `<div>Burned in <b>${c.years_burned} of ${c.years_observed}</b> years</div>` +
    `<div>Median <b>${c.median_count.toLocaleString()}</b> ${c.median_count === 1 ? 'detection' : 'detections'} that month</div>` +
    `<div class="pattern-tip-muted">Cell ${c.lat.toFixed(2)}, ${c.lon.toFixed(2)} · 0.1° · S-NPP</div>` +
    `</div>`
  )
}

function style(c: PatternCell): L.PathOptions {
  return {
    stroke: true,
    color: patternShade(c.probability),
    weight: 0.5,
    opacity: 0.9,
    fillColor: patternShade(c.probability),
    fillOpacity: 0.7,
  }
}

/**
 * Draws pattern cells as 0.1° squares into `pane` (own canvas renderer, so compare mode can clip it).
 * Desktop: tooltip on hover. Phone: popup on tap.
 */
export function usePatternLayer(
  cells: readonly PatternCell[] | null,
  monthName: string,
  dimmed: boolean,
  mobile: boolean,
  pane: string = HOTSPOT_PANE,
) {
  const map = useMap()
  const groupRef = useRef<L.LayerGroup | null>(null)
  const rendererRef = useRef<L.Canvas | null>(null)

  useEffect(() => {
    if (!map.getPane(pane)) map.createPane(pane).style.zIndex = '450'
    const renderer = L.canvas({ pane, padding: 0.5 })
    const group = L.layerGroup().addTo(map)
    groupRef.current = group
    rendererRef.current = renderer
    return () => {
      group.remove()
      renderer.remove()
      groupRef.current = null
      rendererRef.current = null
    }
  }, [map, pane])

  useEffect(() => {
    const group = groupRef.current
    const renderer = rendererRef.current
    if (!group || !renderer) return
    group.clearLayers()
    if (!cells) return
    for (const c of cells) {
      const rect = L.rectangle(
        [
          [c.lat - HALF, c.lon - HALF],
          [c.lat + HALF, c.lon + HALF],
        ],
        { ...style(c), renderer, pane },
      )
      const html = patternTooltip(c, monthName)
      if (mobile) {
        rect.bindPopup(html, { autoPanPaddingTopLeft: [12, 56], autoPanPaddingBottomRight: [12, 160] })
      } else {
        rect.bindTooltip(html, { sticky: true, direction: 'top', offset: [0, -6], className: 'pattern-tooltip' })
        rect.on('mouseover', () => rect.setStyle({ weight: 2, color: '#ffffff' }))
        rect.on('mouseout', () => rect.setStyle(style(c)))
      }
      group.addLayer(rect)
    }
  }, [map, pane, cells, monthName, mobile])

  useEffect(() => {
    const el = map.getPane(pane)
    if (!el) return
    el.style.transition = 'opacity 150ms'
    el.style.opacity = dimmed ? DIM_OPACITY : ''
    return () => {
      el.style.opacity = ''
    }
  }, [map, pane, dimmed])
}
