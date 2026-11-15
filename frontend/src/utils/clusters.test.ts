import { describe, expect, it } from 'vitest'
import { BUBBLE_HEAT_STEPS, abbreviateCount, bubbleHeatColor, bubbleRadius, bubbleShare, drawOrder, topmostAt } from './clusters'
import { RAMP } from './calendar'

describe('bubbleRadius', () => {
  it('grows with count and stays within 10–32 px', () => {
    expect(bubbleRadius(0)).toBe(10)
    expect(bubbleRadius(2)).toBe(10)
    expect(bubbleRadius(100)).toBe(18)
    expect(bubbleRadius(1e6)).toBe(32)
    expect(bubbleRadius(400)).toBeGreaterThan(bubbleRadius(100))
  })

  it('stays within a smaller max, but never under 10 px', () => {
    expect(bubbleRadius(1e6, 22.5)).toBe(22.5)
    expect(bubbleRadius(100, 22.5)).toBe(18)
    expect(bubbleRadius(1e6, 4)).toBe(10)
  })
})

describe('bubbleShare', () => {
  it('is the √ share of the busiest cell, clamped to 0..1', () => {
    expect(bubbleShare(25, 100)).toBe(0.5)
    expect(bubbleShare(500, 100)).toBe(1)
    expect(bubbleShare(5, 0)).toBe(0)
  })
})

describe('drawOrder and topmostAt', () => {
  const big = { x: 10, y: 10, r: 30, id: 'big' }
  const small = { x: 20, y: 10, r: 10, id: 'small' }
  const mid = { x: 15, y: 10, r: 20, id: 'mid' }

  it('draws biggest first without mutating the input', () => {
    const input = [small, big, mid]
    expect(drawOrder(input).map((s) => s.id)).toEqual(['big', 'mid', 'small'])
    expect(input.map((s) => s.id)).toEqual(['small', 'big', 'mid'])
  })

  it('picks the smallest bubble where several overlap', () => {
    expect(topmostAt(drawOrder([small, big, mid]), 20, 10, 3)?.id).toBe('small')
    expect(topmostAt(drawOrder([small, big, mid]), -15, 10, 3)?.id).toBe('big')
  })

  it('counts the slop and returns undefined on a miss', () => {
    expect(topmostAt([small], 33, 10, 3)).toBe(small)
    expect(topmostAt([small], 34, 10, 3)).toBeUndefined()
    expect(topmostAt([], 0, 0, 3)).toBeUndefined()
  })
})

describe('bubbleHeatColor', () => {
  it('runs from heat-4 to heat-6 in five steps', () => {
    expect(bubbleHeatColor(0)).toBe(RAMP[4])
    expect(bubbleHeatColor(1)).toBe(RAMP[6])
    expect(bubbleHeatColor(0.5)).toBe(RAMP[5])
    expect(new Set(Array.from({ length: BUBBLE_HEAT_STEPS }, (_, i) => bubbleHeatColor(i / BUBBLE_HEAT_STEPS))).size).toBe(BUBBLE_HEAT_STEPS)
  })
})

describe('abbreviateCount', () => {
  it('keeps small counts and shortens thousands', () => {
    expect(abbreviateCount(0)).toBe('0')
    expect(abbreviateCount(999)).toBe('999')
    expect(abbreviateCount(1000)).toBe('1k')
    expect(abbreviateCount(1250)).toBe('1.3k')
    expect(abbreviateCount(9949)).toBe('9.9k')
    expect(abbreviateCount(12345)).toBe('12k')
    expect(abbreviateCount(437000)).toBe('437k')
  })
})
