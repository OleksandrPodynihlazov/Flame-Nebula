import { describe, expect, it } from 'vitest'
import type { Area, HotspotFeature } from '../types/api'
import { filterByArea, haversineKm, inArea, inPolygon } from './area'

function dot(id: number, lat: number, lon: number): HotspotFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      id,
      latitude: lat,
      longitude: lon,
      acq_date: '2008-07-01',
      acq_time: '1030',
      sensor: 'MODIS',
      satellite: 'Terra',
      daynight: 'D',
      frp: 10,
      confidence: 80,
      confidence_level: 'high',
      confidence_score: null,
      confidence_class: null,
      confidence_reasons: null,
      worldview_url: null,
      type: 0,
    },
  }
}

const BOX: Area = { kind: 'polygon', points: [[12, 42], [13, 42], [13, 43], [12, 43]] }

describe('haversineKm', () => {
  it('is 0 for the same point', () => {
    expect(haversineKm(42, 12, 42, 12)).toBe(0)
  })

  it('gives ~111.2 km for 1° of latitude', () => {
    expect(haversineKm(42, 12, 43, 12)).toBeCloseTo(111.19, 1)
  })
})

describe('inPolygon', () => {
  it('finds a point inside and outside a box', () => {
    expect(inPolygon([12.5, 42.5], [[12, 42], [13, 42], [13, 43], [12, 43]])).toBe(true)
    expect(inPolygon([13.5, 42.5], [[12, 42], [13, 42], [13, 43], [12, 43]])).toBe(false)
  })

  it('handles a concave polygon (point in the notch is outside)', () => {
    const u: [number, number][] = [[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3]]
    expect(inPolygon([1.5, 2], u)).toBe(false)
    expect(inPolygon([0.5, 2], u)).toBe(true)
  })

  it('is false for a ring with fewer than 3 points', () => {
    expect(inPolygon([0, 0], [])).toBe(false)
    expect(inPolygon([0.5, 0], [[0, 0], [1, 0]])).toBe(false)
  })
})

describe('inArea / filterByArea', () => {
  it('keeps a circle edge point (distance <= radius)', () => {
    const d = dot(1, 43, 12)
    const r = haversineKm(42, 12, 43, 12)
    expect(inArea(d, { kind: 'circle', lat: 42, lon: 12, radiusKm: r })).toBe(true)
    expect(inArea(d, { kind: 'circle', lat: 42, lon: 12, radiusKm: r - 0.01 })).toBe(false)
  })

  it('filters by polygon, keeps order, and does not mutate the input', () => {
    const input = [dot(1, 42.5, 12.5), dot(2, 44, 12.5), dot(3, 42.1, 12.9)]
    const copy = structuredClone(input)
    expect(filterByArea(input, BOX).map((f) => f.properties.id)).toEqual([1, 3])
    expect(input).toEqual(copy)
  })

  it('returns an empty list for empty input', () => {
    expect(filterByArea([], BOX)).toEqual([])
  })
})
