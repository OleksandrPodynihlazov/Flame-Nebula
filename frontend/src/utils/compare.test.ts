import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, YEARS } from '../constants/fire'
import { defaultCompareYears, filtersForYear, formatMW, formatPct, pctChange, peakIndex } from './compare'

describe('defaultCompareYears', () => {
  it('compares the year with the latest one', () => {
    expect(defaultCompareYears(2008)).toEqual({ a: 2008, b: YEARS[YEARS.length - 1] })
  })

  it('steps back a year when the latest year is selected', () => {
    const last = YEARS[YEARS.length - 1]
    expect(defaultCompareYears(last)).toEqual({ a: last - 1, b: last })
  })
})

describe('filtersForYear', () => {
  it('sets the year and drops the month and day selection', () => {
    const f = filtersForYear({ ...DEFAULT_FILTERS, month: 7, date: '2008-08-14' }, 2019)
    expect(f).toMatchObject({ year: 2019, month: null, date: null })
  })

  it('keeps the area and type filters', () => {
    const area = { kind: 'circle' as const, lat: 41, lon: 12, radiusKm: 30 }
    const f = filtersForYear({ ...DEFAULT_FILTERS, area, types: [0], hideNoise: true }, 2019)
    expect(f).toMatchObject({ area, types: [0], hideNoise: true })
  })

  it('falls back to MODIS when no selected sensor has data that year', () => {
    expect(filtersForYear({ ...DEFAULT_FILTERS, sensors: ['VIIRS'] }, 2005).sensors).toEqual(['MODIS'])
  })

  it('keeps VIIRS for a year it covers', () => {
    expect(filtersForYear({ ...DEFAULT_FILTERS, sensors: ['MODIS', 'VIIRS'] }, 2019).sensors).toEqual(['MODIS', 'VIIRS'])
  })
})

describe('pctChange', () => {
  it('rounds the change to a whole percent', () => {
    expect(pctChange(200, 250)).toBe(25)
    expect(pctChange(300, 100)).toBe(-67)
  })

  it('has no percent change from zero', () => {
    expect(pctChange(0, 10)).toBeNull()
  })

  it('formats the sign', () => {
    expect(formatPct(25)).toBe('+25%')
    expect(formatPct(-3)).toBe('-3%')
    expect(formatPct(null)).toBe('—')
  })
})

describe('formatMW', () => {
  it('abbreviates large sums', () => {
    expect(formatMW(184532.7)).toBe('184.5K MW')
    expect(formatMW(950)).toBe('950 MW')
  })
})

describe('peakIndex', () => {
  it('finds the largest positive value', () => {
    expect(peakIndex([1, 5, 3])).toBe(1)
  })

  it('has no peak when everything is zero', () => {
    expect(peakIndex([0, 0])).toBeNull()
  })
})
