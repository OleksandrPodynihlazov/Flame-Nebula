import { describe, expect, it } from 'vitest'
import { abbreviateCount, bubbleRadius } from './clusters'

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
