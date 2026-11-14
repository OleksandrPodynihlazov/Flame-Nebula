import { describe, expect, it } from 'vitest'
import type { FireType, HotspotFeature } from '../types/api'
import { SINGLE_DOT_ZOOM, bubbleRadius, createHotspotIndex, majorityType, mergeTypeCounts, typeCounts } from './clusters'

function dot(id: number, lat: number, lon: number, type: FireType): HotspotFeature {
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
      type,
    },
  }
}

describe('type counts', () => {
  it('counts one point as 1 of its own type', () => {
    expect(typeCounts({ type: 2 })).toEqual({ t0: 0, t1: 0, t2: 1, t3: 0 })
  })

  it('merges into the accumulator', () => {
    const acc = typeCounts({ type: 0 })
    mergeTypeCounts(acc, { t0: 2, t1: 0, t2: 3, t3: 1 })
    expect(acc).toEqual({ t0: 3, t1: 0, t2: 3, t3: 1 })
  })
})

describe('majorityType', () => {
  it('picks the most common type', () => {
    expect(majorityType({ t0: 1, t1: 0, t2: 5, t3: 2 })).toBe(2)
    expect(majorityType({ t0: 0, t1: 0, t2: 0, t3: 1 })).toBe(3)
  })

  it('breaks ties toward the lower type', () => {
    expect(majorityType({ t0: 4, t1: 0, t2: 4, t3: 0 })).toBe(0)
    expect(majorityType({ t0: 0, t1: 2, t2: 2, t3: 2 })).toBe(1)
  })

  it('gives vegetation (0) for an all-zero record', () => {
    expect(majorityType({ t0: 0, t1: 0, t2: 0, t3: 0 })).toBe(0)
  })
})

describe('bubbleRadius', () => {
  it('grows with count and stays within 10–32 px', () => {
    expect(bubbleRadius(0)).toBe(10)
    expect(bubbleRadius(2)).toBe(10)
    expect(bubbleRadius(100)).toBe(18)
    expect(bubbleRadius(1e6)).toBe(32)
    expect(bubbleRadius(400)).toBeGreaterThan(bubbleRadius(100))
  })
})

describe('createHotspotIndex', () => {
  const ITALY: [number, number, number, number] = [6, 36, 19, 48]
  const features = [dot(1, 42, 12, 2), dot(2, 42.001, 12.001, 2), dot(3, 42.002, 12, 0), dot(4, 38, 15, 0)]

  it('clusters nearby points at country zoom with per-type counts', () => {
    const items = createHotspotIndex(features).getClusters(ITALY, 5)
    const clusters = items.flatMap((f) => ('cluster' in f.properties ? [f.properties] : []))
    expect(clusters).toHaveLength(1)
    expect(clusters[0].point_count).toBe(3)
    expect(majorityType(clusters[0])).toBe(2)
    expect(items).toHaveLength(2)
  })

  it(`returns every point unclustered from zoom ${SINGLE_DOT_ZOOM}`, () => {
    const items = createHotspotIndex(features).getClusters(ITALY, SINGLE_DOT_ZOOM)
    expect(items.every((f) => !('cluster' in f.properties))).toBe(true)
    expect(items.flatMap((f) => ('cluster' in f.properties ? [] : [f.properties.id])).sort()).toEqual([1, 2, 3, 4])
  })

  it('handles empty data', () => {
    expect(createHotspotIndex([]).getClusters(ITALY, 5)).toEqual([])
  })
})
