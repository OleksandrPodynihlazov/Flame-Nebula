import { describe, expect, it } from 'vitest'
import { sheetOffset, shouldOpen } from './sheet'

const TRAVEL = 400

describe('sheetOffset', () => {
  it('rests at 0 when open and at travel when peeking', () => {
    expect(sheetOffset(true, TRAVEL, 0)).toBe(0)
    expect(sheetOffset(false, TRAVEL, 0)).toBe(TRAVEL)
  })

  it('follows the finger', () => {
    expect(sheetOffset(false, TRAVEL, -150)).toBe(250)
    expect(sheetOffset(true, TRAVEL, 90)).toBe(90)
  })

  it('clamps between fully open and peek', () => {
    expect(sheetOffset(false, TRAVEL, -900)).toBe(0)
    expect(sheetOffset(false, TRAVEL, 900)).toBe(TRAVEL)
    expect(sheetOffset(true, TRAVEL, -50)).toBe(0)
    expect(sheetOffset(true, TRAVEL, 900)).toBe(TRAVEL)
  })
})

describe('shouldOpen', () => {
  const slow = 0.1

  it('opens a peeking sheet dragged up past 25% of travel', () => {
    expect(shouldOpen({ drag: -101, velocity: -slow, travel: TRAVEL, wasOpen: false })).toBe(true)
  })

  it('snaps a peeking sheet back when dragged up less than 25%', () => {
    expect(shouldOpen({ drag: -100, velocity: -slow, travel: TRAVEL, wasOpen: false })).toBe(false)
    expect(shouldOpen({ drag: 80, velocity: slow, travel: TRAVEL, wasOpen: false })).toBe(false)
  })

  it('closes an open sheet dragged down past 25% of travel', () => {
    expect(shouldOpen({ drag: 101, velocity: slow, travel: TRAVEL, wasOpen: true })).toBe(false)
  })

  it('snaps an open sheet back when dragged down less than 25% or up', () => {
    expect(shouldOpen({ drag: 100, velocity: slow, travel: TRAVEL, wasOpen: true })).toBe(true)
    expect(shouldOpen({ drag: -60, velocity: -slow, travel: TRAVEL, wasOpen: true })).toBe(true)
  })

  it('opens on an upward flick and closes on a downward flick, whatever the distance', () => {
    expect(shouldOpen({ drag: -10, velocity: -0.6, travel: TRAVEL, wasOpen: false })).toBe(true)
    expect(shouldOpen({ drag: 10, velocity: 0.6, travel: TRAVEL, wasOpen: true })).toBe(false)
  })

  it('treats exactly the flick speed as a flick', () => {
    expect(shouldOpen({ drag: 0, velocity: -0.5, travel: TRAVEL, wasOpen: false })).toBe(true)
    expect(shouldOpen({ drag: 0, velocity: 0.5, travel: TRAVEL, wasOpen: true })).toBe(false)
  })

  it('keeps the state when there is nothing to travel', () => {
    expect(shouldOpen({ drag: -50, velocity: -1, travel: 0, wasOpen: false })).toBe(false)
    expect(shouldOpen({ drag: 50, velocity: 1, travel: 0, wasOpen: true })).toBe(true)
  })
})
