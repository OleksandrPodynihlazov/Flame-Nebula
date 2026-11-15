import { describe, expect, it } from 'vitest'
import {
  BUBBLE_GAP,
  BUBBLE_HEAT_STEPS,
  BUBBLE_MAX_R,
  abbreviateCount,
  bubbleCap,
  bubbleHeatColor,
  bubbleLabel,
  bubbleRadius,
  cellPixelSize,
} from './clusters'
import { RAMP } from './calendar'
import { CELLS, cellCenter, cellForZoom } from './viewport'

/** Web Mercator, 256 px tiles: container px of a point relative to lon 0 / lat 0 at `zoom`. */
function project(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom
  const sin = Math.sin((lat * Math.PI) / 180)
  return { x: ((lon + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale }
}

describe('bubbleRadius', () => {
  it('grows with count, relative to the biggest cell in view', () => {
    expect(bubbleRadius(400, 600, 80)).toBeGreaterThan(bubbleRadius(100, 600, 80))
    expect(bubbleRadius(600, 600, 80)).toBe(bubbleCap(80))
    expect(bubbleRadius(0, 600, 80)).toBe(5)
  })

  it('never exceeds the cell cap, and the cap never exceeds the max radius', () => {
    expect(bubbleCap(1000)).toBe(BUBBLE_MAX_R)
    expect(bubbleRadius(1e6, 1e6, 30)).toBe(14)
    expect(bubbleRadius(5, 5, 6)).toBe(2)
  })
})

describe('no overlap between neighbouring bubbles', () => {
  const zooms = [3, 3.25, 4, 4.5, 4.75, 5, 5.25, 5.5, 5.74, 6, 6.25, 7, 7.5, 8, 8.75]
  const places = [0, 38, 45, 60]

  it.each(zooms)('at zoom %s every max-size bubble keeps its gap to all 8 neighbours', (zoom) => {
    // The app asks for the cell of round(zoom) while the map may sit up to half a zoom step either side of it.
    const cell = cellForZoom(Math.round(zoom))
    const r = bubbleCap(cellPixelSize(cell, zoom))
    for (const lat0 of places) {
      for (const [dLat, dLon] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const a = cellCenter(lat0 + 0.01, 12.3, cell)
        const b = cellCenter(a.lat + dLat * cell, a.lon + dLon * cell, cell)
        const pa = project(a.lat, a.lon, zoom)
        const pb = project(b.lat, b.lon, zoom)
        const distance = Math.hypot(pa.x - pb.x, pa.y - pb.y)
        expect(distance - 2 * r).toBeGreaterThanOrEqual(BUBBLE_GAP - 1e-6)
      }
    }
  })

  it('holds for every cell size the app can request', () => {
    for (const cell of CELLS) {
      for (const zoom of [2, 4.25, 6.5, 9, 12]) {
        const r = bubbleCap(cellPixelSize(cell, zoom))
        const a = cellCenter(41.2, 12.3, cell)
        const b = cellCenter(41.2, 12.3 + cell, cell)
        const distance = Math.abs(project(a.lat, a.lon, zoom).x - project(b.lat, b.lon, zoom).x)
        // Tiny cells at low zoom fall to the 1 px floor: the radius is then a hair under half a pixel of cell, not a visible bubble.
        if (cellPixelSize(cell, zoom) >= 2 + BUBBLE_GAP) expect(distance - 2 * r).toBeGreaterThanOrEqual(BUBBLE_GAP - 1e-6)
      }
    }
  })
})

describe('bubbleLabel', () => {
  it('fits the count inside the bubble, shrinking the font as needed', () => {
    expect(bubbleLabel(222, 22)).toEqual({ text: '222', fontPx: 12 })
    expect(bubbleLabel(222, 12)?.fontPx).toBeLessThan(12)
  })

  it('uses the compact form for thousands and drops the label when nothing fits', () => {
    expect(bubbleLabel(1250, 24)?.text).toBe('1.3k')
    expect(bubbleLabel(222, 5)).toBeNull()
    expect(bubbleLabel(12345, 9)).toBeNull()
  })

  it('never lets the text be wider than the bubble', () => {
    for (let r = 3; r <= 30; r += 0.5) {
      const label = bubbleLabel(8888, r)
      if (label) expect(label.text.length * label.fontPx * 0.6).toBeLessThanOrEqual(2 * r)
    }
  })
})

describe('bubbleHeatColor', () => {
  it('runs from heat-4 to heat-6 in five steps', () => {
    expect(bubbleHeatColor(0)).toBe(RAMP[4])
    expect(bubbleHeatColor(1)).toBe(RAMP[6])
    expect(bubbleHeatColor(0.5)).toBe(RAMP[5])
    expect(new Set(Array.from({ length: BUBBLE_HEAT_STEPS }, (_, i) => bubbleHeatColor(i / BUBBLE_HEAT_STEPS))).size).toBe(BUBBLE_HEAT_STEPS)
  })
})

describe('abbreviateCount', () => {
  it('keeps small counts and shortens thousands', () => {
    expect(abbreviateCount(0)).toBe('0')
    expect(abbreviateCount(999)).toBe('999')
    expect(abbreviateCount(1000)).toBe('1k')
    expect(abbreviateCount(1250)).toBe('1.3k')
    expect(abbreviateCount(9949)).toBe('9.9k')
    expect(abbreviateCount(12345)).toBe('12k')
    expect(abbreviateCount(437000)).toBe('437k')
  })
})
