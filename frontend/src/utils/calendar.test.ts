import { describe, expect, it } from 'vitest'
import { RAMP, buildGrid, heatInk, topDays } from './calendar'

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
