/** Drag distance (px) below which a pointer gesture is still a tap. */
export const TAP_SLOP_PX = 6
/** Fraction of the sheet's travel a drag must cover to change its state. */
export const SNAP_FRACTION = 0.25
/** Flick speed (px/ms) that changes the state regardless of distance. */
export const FLICK_VELOCITY = 0.5

/** Sheet translateY in px: 0 fully open, `travel` peeking. `drag` is the finger's vertical offset since pointerdown (down is positive). */
export function sheetOffset(open: boolean, travel: number, drag: number): number {
  return Math.min(Math.max((open ? 0 : travel) + drag, 0), travel)
}

/**
 * Whether the sheet should be open once the finger lifts.
 * `drag` is the vertical distance dragged and `velocity` the release speed in px/ms (both down-positive);
 * a flick wins over distance, otherwise the drag must cover `SNAP_FRACTION` of `travel` in the opposite direction of the current state.
 */
export function shouldOpen({ drag, velocity, travel, wasOpen }: { drag: number; velocity: number; travel: number; wasOpen: boolean }): boolean {
  if (travel <= 0) return wasOpen
  if (velocity <= -FLICK_VELOCITY) return true
  if (velocity >= FLICK_VELOCITY) return false
  return wasOpen ? drag <= SNAP_FRACTION * travel : drag < -SNAP_FRACTION * travel
}
