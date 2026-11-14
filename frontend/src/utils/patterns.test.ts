import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS } from '../constants/fire'
import type { PatternCell } from '../types/api'
import { formatProbability, patternColor, patternQuery, patternStats, peakPatternMonth, probabilityBuckets } from './patterns'

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
    expect(patternQuery({ ...DEFAULT_FILTERS, area, types: [0], daynight: 'D' }, 8)).toEqual({ month: 8, lat: 41, lon: 12, radius_km: 30 })
  })

  it('has no month for the summary', () => {
    expect(patternQuery(DEFAULT_FILTERS)).toEqual({})
  })
})

describe('patternStats', () => {
  it('counts likely cells and finds the top one', () => {
    const s = patternStats([cell(0.2), cell(0.5), cell(1, 3), cell(1, 9)])
    expect(s).toMatchObject({ cells: 4, likely: 3, maxProbability: 1 })
    expect(s?.top?.median_count).toBe(9)
  })

  it('is null without data', () => {
    expect(patternStats(null)).toBeNull()
  })
})

describe('probabilityBuckets', () => {
  it('puts 100% in the last bucket', () => {
    expect(probabilityBuckets([cell(0.1), cell(0.45), cell(1), cell(0.8)])).toEqual([1, 0, 1, 0, 2])
  })
})

describe('peakPatternMonth', () => {
  it('picks the month with the most likely cells', () => {
    expect(peakPatternMonth([
      { month: 7, cells: 10, likely: 3, max_probability: 1 },
      { month: 8, cells: 10, likely: 5, max_probability: 1 },
    ])).toBe(8)
  })
})

describe('formatting', () => {
  it('formats probability and colors', () => {
    expect(formatProbability(0.929)).toBe('93%')
    expect(patternColor(0)).toBe('rgb(253, 230, 138)')
    expect(patternColor(1)).toBe('rgb(185, 28, 28)')
  })
})
