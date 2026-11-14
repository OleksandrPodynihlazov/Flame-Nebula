/** From this zoom every hotspot is drawn as its own dot; below it the map shows grid bubbles. */
export const SINGLE_DOT_ZOOM = 9

/** Bubble radius in px: grows with √count, clamped to 10–32, and to `max` when that is smaller (never under 10). */
export function bubbleRadius(count: number, max = 32): number {
  return Math.max(10, Math.min(32, max, 8 + Math.sqrt(Math.max(0, count))))
}

/** Bubble text: 999, 1.2k, 12k (the short form supercluster used to give). */
export function abbreviateCount(count: number): string {
  if (count >= 10000) return `${Math.round(count / 1000)}k`
  if (count >= 1000) return `${Math.round(count / 100) / 10}k`
  return String(count)
}
