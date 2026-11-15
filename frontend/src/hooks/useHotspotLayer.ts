import L from 'leaflet'
import { createElement, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { useMap } from 'react-leaflet'
import { HotspotPopup } from '../components/HotspotPopup'
import { FIRE_TYPES, SENSORS, typeMeta } from '../constants/fire'
import type { FireType, HotspotProperties, Sensor } from '../types/api'
import { bubbleHeatColor, bubbleLabel, bubbleRadius, bubbleShare, cellPixelSize, type BubbleLabel } from '../utils/clusters'
import { cellBounds, cellCenter } from '../utils/viewport'
import { HOTSPOT_PANE } from './useGeoman'
import type { MapData } from './useViewportData'

/** Share of the viewport drawn beyond each edge, so a short pan shows no blank band before `moveend`. */
const PADDING = 0.25
/** Extra px around a dot or bubble that still counts as a hit. */
const HIT_SLOP = 3
/** Mirrors --background (dot and bubble outline) and the dark ink on bubble fills (--primary-foreground). */
const STROKE = '#070a0f'
const INK = '#0a0602'
/** Bubbles from this share of the view's biggest cell get a soft glow. Static: nothing animates. */
const GLOW_FROM = 0.75
const DIM_OPACITY = '0.6'
const BUBBLE_FONT_FAMILY = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace'

type Target =
  | { kind: 'cell'; lat: number; lon: number; cell: number; type: FireType; fill: string; glow: boolean; label: BubbleLabel | null }
  | { kind: 'dot'; p: HotspotProperties }

/** A drawn shape in container px, kept for hit testing until the next redraw. */
interface Hit {
  x: number
  y: number
  r: number
  target: Target
}

/** Same look as the old <CircleMarker>: type color, dark 0.5 px stroke. */
function drawDot(ctx: CanvasRenderingContext2D, d: Hit, type: FireType | null, sensor: Sensor) {
  ctx.beginPath()
  ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
  ctx.globalAlpha = sensor === 'VIIRS' ? 0.95 : 0.75
  ctx.fillStyle = typeMeta(type).color
  ctx.fill()
  ctx.globalAlpha = 0.9
  ctx.lineWidth = 0.5
  ctx.strokeStyle = STROKE
  ctx.stroke()
  ctx.globalAlpha = 1
}

/** Bubble: solid body (heat scale for vegetation, type colour otherwise), thin dark outline, count in dark ink. */
function drawBubble(ctx: CanvasRenderingContext2D, b: Hit, t: Extract<Target, { kind: 'cell' }>) {
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
  ctx.fillStyle = t.fill
  if (t.glow) {
    ctx.shadowColor = t.fill
    ctx.shadowBlur = 14
  }
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.lineWidth = 1
  ctx.strokeStyle = STROKE
  ctx.stroke()
  if (!t.label) return
  ctx.fillStyle = INK
  ctx.font = `600 ${t.label.fontPx}px ${BUBBLE_FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(t.label.text, b.x, b.y + 0.5)
}

/**
 * Grid bubbles and dots on one canvas. Redraws only on `moveend` / `resize` / new data,
 * never per frame. In between, a CSS transform makes the last bitmap follow pinch and zoom animations. Clicks are hit-tested here, so no Leaflet layer or React node exists per dot.
 * It lives in HOTSPOT_PANE: useGeoman turns that pane's pointer events off while a tool is active.
 */
class HotspotCanvasLayer extends L.Layer {
  private map: L.Map | null = null
  private pane: HTMLElement | null = null
  private canvas: HTMLCanvasElement | null = null
  /** Canvas top-left in world px at the zoom of the last redraw: the base for the zoom transform. */
  private origin: { world: L.Point; zoom: number } | null = null
  private data: MapData | null = null
  private hits: Hit[] = []
  private popup: L.Popup | null = null
  private popupId: number | null = null
  private dimmed = false
  private mobile = false
  private readonly paneName: string

  constructor(paneName: string) {
    super()
    this.paneName = paneName
  }

  onAdd(map: L.Map): this {
    const pane = map.getPane(this.paneName) ?? map.createPane(this.paneName)
    pane.style.zIndex = '450'
    // Dimmed on the pane: an inline transition on the canvas would override Leaflet's zoom-animation transition.
    pane.style.transition = 'opacity 150ms'
    pane.style.opacity = this.dimmed ? DIM_OPACITY : ''
    // leaflet-zoom-animated: transform origin 0 0, and Leaflet animates its transform during a zoom animation.
    const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated', pane)
    canvas.addEventListener('mousemove', this.onMouseMove)
    this.pane = pane
    this.canvas = canvas
    this.map = map
    map.on('moveend resize', this.redraw)
    map.on('zoom', this.onZoom)
    map.on('zoomanim', this.onAnimZoom)
    map.on('click', this.onClick)
    this.redraw()
    // Canvas text falls back to a system font until the webfont loads; draw again once it has.
    void document.fonts?.load(`600 11px ${BUBBLE_FONT_FAMILY}`).then(this.redraw)
    return this
  }

  onRemove(map: L.Map): this {
    map.off('moveend resize', this.redraw)
    map.off('zoom', this.onZoom)
    map.off('zoomanim', this.onAnimZoom)
    map.off('click', this.onClick)
    this.closeDotPopup()
    if (this.pane) this.pane.style.opacity = ''
    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this.onMouseMove)
      this.canvas.remove()
    }
    this.pane = null
    this.canvas = null
    this.origin = null
    this.map = null
    this.hits = []
    return this
  }

  setData(data: MapData | null) {
    if (data === this.data) return
    this.data = data
    // Keep the popup while its dot is still loaded: opening it may auto-pan, which loads the view again.
    const id = this.popupId
    if (id === null || data?.kind !== 'points' || !data.features.some((f) => f.properties.id === id)) {
      this.closeDotPopup()
    }
    this.redraw()
  }

  setDimmed(dimmed: boolean) {
    this.dimmed = dimmed
    if (this.pane) this.pane.style.opacity = dimmed ? DIM_OPACITY : ''
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
    const topLeft = map.containerPointToLayerPoint(pad.multiplyBy(-1))
    // Also clears the scale left by a zoom transform.
    L.DomUtil.setPosition(canvas, topLeft)
    this.origin = { world: topLeft.add(map.getPixelOrigin()), zoom: map.getZoom() }
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
    const { data } = this
    if (!data) return

    // Only shapes on the canvas (view + padding) are drawn and hit-tested.
    const onCanvas = (x: number, y: number, r: number) =>
      x + r >= -pad.x && x - r <= size.x + pad.x && y + r >= -pad.y && y - r <= size.y + pad.y
    const dots: Hit[] = []
    const bubbles: Hit[] = []
    if (data.kind === 'grid') {
      // Bubbles sit at cell centres, are capped to the cell's on-screen size, and scale with the busiest cell in view.
      const cellPx = cellPixelSize(data.cell, map.getZoom())
      const maxCount = data.cells.reduce((m, c) => Math.max(m, c.count), 0)
      for (const c of data.cells) {
        const centre = cellCenter(c.lat, c.lon, data.cell)
        const { x, y } = map.latLngToContainerPoint([centre.lat, centre.lon])
        const r = bubbleRadius(c.count, maxCount, cellPx)
        if (!onCanvas(x, y, r)) continue
        // A NULL type (FIRMS API rows have none) is drawn as vegetation, the common case.
        const type = c.type ?? 0
        const share = bubbleShare(c.count, maxCount)
        const target: Target = {
          kind: 'cell',
          lat: centre.lat,
          lon: centre.lon,
          cell: data.cell,
          type,
          fill: type === 0 ? bubbleHeatColor(share) : FIRE_TYPES[type].color,
          glow: share >= GLOW_FROM,
          label: bubbleLabel(c.count, r),
        }
        bubbles.push({ x, y, r, target })
      }
    } else {
      for (const { properties: p } of data.features) {
        const { x, y } = map.latLngToContainerPoint([p.latitude, p.longitude])
        const r = SENSORS[p.sensor].radius
        if (onCanvas(x, y, r)) dots.push({ x, y, r, target: { kind: 'dot', p } })
      }
    }

    dots.sort((a, b) => b.r - a.r)
    // Biggest first, so a glowing bubble never paints over a neighbour's body.
    bubbles.sort((a, b) => b.r - a.r)
    ctx.translate(pad.x, pad.y)
    for (const d of dots) if (d.target.kind === 'dot') drawDot(ctx, d, d.target.p.type, d.target.p.sensor)
    for (const b of bubbles) if (b.target.kind === 'cell') drawBubble(ctx, b, b.target)
    // Bubbles are drawn last, so they win hit tests (searched from the end).
    this.hits = [...dots, ...bubbles]
  }

  // A touch pinch changes center and zoom without moving the map pane or animating, so `zoom` must move the bitmap.
  private onZoom = () => {
    if (this.map) this.updateTransform(this.map.getCenter(), this.map.getZoom())
  }

  private onAnimZoom = (e: L.ZoomAnimEvent) => {
    this.updateTransform(e.center, e.zoom)
  }

  /** Scales and shifts the last bitmap to the view `center` / `zoom`, like Leaflet's own L.Renderer. */
  private updateTransform(center: L.LatLng, zoom: number) {
    const { map, canvas, origin } = this
    if (!map || !canvas || !origin) return
    const scale = map.getZoomScale(zoom, origin.zoom)
    // The map's pixel origin for that view (Leaflet's private _getNewPixelOrigin); layer point (0, 0) is minus the pane offset.
    const pixelOrigin = map
      .project(center, zoom)
      .subtract(map.getSize().divideBy(2))
      .subtract(map.containerPointToLayerPoint([0, 0]))
      .round()
    L.DomUtil.setTransform(canvas, origin.world.multiplyBy(scale).subtract(pixelOrigin), scale)
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
    const { map } = this
    if (!map || e.originalEvent.target !== this.canvas) return
    const hit = this.hitAt(e.containerPoint)
    if (!hit) return
    if (hit.target.kind === 'cell') {
      // Zoom until the cell fills the view (at least one level), centered on the bubble.
      const { lat, lon, cell } = hit.target
      const fit = map.getBoundsZoom(cellBounds(lat, lon, cell))
      map.setView([lat, lon], Math.min(map.getMaxZoom(), Math.max(map.getZoom() + 1, fit)))
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
      if (this.popup === popup) {
        this.popup = null
        this.popupId = null
      }
      // Deferred: 'remove' can fire inside a React commit (layer cleanup), where a sync unmount warns.
      setTimeout(() => root.unmount(), 0)
    })
    this.popup = popup
    this.popupId = p.id
    popup.openOn(map)
  }

  private closeDotPopup() {
    if (this.popup && this.map) this.map.closePopup(this.popup)
    this.popup = null
    this.popupId = null
  }
}

/**
 * Draws `data` on the map: grid bubbles (below SINGLE_DOT_ZOOM) or single dots. The layer is created
 * once per map and removed on unmount, so StrictMode's double mount leaves exactly one.
 */
export function useHotspotLayer(data: MapData | null, dimmed: boolean, mobile: boolean, pane: string = HOTSPOT_PANE) {
  const map = useMap()
  const layerRef = useRef<HotspotCanvasLayer | null>(null)

  useEffect(() => {
    const layer = new HotspotCanvasLayer(pane).addTo(map)
    layerRef.current = layer
    return () => {
      layer.remove()
      layerRef.current = null
    }
  }, [map, pane])

  // These depend on `map` too, so they re-apply to a layer re-created by the effect above.
  useEffect(() => {
    layerRef.current?.setData(data)
  }, [map, pane, data])

  useEffect(() => {
    layerRef.current?.setDimmed(dimmed)
  }, [map, pane, dimmed])

  useEffect(() => {
    layerRef.current?.setMobile(mobile)
  }, [map, pane, mobile])
}
