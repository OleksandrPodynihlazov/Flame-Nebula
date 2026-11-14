import { describe, expect, it } from 'vitest'
import { CELLS, bboxParam, cellBounds, cellForZoom, viewFor } from './viewport'

describe('bboxParam', () => {
  it('pads 10% per side and rounds outward to 0.01°', () => {
    // 10° x 10° view -> 1° padding per side.
    expect(bboxParam({ west: 6.333, south: 36.111, east: 16.333, north: 46.111 })).toBe('5.33,35.11,17.34,47.12')
  })

  it('clamps to the world', () => {
    expect(bboxParam({ west: -200, south: -85, east: 200, north: 85 })).toBe('-180.00,-90.00,180.00,90.00')
  })

  it('is null when the view shows only a wrapped world copy', () => {
    expect(bboxParam({ west: 190, south: 10, east: 200, north: 20 })).toBeNull()
  })

  it('gives the same string for views that differ below 0.01°', () => {
    expect(bboxParam({ west: 10.001, south: 40.001, east: 11, north: 41 }, 0)).toBe(
      bboxParam({ west: 10.004, south: 40.004, east: 11, north: 41 }, 0),
    )
  })
})

describe('cellForZoom', () => {
  it('snaps 90 / 2^zoom to the fixed set', () => {
    expect(cellForZoom(0)).toBe(10)
    expect(cellForZoom(3)).toBe(10)
    expect(cellForZoom(4)).toBe(5)
    expect(cellForZoom(5)).toBe(2)
    expect(cellForZoom(6)).toBe(1)
    expect(cellForZoom(7)).toBe(0.5)
    expect(cellForZoom(8)).toBe(0.25)
    expect(cellForZoom(14)).toBe(0.01)
    for (let z = 0; z <= 18; z++) expect(CELLS).toContain(cellForZoom(z))
  })
})

describe('viewFor', () => {
  const italy = { west: 6, south: 36, east: 19, north: 48 }
  it('asks for a grid below zoom 9 and for points from zoom 9', () => {
    expect(viewFor(italy, 6)).toEqual({ bbox: bboxParam(italy), cell: 1 })
    expect(viewFor(italy, 8.6)?.cell).toBeNull()
    expect(viewFor(italy, 9)?.cell).toBeNull()
  })
})

describe('cellBounds', () => {
  it('returns the cell that holds the point', () => {
    expect(cellBounds(41.93, 12.48, 0.5)).toEqual([
      [41.5, 12],
      [42, 12.5],
    ])
    expect(cellBounds(-0.2, -0.7, 1)).toEqual([
      [-1, -1],
      [0, 0],
    ])
  })
})
