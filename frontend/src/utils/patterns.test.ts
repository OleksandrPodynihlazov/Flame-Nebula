import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS } from '../constants/fire'
import type { PatternCell } from '../types/api'
import { MIN_PROBABILITY, formatProbability, patternColor, patternQuery, patternShade, patternStats, peakPatternMonth, yearBands } from './patterns'

const cell = (probability: number, median_count = 1): PatternCell => ({
  lat: 37.65,
  lon: 14.25,
  years_burned: Math.round(probability * 14),
  years_observed: 14,
  probability,
  median_count,
})

describe('patternQuery', () => {
  it('sends the month and the area only', () => {
    const area = { kind: 'circle' as const, lat: 41, lon: 12, radiusKm: 30 }
    expect(patternQuery({ ...DEFAULT_FILTERS, area, types: [0], daynight: 'D' }, 8)).toEqual({ min_probability: MIN_PROBABILITY, month: 8, lat: 41, lon: 12, radius_km: 30 })
  })

  it('has no month for the summary', () => {
    expect(patternQuery(DEFAULT_FILTERS)).toEqual({ min_probability: MIN_PROBABILITY })
  })
})

describe('patternStats', () => {
  it('counts every-year cells and finds the top one', () => {
    const s = patternStats([cell(12 / 14), cell(13 / 14), cell(1, 3), cell(1, 9)])
    expect(s).toMatchObject({ cells: 4, everyYear: 2, maxProbability: 1 })
    expect(s?.top?.median_count).toBe(9)
  })

  it('is null without data', () => {
    expect(patternStats(null)).toBeNull()
  })
})

describe('yearBands', () => {
  it('counts cells per 12/13/14 of 14 years', () => {
    expect(yearBands([cell(12 / 14), cell(13 / 14), cell(1), cell(1)])).toEqual([1, 1, 2])
  })
})

describe('peakPatternMonth', () => {
  it('picks the month with the most recurring cells', () => {
    expect(peakPatternMonth([
      { month: 7, cells: 3, likely: 3, max_probability: 1 },
      { month: 8, cells: 5, likely: 5, max_probability: 1 },
    ])).toBe(8)
  })
})

describe('formatting', () => {
  it('formats probability and colors', () => {
    expect(formatProbability(0.929)).toBe('93%')
    expect(patternColor(0)).toBe('rgb(255, 231, 163)')
    expect(patternColor(1)).toBe('rgb(142, 31, 11)')
    expect(patternShade(MIN_PROBABILITY)).toBe(patternColor(0))
    expect(patternShade(1)).toBe(patternColor(1))
  })
})
