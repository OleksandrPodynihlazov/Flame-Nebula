import { describe, expect, it } from 'vitest'
import type { Area, DayNight, FireType, HotspotFeature } from '../types/api'
import { circleRing, selectionGeoJson } from './selectionExport'
import { areaKm2, formatAreaKm2, selectionSummary } from './selectionSummary'

let nextId = 1
function dot(acq_date: string, opts: { frp?: number | null; type?: FireType | null; daynight?: DayNight } = {}): HotspotFeature {
  const id = nextId++
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [12.5, 42.5] },
    properties: {
      id,
      latitude: 42.5,
      longitude: 12.5,
      acq_date,
      acq_time: '1030',
      sensor: 'MODIS',
      satellite: 'Terra',
      daynight: opts.daynight ?? 'D',
      frp: opts.frp === undefined ? 10 : opts.frp,
      confidence: 80,
      type: opts.type === undefined ? 0 : opts.type,
    },
  }
}

// ~1° × 1° box near 42°N: 111.2 km × (111.3 km · cos 42.5°) ≈ 9,120 km².
const BOX: Area = { kind: 'polygon', points: [[12, 42], [13, 42], [13, 43], [12, 43]] }

describe('areaKm2', () => {
  it('measures a 1° box near 42°N within 2% of 9,120 km²', () => {
    expect(Math.abs(areaKm2(BOX) - 9120) / 9120).toBeLessThan(0.02)
  })

  it('uses π·r² for a circle', () => {
    expect(areaKm2({ kind: 'circle', lat: 42, lon: 12, radiusKm: 10 })).toBeCloseTo(Math.PI * 100, 6)
  })

  it('gives 0 for a polygon with fewer than 3 points', () => {
    expect(areaKm2({ kind: 'polygon', points: [[12, 42], [13, 42]] })).toBe(0)
  })
})

describe('formatAreaKm2', () => {
  it('shows 1 decimal under 100 and a whole number from 100 up', () => {
    expect(formatAreaKm2(42.345, 'en-US')).toBe('42.3')
    expect(formatAreaKm2(99.94, 'en-US')).toBe('99.9')
    expect(formatAreaKm2(99.96, 'en-US')).toBe('100')
    expect(formatAreaKm2(9123.6, 'en-US')).toBe('9,124')
  })
})

describe('selectionSummary', () => {
  it('counts unclassified hotspots in the total but not by type', () => {
    const s = selectionSummary(BOX, [dot('2008-07-01', { type: null }), dot('2008-07-02', { type: 0 })])
    expect(s.count).toBe(2)
    expect(s.byType).toEqual({ 0: 1, 1: 0, 2: 0, 3: 0 })
  })

  it('handles no hotspots', () => {
    const s = selectionSummary(BOX, [])
    expect(s.count).toBe(0)
    expect(s.densityPer1000Km2).toBe(0)
    expect(s.byType).toEqual({ 0: 0, 1: 0, 2: 0, 3: 0 })
    expect(s.byDaynight).toEqual({ D: 0, N: 0 })
    expect(s.frp).toBeNull()
    expect(s.peakMonth).toBeNull()
    expect(s.peakDay).toBeNull()
    expect(s.firstDate).toBeNull()
    expect(s.lastDate).toBeNull()
  })

  it('returns null FRP when every value is null, and skips nulls otherwise', () => {
    expect(selectionSummary(BOX, [dot('2008-07-01', { frp: null }), dot('2008-07-02', { frp: null })]).frp).toBeNull()
    const s = selectionSummary(BOX, [dot('2008-07-01', { frp: null }), dot('2008-07-02', { frp: 30 }), dot('2008-07-03', { frp: 10 })])
    expect(s.frp).toEqual({ sum: 40, mean: 20, max: 30 })
  })

  it('breaks peak ties toward the earliest month and day', () => {
    const s = selectionSummary(BOX, [
      dot('2008-08-20'),
      dot('2008-08-20'),
      dot('2008-03-05'),
      dot('2008-03-05'),
      dot('2008-03-09'),
      dot('2008-08-21'),
    ])
    expect(s.peakMonth).toEqual({ month: 2, count: 3 })
    expect(s.peakDay).toEqual({ date: '2008-03-05', count: 2 })
  })

  it('summarises a single point', () => {
    const s = selectionSummary(BOX, [dot('2008-06-15', { frp: 12.5, type: 2, daynight: 'N' })])
    expect(s.count).toBe(1)
    expect(s.byType).toEqual({ 0: 0, 1: 0, 2: 1, 3: 0 })
    expect(s.byDaynight).toEqual({ D: 0, N: 1 })
    expect(s.frp).toEqual({ sum: 12.5, mean: 12.5, max: 12.5 })
    expect(s.peakMonth).toEqual({ month: 5, count: 1 })
    expect(s.peakDay).toEqual({ date: '2008-06-15', count: 1 })
    expect(s.firstDate).toBe('2008-06-15')
    expect(s.lastDate).toBe('2008-06-15')
    expect(s.densityPer1000Km2).toBeCloseTo((1 / s.areaKm2) * 1000, 9)
  })

  it('finds first and last dates regardless of input order', () => {
    const s = selectionSummary(BOX, [dot('2008-05-01'), dot('2008-01-09'), dot('2008-12-30')])
    expect(s.firstDate).toBe('2008-01-09')
    expect(s.lastDate).toBe('2008-12-30')
  })

  it('reports null density for a zero-area polygon', () => {
    expect(selectionSummary({ kind: 'polygon', points: [] }, []).densityPer1000Km2).toBeNull()
  })
})

describe('selectionGeoJson', () => {
  it('exports a circle as a closed 64-point polygon with radius_km', () => {
    const area: Area = { kind: 'circle', lat: 42, lon: 12, radiusKm: 25 }
    const fc = selectionGeoJson(area, [dot('2008-07-01')])
    expect(fc.features).toHaveLength(2)
    const shape = fc.features[1]
    expect(shape.geometry.type).toBe('Polygon')
    if (shape.geometry.type !== 'Polygon') return
    const ring = shape.geometry.coordinates[0]
    expect(ring).toHaveLength(65)
    expect(ring[0]).toEqual(ring[64])
    expect(shape.properties).toMatchObject({ selection: true, radius_km: 25 })
  })

  it('closes a polygon ring', () => {
    const shape = selectionGeoJson(BOX, []).features[0]
    if (shape.geometry.type !== 'Polygon') throw new Error('expected a Polygon')
    expect(shape.geometry.coordinates[0]).toEqual([[12, 42], [13, 42], [13, 43], [12, 43], [12, 42]])
  })

  it('puts circle ring points at the given radius', () => {
    const [lon, lat] = circleRing(42, 12, 50)[16]
    const toRad = (d: number) => (d * Math.PI) / 180
    const a = Math.sin(toRad(lat - 42) / 2) ** 2 + Math.cos(toRad(42)) * Math.cos(toRad(lat)) * Math.sin(toRad(lon - 12) / 2) ** 2
    expect(6371.0088 * 2 * Math.asin(Math.sqrt(a))).toBeCloseTo(50, 3)
  })
})
