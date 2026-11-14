import L from 'leaflet'
import { createElement, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { useMap } from 'react-leaflet'
import { HotspotPopup } from '../components/HotspotPopup'
import { FIRE_TYPES, SENSORS } from '../constants/fire'
import type { FireType, HotspotProperties, Sensor } from '../types/api'
import { bubbleRadius, majorityType, type HotspotIndex } from '../utils/clusters'
import { HOTSPOT_PANE } from './useGeoman'

/** Share of the viewport drawn beyond each edge, so a short pan shows no blank band before `moveend`. */
const PADDING = 0.25
/** Extra px around a dot or bubble that still counts as a hit. */
const HIT_SLOP = 3
const STROKE = '#020617'
const DIM_OPACITY = '0.6'

type Target =
  | { kind: 'cluster'; id: number; lat: number; lon: number; type: FireType; label: string }
  | { kind: 'dot'; p: HotspotProperties }

/** A drawn shape in container px, kept for hit testing until the next redraw. */
interface Hit {
  x: number
  y: number
  r: number
  target: Target
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Same look as the old <CircleMarker>: type color, dark 0.5 px stroke. */
function drawDot(ctx: CanvasRenderingContext2D, d: Hit, type: FireType, sensor: Sensor) {
  ctx.beginPath()
  ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
  ctx.globalAlpha = sensor === 'VIIRS' ? 0.95 : 0.75
  ctx.fillStyle = FIRE_TYPES[type].color
  ctx.fill()
  ctx.globalAlpha = 0.9
  ctx.lineWidth = 0.5
  ctx.strokeStyle = STROKE
  ctx.stroke()
  ctx.globalAlpha = 1
}

/** Bubble: soft halo, solid body in the cluster's most common type color, count in dark text. */
function drawBubble(ctx: CanvasRenderingContext2D, b: Hit, type: FireType, label: string) {
  const color = FIRE_TYPES[type].color
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2)
  ctx.globalAlpha = 0.22
  ctx.fillStyle = color
  ctx.fill()
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
  ctx.globalAlpha = 0.92
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.lineWidth = 1.5
  ctx.strokeStyle = STROKE
  ctx.stroke()
  ctx.fillStyle = STROKE
  ctx.font = `700 ${b.r >= 18 ? 12 : 11}px Inter, ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, b.x, b.y + 0.5)
}

/**
 * Hotspot clusters and dots on one canvas. Redraws only on `moveend` / `resize` / new data,
 * never per frame. Clicks are hit-tested here, so no Leaflet layer or React node exists per dot.
 * It lives in HOTSPOT_PANE: useGeoman turns that pane's pointer events off while a tool is active.
 */
class HotspotCanvasLayer extends L.Layer {
  private map: L.Map | null = null
  private canvas: HTMLCanvasElement | null = null
  private index: HotspotIndex | null = null
  private hits: Hit[] = []
  private popup: L.Popup | null = null
  private dimmed = false
  private mobile = false

  onAdd(map: L.Map): this {
    const pane = map.getPane(HOTSPOT_PANE) ?? map.createPane(HOTSPOT_PANE)
    pane.style.zIndex = '450'
    // leaflet-zoom-hide: hidden during the zoom animation, redrawn on the following moveend.
    const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide', pane)
    canvas.style.transition = 'opacity 150ms'
    canvas.style.opacity = this.dimmed ? DIM_OPACITY : ''
    canvas.addEventListener('mousemove', this.onMouseMove)
    this.canvas = canvas
    this.map = map
    map.on('moveend resize', this.redraw)
    map.on('click', this.onClick)
    this.redraw()
    return this
  }

  onRemove(map: L.Map): this {
    map.off('moveend resize', this.redraw)
    map.off('click', this.onClick)
    this.closeDotPopup()
    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this.onMouseMove)
      this.canvas.remove()
    }
    this.canvas = null
    this.map = null
    this.hits = []
    return this
  }

  setIndex(index: HotspotIndex) {
    if (index === this.index) return
    this.index = index
    // The open popup may point at a dot that is no longer in the data.
    this.closeDotPopup()
    this.redraw()
  }

  setDimmed(dimmed: boolean) {
    this.dimmed = dimmed
    if (this.canvas) this.canvas.style.opacity = dimmed ? DIM_OPACITY : ''
  }

  setMobile(mobile: boolean) {
    this.mobile = mobile
  }

  private redraw = () => {
    const { map, canvas } = this
    if (!map || !canvas) return
    const size = map.getSize()
    const pad = size.multiplyBy(PADDING).round()
    const width = size.x + 2 * pad.x
    const height = size.y + 2 * pad.y
    const dpr = window.devicePixelRatio || 1
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint(pad.multiplyBy(-1)))
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    this.hits = []
    if (!this.index) return

    const nw = map.containerPointToLatLng(pad.multiplyBy(-1))
    const se = map.containerPointToLatLng(size.add(pad))
    const bbox: [number, number, number, number] = [
      clamp(nw.lng, -180, 180),
      clamp(se.lat, -90, 90),
      clamp(se.lng, -180, 180),
      clamp(nw.lat, -90, 90),
    ]
    const items = this.index.getClusters(bbox, Math.floor(map.getZoom()))

    const dots: Hit[] = []
    const bubbles: Hit[] = []
    for (const f of items) {
      const [lon, lat] = f.geometry.coordinates
      const { x, y } = map.latLngToContainerPoint([lat, lon])
      const props = f.properties
      if ('cluster' in props) {
        bubbles.push({
          x,
          y,
          r: bubbleRadius(props.point_count),
          target: { kind: 'cluster', id: props.cluster_id, lat, lon, type: majorityType(props), label: String(props.point_count_abbreviated) },
        })
      } else {
        dots.push({ x, y, r: SENSORS[props.sensor].radius, target: { kind: 'dot', p: props } })
      }
    }

    dots.sort((a, b) => b.r - a.r)
    ctx.translate(pad.x, pad.y)
    for (const d of dots) if (d.target.kind === 'dot') drawDot(ctx, d, d.target.p.type, d.target.p.sensor)
    for (const b of bubbles) if (b.target.kind === 'cluster') drawBubble(ctx, b, b.target.type, b.target.label)
    // Bubbles are drawn last, so they win hit tests (searched from the end).
    this.hits = [...dots, ...bubbles]
  }

  private hitAt(pt: L.Point): Hit | null {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i]
      if ((h.x - pt.x) ** 2 + (h.y - pt.y) ** 2 <= (h.r + HIT_SLOP) ** 2) return h
    }
    return null
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.map || !this.canvas) return
    this.canvas.style.cursor = this.hitAt(this.map.mouseEventToContainerPoint(e)) ? 'pointer' : ''
  }

  // A map-level click, not a canvas DOM click: Leaflet drops the click that ends a drag.
  private onClick = (e: L.LeafletMouseEvent) => {
    const { map, index } = this
    if (!map || !index || e.originalEvent.target !== this.canvas) return
    const hit = this.hitAt(e.containerPoint)
    if (!hit) return
    if (hit.target.kind === 'cluster') {
      const zoom = Math.min(index.getClusterExpansionZoom(hit.target.id), map.getMaxZoom())
      map.setView([hit.target.lat, hit.target.lon], zoom)
      return
    }
    this.openDotPopup(map, hit.target.p)
  }

  private openDotPopup(map: L.Map, p: HotspotProperties) {
    this.closeDotPopup()
    const el = document.createElement('div')
    const root = createRoot(el)
    // Render before Leaflet measures the popup, so its size and auto-pan are right.
    flushSync(() => root.render(createElement(HotspotPopup, { p })))
    const popup = L.popup(
      this.mobile ? { autoPanPaddingTopLeft: [12, 56], autoPanPaddingBottomRight: [12, 140] } : {},
    )
      .setLatLng([p.latitude, p.longitude])
      .setContent(el)
    popup.once('remove', () => {
      if (this.popup === popup) this.popup = null
      // Deferred: 'remove' can fire inside a React commit (layer cleanup), where a sync unmount warns.
      setTimeout(() => root.unmount(), 0)
    })
    this.popup = popup
    popup.openOn(map)
  }

  private closeDotPopup() {
    if (this.popup && this.map) this.map.closePopup(this.popup)
    this.popup = null
  }
}

/**
 * Draws `index` on the map as clusters (below SINGLE_DOT_ZOOM) or single dots. The layer is created
 * once per map and removed on unmount, so StrictMode's double mount leaves exactly one.
 */
export function useHotspotLayer(index: HotspotIndex, dimmed: boolean, mobile: boolean) {
  const map = useMap()
  const layerRef = useRef<HotspotCanvasLayer | null>(null)

  useEffect(() => {
    const layer = new HotspotCanvasLayer().addTo(map)
    layerRef.current = layer
    return () => {
      layer.remove()
      layerRef.current = null
    }
  }, [map])

  // These depend on `map` too, so they re-apply to a layer re-created by the effect above.
  useEffect(() => {
    layerRef.current?.setIndex(index)
  }, [map, index])

  useEffect(() => {
    layerRef.current?.setDimmed(dimmed)
  }, [map, dimmed])

  useEffect(() => {
    layerRef.current?.setMobile(mobile)
  }, [map, mobile])
}
