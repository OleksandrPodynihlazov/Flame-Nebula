import { describe, expect, it } from 'vitest'
import { placeCard } from './placement'

const card = { width: 200, height: 100 }
const vp = { width: 1000, height: 800 }

describe('placeCard', () => {
  it('puts the card on the preferred side, centred on the target', () => {
    const target = { left: 400, top: 300, width: 100, height: 40 }
    expect(placeCard(target, card, vp, ['bottom'])).toEqual({ left: 350, top: 352 })
    expect(placeCard(target, card, vp, ['right'])).toEqual({ left: 512, top: 270 })
  })

  it('falls through to the next side when the first does not fit', () => {
    const target = { left: 800, top: 300, width: 190, height: 100 }
    // right: 1002 > 988 → left side instead
    expect(placeCard(target, card, vp, ['right', 'left']).left).toBe(588)
  })

  it('clamps inside the viewport at phone width', () => {
    const phone = { width: 390, height: 844 }
    const wide = { width: 266, height: 150 }
    const handle = { left: 0, top: 760, width: 390, height: 44 }
    const { left, top } = placeCard(handle, wide, phone, ['left', 'top'])
    expect(left).toBeGreaterThanOrEqual(12)
    expect(left + wide.width).toBeLessThanOrEqual(phone.width - 12)
    expect(top + wide.height).toBeLessThanOrEqual(handle.top)
  })

  it('slides along the target edge instead of rejecting a side near the screen edge', () => {
    const phone = { width: 390, height: 844 }
    const button = { left: 334, top: 68, width: 44, height: 44 }
    const { left, top } = placeCard(button, { width: 266, height: 120 }, phone, ['bottom', 'left'])
    expect(top).toBe(button.top + button.height + 12)
    expect(left + 266).toBeLessThanOrEqual(phone.width - 12)
  })

  it('stays on screen even when nothing fits', () => {
    const tiny = { width: 220, height: 120 }
    const { left, top } = placeCard({ left: 0, top: 0, width: 220, height: 120 }, card, tiny, ['top'])
    expect(left).toBeGreaterThanOrEqual(12)
    expect(top).toBeGreaterThanOrEqual(12)
  })
})
