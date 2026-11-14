import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS } from '../constants/fire'
import { toggleDatePatch, toggleMonthPatch, yearPatch } from './filters'

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

describe('yearPatch', () => {
  it('clears month and day', () => {
    expect(yearPatch({ ...DEFAULT_FILTERS, month: 3, date: '2008-04-01' }, 2019)).toMatchObject({ year: 2019, month: null, date: null })
  })

  it('drops sensors with no data that year, falling back to MODIS', () => {
    expect(yearPatch({ ...DEFAULT_FILTERS, sensors: ['VIIRS'] }, 2005).sensors).toEqual(['MODIS'])
  })
})
