/** From this zoom every hotspot is drawn as its own dot; below it the map shows grid bubbles. */
export const SINGLE_DOT_ZOOM = 9

/** Bubble radius in px: grows with √count, clamped to 10–32. */
export function bubbleRadius(count: number): number {
  return Math.min(32, Math.max(10, 8 + Math.sqrt(Math.max(0, count))))
}

/** Bubble text: 999, 1.2k, 12k (the short form supercluster used to give). */
export function abbreviateCount(count: number): string {
  if (count >= 10000) return `${Math.round(count / 1000)}k`
  if (count >= 1000) return `${Math.round(count / 100) / 10}k`
  return String(count)
}
