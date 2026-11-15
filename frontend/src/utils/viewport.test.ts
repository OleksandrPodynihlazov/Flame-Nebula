import { describe, expect, it } from 'vitest'
import { CELLS, GRID_MAX_CELLS, bboxParam, cellBounds, cellForZoom, fallbackCell, viewFor } from './viewport'

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
    expect(viewFor(italy, 6)).toEqual({ bbox: bboxParam(italy), cell: 1, zoom: 6 })
    expect(viewFor(italy, 9)?.cell).toBeNull()
  })

  it('floors the zoom: 8.5 and 8.75 still ask for a grid, 9 and 9.25 for points', () => {
    expect(viewFor(italy, 8.5)?.cell).toBe(0.25)
    expect(viewFor(italy, 8.75)?.cell).toBe(0.25)
    expect(viewFor(italy, 9)?.cell).toBeNull()
    expect(viewFor(italy, 9.25)?.cell).toBeNull()
  })

  it('keeps the grid cell of whole zooms and gives fractional zooms the cell of the zoom below', () => {
    for (let z = 0; z < 9; z++) expect(viewFor(italy, z)?.cell).toBe(cellForZoom(z))
    expect(viewFor(italy, 6.75)?.cell).toBe(cellForZoom(6))
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

describe('fallbackCell', () => {
  const cellsIn = (bbox: string, c: number) => {
    const [w, s, e, n] = bbox.split(',').map(Number)
    return Math.ceil((e - w) / c) * Math.ceil((n - s) / c)
  }

  it('is the cell of the normal grid at that zoom when the view is small enough', () => {
    for (const z of [9, 10, 11, 12]) expect(fallbackCell('14.00,37.00,14.50,37.40', z)).toBe(cellForZoom(z))
    expect(fallbackCell('14.00,37.00,14.50,37.40', 10)).toBe(0.1)
    expect(fallbackCell('14.00,37.00,14.50,37.40', 11)).toBe(0.05)
  })

  it('coarsens to the next bigger size only while the view exceeds the 20000-cell limit', () => {
    const bbox = '0.00,0.00,10.00,5.50'
    expect(cellsIn(bbox, 0.05)).toBeGreaterThan(GRID_MAX_CELLS)
    expect(fallbackCell(bbox, 11)).toBe(0.1)
    expect(cellsIn(bbox, 0.1)).toBeLessThanOrEqual(GRID_MAX_CELLS)
  })

  it('never goes finer than the wanted cell', () => {
    expect(fallbackCell('14.00,37.00,14.01,37.01', 9)).toBe(cellForZoom(9))
  })

  it('uses the cell of zoom 8 when the bbox cannot be read', () => {
    expect(fallbackCell('not,a,bbox,here', 9)).toBe(cellForZoom(8))
  })
})
