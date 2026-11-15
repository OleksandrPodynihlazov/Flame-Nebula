export type Side = 'top' | 'bottom' | 'left' | 'right'

interface Size {
  width: number
  height: number
}

export interface Box extends Size {
  left: number
  top: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

/**
 * Top-left corner for a card next to `target`, kept inside the viewport.
 * Tries `sides` in order and takes the first where the card fits beside the target without overlapping it;
 * when none fits, the first side is used and the card is clamped on screen.
 */
export function placeCard(
  target: Box,
  card: Size,
  viewport: Size,
  sides: readonly Side[],
  { gap = 12, margin = 12 }: { gap?: number; margin?: number } = {},
): { left: number; top: number } {
  const minLeft = margin
  const minTop = margin
  const maxLeft = Math.max(minLeft, viewport.width - margin - card.width)
  const maxTop = Math.max(minTop, viewport.height - margin - card.height)
  const centeredLeft = target.left + target.width / 2 - card.width / 2
  const centeredTop = target.top + target.height / 2 - card.height / 2

  const raw: Record<Side, { left: number; top: number }> = {
    top: { left: centeredLeft, top: target.top - gap - card.height },
    bottom: { left: centeredLeft, top: target.top + target.height + gap },
    left: { left: target.left - gap - card.width, top: centeredTop },
    right: { left: target.left + target.width + gap, top: centeredTop },
  }
  // Only the axis facing the target decides whether a side fits; across it the card just slides to stay on screen.
  const inRange = (side: Side) => {
    const { left, top } = raw[side]
    return side === 'left' || side === 'right' ? left >= minLeft && left <= maxLeft : top >= minTop && top <= maxTop
  }
  const onScreen = (side: Side) => ({ left: clamp(raw[side].left, minLeft, maxLeft), top: clamp(raw[side].top, minTop, maxTop) })
  const side = sides.find((s) => inRange(s) && !overlaps(target, card, onScreen(s))) ?? sides[0] ?? 'bottom'
  return onScreen(side)
}

function overlaps(target: Box, card: Size, at: { left: number; top: number }): boolean {
  return at.left < target.left + target.width && at.left + card.width > target.left && at.top < target.top + target.height && at.top + card.height > target.top
}
