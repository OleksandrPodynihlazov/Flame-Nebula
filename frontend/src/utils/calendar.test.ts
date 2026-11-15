import { describe, expect, it } from 'vitest'
import { RAMP, buildGrid, defaultCell, formatUtcDate, gridForYear, heatInk, isGridNavKey, moveCell, peakDay, placeTip, topDays } from './calendar'

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Token values from index.css: --background, --foreground, white.
const INK: Record<string, string> = { 'text-background': '#070a0f', 'text-foreground': '#e6edf5', 'text-white': '#ffffff' }

describe('heatInk', () => {
  it('keeps normal-size text at 4.5:1 on every heat step', () => {
    RAMP.forEach((bg, idx) => {
      expect(contrast(bg, INK[heatInk(idx)])).toBeGreaterThanOrEqual(4.5)
    })
  })
})

describe('topDays', () => {
  const grid = buildGrid(2008, {
    days: [
      { date: '2008-08-15', count: 46, frp: 1 },
      { date: '2008-08-02', count: 46, frp: 1 },
      { date: '2008-07-30', count: 60, frp: 1 },
      { date: '2008-08-20', count: 5, frp: 1 },
      { date: '2008-08-21', count: 0, frp: 0 },
    ],
  })

  it('ranks by count, earlier date first on ties', () => {
    expect(topDays(grid, 2008, null, 3)).toEqual([
      { date: '2008-07-30', count: 60 },
      { date: '2008-08-02', count: 46 },
      { date: '2008-08-15', count: 46 },
    ])
  })

  it('restricts to one month and skips zero-count days', () => {
    expect(topDays(grid, 2008, 7, 10).map((d) => d.date)).toEqual(['2008-08-02', '2008-08-15', '2008-08-20'])
  })

  it('returns nothing for an empty year', () => {
    expect(topDays(buildGrid(2008, { days: [] }), 2008, null, 3)).toEqual([])
  })
})

describe('gridForYear', () => {
  const days = { days: [{ date: '2008-03-02', count: 4, frp: 10 }] }

  it('builds the grid when the days belong to the year', () => {
    expect(gridForYear(2008, days)?.total).toBe(4)
  })

  it('is null without an answer', () => {
    expect(gridForYear(2008, null)).toBeNull()
  })

  it('is null for another year instead of a grid of zeros', () => {
    expect(gridForYear(2010, days)).toBeNull()
  })

  it('builds an empty grid for a year without days', () => {
    expect(gridForYear(2010, { days: [] })?.total).toBe(0)
  })
})

describe('per-day FRP and peak day', () => {
  const grid = buildGrid(2008, {
    days: [
      { date: '2008-08-15', count: 46, frp: 120.5 },
      { date: '2008-08-16', count: 46, frp: 3 },
      { date: '2008-08-20', count: 2, frp: 1.25 },
    ],
  })
  it('keeps FRP per day and zero where there is nothing', () => {
    expect(grid.dayFrp[7][14]).toBe(120.5)
    expect(grid.dayFrp[7][0]).toBe(0)
  })
  it('names the peak day, earliest on ties, and null for an empty month', () => {
    expect(peakDay(grid, 7)).toEqual({ day: 15, count: 46 })
    expect(peakDay(grid, 0)).toBeNull()
  })
})

describe('formatUtcDate', () => {
  it('formats weekday, day, short month and year in UTC', () => {
    expect(formatUtcDate(2008, 7, 15)).toBe('Fri 15 Aug 2008')
    expect(formatUtcDate(2008, 0, 1)).toBe('Tue 1 Jan 2008')
  })
})

describe('moveCell', () => {
  const at = (month: number, day: number) => ({ month: month as never, day })
  it('steps a day and crosses month boundaries', () => {
    expect(moveCell('ArrowRight', at(0, 31), 2008)).toEqual(at(1, 1))
    expect(moveCell('ArrowLeft', at(2, 1), 2008)).toEqual(at(1, 29))
    expect(moveCell('ArrowLeft', at(2, 1), 2009)).toEqual(at(1, 28))
  })
  it('stays put at the edges of the year', () => {
    expect(moveCell('ArrowLeft', at(0, 1), 2008)).toEqual(at(0, 1))
    expect(moveCell('ArrowRight', at(11, 31), 2008)).toEqual(at(11, 31))
    expect(moveCell('ArrowUp', at(0, 15), 2008)).toEqual(at(0, 15))
    expect(moveCell('PageDown', at(11, 15), 2008)).toEqual(at(11, 15))
  })
  it('moves a month and clamps to its length, leap years included', () => {
    expect(moveCell('ArrowDown', at(0, 31), 2008)).toEqual(at(1, 29))
    expect(moveCell('ArrowDown', at(0, 31), 2009)).toEqual(at(1, 28))
    expect(moveCell('PageDown', at(2, 31), 2008)).toEqual(at(3, 30))
    expect(moveCell('PageUp', at(4, 31), 2008)).toEqual(at(3, 30))
    expect(moveCell('ArrowUp', at(2, 30), 2008)).toEqual(at(1, 29))
  })
  it('jumps to the first and last day of the row', () => {
    expect(moveCell('Home', at(1, 10), 2008)).toEqual(at(1, 1))
    expect(moveCell('End', at(1, 10), 2008)).toEqual(at(1, 29))
    expect(moveCell('End', at(1, 10), 2009)).toEqual(at(1, 28))
  })
  it('recognises only navigation keys', () => {
    expect(isGridNavKey('Home')).toBe(true)
    expect(isGridNavKey('Enter')).toBe(false)
  })
})

describe('defaultCell', () => {
  const data = buildGrid(2008, { days: [{ date: '2008-03-05', count: 4, frp: 1 }, { date: '2008-08-15', count: 46, frp: 1 }] })
  const empty = buildGrid(2008, { days: [] })
  it('prefers the selected day', () => {
    expect(defaultCell(data, 2008, '2008-08-15', '2008-01-01')).toEqual({ month: 7, day: 15 })
  })
  it('then today when it falls in the year', () => {
    expect(defaultCell(data, 2008, null, '2008-06-10')).toEqual({ month: 5, day: 10 })
    expect(defaultCell(data, 2008, null, '2026-06-10')).toEqual({ month: 2, day: 5 })
  })
  it('then the first day with data, then 1 Jan', () => {
    expect(defaultCell(data, 2008, null, '2026-01-01')).toEqual({ month: 2, day: 5 })
    expect(defaultCell(empty, 2008, null, '2026-01-01')).toEqual({ month: 0, day: 1 })
  })
  it('ignores a selection from another year or a date that does not exist', () => {
    expect(defaultCell(data, 2008, '2009-08-15', '2026-01-01')).toEqual({ month: 2, day: 5 })
    expect(defaultCell(data, 2008, '2008-02-30', '2026-01-01')).toEqual({ month: 2, day: 5 })
  })
})

describe('placeTip', () => {
  const tip = { width: 200, height: 80 }
  const view = { width: 1000, height: 700 }
  it('sits above the anchor, centred', () => {
    expect(placeTip({ left: 400, right: 420, top: 300, bottom: 320 }, tip, view)).toEqual({ left: 310, top: 212, side: 'top' })
  })
  it('flips below when there is no room above', () => {
    expect(placeTip({ left: 400, right: 420, top: 50, bottom: 70 }, tip, view)).toMatchObject({ top: 78, side: 'bottom' })
  })
  it('clamps into the viewport at both sides', () => {
    expect(placeTip({ left: 990, right: 1000, top: 300, bottom: 320 }, tip, view).left).toBe(792)
    expect(placeTip({ left: 0, right: 10, top: 300, bottom: 320 }, tip, view).left).toBe(8)
  })
})
