import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS } from '../constants/fire'
import type { Area, Region, RegionGeometry } from '../types/api'
import { inGeometry } from './area'
import { selectionQuery } from './filters'
import { italyFirst } from './regions'
import { selectionShapeFeature } from './selectionExport'
import { areaKm2 } from './selectionSummary'

const region = (id: number, country: string): Region => ({ id, name: `r${id}`, level: 2, country, parent_id: null, path: '' })

// 1° box at 12–13°E, 42–43°N with a hole at 12.4–12.6°E, 42.4–42.6°N; plus a second box at 14–15°E.
const BOX: RegionGeometry = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [[12, 42], [13, 42], [13, 43], [12, 43], [12, 42]],
      [[12.4, 42.4], [12.6, 42.4], [12.6, 42.6], [12.4, 42.6], [12.4, 42.4]],
    ],
    [[[14, 42], [15, 42], [15, 43], [14, 43], [14, 42]]],
  ],
}
const AREA: Area = { kind: 'region', id: 1756, name: 'Sicilia', path: 'Italy › Isole', geometry: BOX }

describe('italyFirst', () => {
  it('puts Italian regions first and keeps the API order otherwise', () => {
    const out = italyFirst([region(1, 'ROU'), region(2, 'ITA'), region(3, 'HRV'), region(4, 'ITA')])
    expect(out.map((r) => r.id)).toEqual([2, 4, 1, 3])
  })
})

describe('inGeometry', () => {
  it('is inside an outer ring, outside its hole, and inside any part of a MultiPolygon', () => {
    expect(inGeometry([12.2, 42.2], BOX)).toBe(true)
    expect(inGeometry([12.5, 42.5], BOX)).toBe(false)
    expect(inGeometry([14.5, 42.5], BOX)).toBe(true)
    expect(inGeometry([13.5, 42.5], BOX)).toBe(false)
  })
})

describe('region area', () => {
  it('sends region=<id> and no circle or polygon params', () => {
    const q = selectionQuery({ ...DEFAULT_FILTERS, area: AREA })
    expect(q.region).toBe(1756)
    expect(q.polygon).toBeUndefined()
    expect(q.lat).toBeUndefined()
  })

  it('measures the outline minus holes (two 1° boxes near 42.5°N ≈ 2 × 9,120 km², minus the hole)', () => {
    const km2 = areaKm2(AREA)
    expect(km2).toBeGreaterThan(17_000)
    expect(km2).toBeLessThan(18_200)
  })

  it('exports the outline with the region id and name', () => {
    const f = selectionShapeFeature(AREA)
    expect(f.geometry).toBe(BOX)
    expect(f.properties).toMatchObject({ selection: true, region_id: 1756, name: 'Sicilia' })
  })
})
