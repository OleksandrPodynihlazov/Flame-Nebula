import { describe, expect, it } from 'vitest'
import type { Area, HarmonizedMonth } from '../types/api'
import { EUROPE, harmonizedScope, median, satelliteName, yearlySeries, yearVsMedian } from './harmonized'

const BOX = { type: 'Polygon' as const, coordinates: [] }

function month(m: string, raw: number, count: number, satellite = 'Aqua'): HarmonizedMonth {
  return { month: m, satellite, raw, count, lo: count, hi: count, days_missing: 0 }
}

function fullYear(year: number, raw: number, count: number, satellite = 'Aqua'): HarmonizedMonth[] {
  return Array.from({ length: 12 }, (_, i) => month(`${year}-${String(i + 1).padStart(2, '0')}`, raw, count, satellite))
}

describe('harmonizedScope', () => {
  it('uses Europe without an area or for a drawn shape', () => {
    expect(harmonizedScope(null)).toEqual({ query: { country: EUROPE }, label: 'Europe' })
    expect(harmonizedScope({ kind: 'circle', lat: 41, lon: 12, radiusKm: 50 }).query.country).toBe(EUROPE)
  })

  it('uses the country of a region, named after the top of its path', () => {
    const sicilia: Area = { kind: 'region', id: 1, name: 'Sicilia', path: 'Italy › Isole', geometry: BOX, country: 'ITA' }
    expect(harmonizedScope(sicilia)).toEqual({ query: { country: 'ITA' }, label: 'Italy' })
    const italy: Area = { kind: 'region', id: 2, name: 'Italy', path: '', geometry: BOX, country: 'ITA' }
    expect(harmonizedScope(italy).label).toBe('Italy')
  })

  it('falls back to Europe for a region without a country', () => {
    const old: Area = { kind: 'region', id: 3, name: 'Sardegna', path: '', geometry: BOX }
    expect(harmonizedScope(old).query.country).toBe(EUROPE)
  })
})

describe('yearlySeries', () => {
  it('sums each full year and drops partial years', () => {
    const months = [month('2000-11', 5, 40, 'Terra'), month('2000-12', 5, 40, 'Terra'), ...fullYear(2001, 10, 80), ...fullYear(2002, 20, 20, 'N')]
    expect(yearlySeries(months)).toEqual([
      { year: 2001, raw: 120, count: 960, satellites: ['Aqua'] },
      { year: 2002, raw: 240, count: 240, satellites: ['N'] },
    ])
  })

  it('lists the reference satellites of a year in order', () => {
    const months = fullYear(2012, 1, 1, 'N')
    months[0] = month('2012-01', 1, 1, 'Aqua')
    expect(yearlySeries(months)[0].satellites).toEqual(['Aqua', 'N'])
  })
})

describe('median and yearVsMedian', () => {
  it('median of odd and even lists', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBeNull()
  })

  it('compares a year with the median of the other years', () => {
    const points = [2001, 2002, 2003, 2004].map((year, i) => ({ year, raw: 0, count: [100, 200, 300, 600][i], satellites: ['Aqua'] }))
    const r = yearVsMedian(points, 2004)
    expect(r?.median).toBe(200)
    expect(r?.change).toBeCloseTo(2)
    expect(yearVsMedian(points, 1999)).toBeNull()
  })
})

describe('satelliteName', () => {
  it('names the FIRMS codes', () => {
    expect(satelliteName('N')).toBe('S-NPP')
    expect(satelliteName('N20')).toBe('NOAA-20')
    expect(satelliteName('Terra')).toBe('Terra')
  })
})
