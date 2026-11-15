import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS } from '../constants/fire'
import {
  clearedFilters,
  countChangedFilters,
  filterSummary,
  sensorAvailableIn,
  selectionQuery,
  sensorYears,
  toggleDatePatch,
  toggleDayPatch,
  toggleMonthPatch,
  yearPatch,
  yearQuery,
} from './filters'
import { toSearchParams } from '../api/client'

describe('toggleMonthPatch', () => {
  it('selects a month and clears the day', () => {
    expect(toggleMonthPatch({ ...DEFAULT_FILTERS, date: '2008-03-02', month: 2 }, 7)).toEqual({ month: 7, date: null })
  })

  it('unselects the month when it is already selected', () => {
    expect(toggleMonthPatch({ ...DEFAULT_FILTERS, month: 7 }, 7)).toEqual({ month: null, date: null })
  })

  it('goes from a day back to its whole month', () => {
    expect(toggleMonthPatch({ ...DEFAULT_FILTERS, month: 7, date: '2008-08-14' }, 7)).toEqual({ month: 7, date: null })
  })
})

describe('toggleDatePatch', () => {
  it('selects a day and its month', () => {
    expect(toggleDatePatch(DEFAULT_FILTERS, '2008-08-14')).toEqual({ month: 7, date: '2008-08-14' })
  })

  it('unselects the day and keeps the month', () => {
    expect(toggleDatePatch({ ...DEFAULT_FILTERS, month: 7, date: '2008-08-14' }, '2008-08-14')).toEqual({ date: null })
  })
})

describe('toggleDayPatch', () => {
  it('selects a day and its month', () => {
    expect(toggleDayPatch(DEFAULT_FILTERS, '2008-08-14')).toEqual({ month: 7, date: '2008-08-14' })
  })

  it('moves to another day in the same month', () => {
    expect(toggleDayPatch({ ...DEFAULT_FILTERS, month: 7, date: '2008-08-14' }, '2008-08-15')).toEqual({ month: 7, date: '2008-08-15' })
  })

  it('unselects the day and the month, back to the full year', () => {
    expect(toggleDayPatch({ ...DEFAULT_FILTERS, month: 7, date: '2008-08-14' }, '2008-08-14')).toEqual({ month: null, date: null })
  })
})

describe('yearPatch', () => {
  it('clears month and day', () => {
    expect(yearPatch({ ...DEFAULT_FILTERS, month: 3, date: '2008-04-01' }, 2019)).toMatchObject({ year: 2019, month: null, date: null })
  })

  it('drops sensors with no data that year, falling back to MODIS', () => {
    expect(yearPatch({ ...DEFAULT_FILTERS, sensors: ['VIIRS'] }, 2005).sensors).toEqual(['MODIS'])
  })
})

describe('countChangedFilters', () => {
  it('is 0 for the defaults', () => {
    expect(countChangedFilters(DEFAULT_FILTERS)).toBe(0)
  })

  it('ignores year, month, date and area', () => {
    expect(countChangedFilters({ ...DEFAULT_FILTERS, year: 2020, month: 3, date: '2020-04-02' })).toBe(0)
  })

  it('counts each changed filter once', () => {
    expect(countChangedFilters({ ...DEFAULT_FILTERS, types: [0], daynight: 'N', hideNoise: true, sensors: ['MODIS', 'VIIRS'] })).toBe(4)
    expect(countChangedFilters({ ...DEFAULT_FILTERS, daynight: 'D' })).toBe(1)
  })

  it('counts the non-fire switch', () => {
    expect(countChangedFilters({ ...DEFAULT_FILTERS, showNonFire: true })).toBe(1)
  })

  it('treats reordered types and sensors as unchanged', () => {
    expect(countChangedFilters({ ...DEFAULT_FILTERS, types: [3, 2, 1, 0] })).toBe(0)
  })
})

describe('include_non_fire', () => {
  const on = { ...DEFAULT_FILTERS, showNonFire: true }

  it('is not sent by default, so the API hides non-fire points', () => {
    expect(yearQuery(DEFAULT_FILTERS)).not.toHaveProperty('include_non_fire')
    expect(toSearchParams(yearQuery(DEFAULT_FILTERS)).has('include_non_fire')).toBe(false)
  })

  it('is sent as include_non_fire=true while the switch is on, for the year and for a month or day', () => {
    expect(toSearchParams(yearQuery(on)).get('include_non_fire')).toBe('true')
    expect(toSearchParams(selectionQuery({ ...on, month: 7 })).get('include_non_fire')).toBe('true')
    expect(toSearchParams(selectionQuery({ ...on, month: 7, date: '2008-08-14' })).get('include_non_fire')).toBe('true')
  })

  it('never sends min_confidence', () => {
    expect(toSearchParams(yearQuery(on)).has('min_confidence')).toBe(false)
  })
})

describe('clearedFilters', () => {
  it('resets type, pass, noise, non-fire and sensors and keeps year, period and area', () => {
    const area = { kind: 'circle', lat: 41, lon: 12, radiusKm: 20 } as const
    const f = { ...DEFAULT_FILTERS, year: 2012, month: 7 as const, area, types: [1] as typeof DEFAULT_FILTERS.types, daynight: 'N' as const, hideNoise: true, showNonFire: true, sensors: ['VIIRS' as const] }
    expect(clearedFilters(f)).toEqual({ ...DEFAULT_FILTERS, year: 2012, month: 7, area })
  })

  it('leaves nothing for the badge to count', () => {
    expect(countChangedFilters(clearedFilters({ ...DEFAULT_FILTERS, daynight: 'D', hideNoise: true }))).toBe(0)
  })
})

describe('filterSummary', () => {
  it('names only the period for default filters', () => {
    expect(filterSummary(DEFAULT_FILTERS)).toBe('Full year 2008')
  })

  it('lists period, pass, type and area in that order', () => {
    const f = { ...DEFAULT_FILTERS, month: 7 as const, daynight: 'N' as const, types: [1 as const], area: { kind: 'polygon' as const, points: [] } }
    expect(filterSummary(f)).toBe('Aug 2008 · Night only · Active volcano · Selected area')
  })

  it('names a region and non-default sensors', () => {
    const area = { kind: 'region' as const, id: 9, name: 'Sardegna', path: '', geometry: { type: 'Polygon' as const, coordinates: [] } }
    expect(filterSummary({ ...DEFAULT_FILTERS, year: 2020, sensors: ['VIIRS'], hideNoise: true, area })).toBe('Full year 2020 · Noise hidden · VIIRS · Sardegna')
  })
})

describe('sensorAvailableIn', () => {
  it('single year 2008: VIIRS unavailable', () => {
    expect(sensorAvailableIn('VIIRS', sensorYears(DEFAULT_FILTERS, null))).toBe(false)
  })

  it('compare 2008 vs 2020: VIIRS available', () => {
    expect(sensorAvailableIn('VIIRS', sensorYears(DEFAULT_FILTERS, { a: 2008, b: 2020 }))).toBe(true)
  })

  it('compare 2005 vs 2008: VIIRS unavailable, MODIS available', () => {
    const years = sensorYears(DEFAULT_FILTERS, { a: 2005, b: 2008 })
    expect(sensorAvailableIn('VIIRS', years)).toBe(false)
    expect(sensorAvailableIn('MODIS', years)).toBe(true)
  })
})
