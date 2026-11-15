import { RAMP } from './calendar'

/** From this zoom every hotspot is drawn as its own dot; below it the map shows grid bubbles. */
export const SINGLE_DOT_ZOOM = 9

/** Share of the view's biggest cell, 0..1, on a √ scale (area ~ count). Drives the bubble colour only. */
export function bubbleShare(count: number, maxCount: number): number {
  if (maxCount <= 0) return 0
  return Math.sqrt(Math.min(1, Math.max(0, count) / maxCount))
}

/** Smallest bubble radius in px that still holds a readable count: bigger on touch screens, where fingers and thumbs-size text rule. */
export function minBubbleRadius(mobile: boolean): number {
  return mobile ? 12 : 11
}

/**
 * Bubble radius in px: grows with √count, clamped to 32 and to `max` when that is smaller, but never under `floor`.
 * The floor wins over `max`: neighbours may overlap, bubbles stay at their real positions.
 */
export function bubbleRadius(count: number, max = 32, floor = 10): number {
  return Math.max(floor, Math.min(32, max, 8 + Math.sqrt(Math.max(0, count))))
}

/** Glyph advance of the monospace label font, in em. */
const MONO_GLYPH_EM = 0.6
/** Free space kept between the text and the circle edge, per side. */
const LABEL_PADDING = 2

/** Label font size in px: 12 for 1–2 chars, 11 for 3, 10 for 4+, shrunk (down to 9) until the text fits inside a circle of radius `r`. */
export function labelFontSize(text: string, r: number): number {
  const widest = text.length <= 2 ? 12 : text.length === 3 ? 11 : 10
  const room = 2 * r - 2 * LABEL_PADDING
  for (let size = widest; size > 9; size--) {
    if (text.length * MONO_GLYPH_EM * size <= room) return size
  }
  return 9
}

/** Biggest first, so smaller bubbles (and their numbers) are painted on top. Returns a new array. */
export function drawOrder<T extends { r: number }>(shapes: readonly T[]): T[] {
  return [...shapes].sort((a, b) => b.r - a.r)
}

/** The topmost shape (last drawn) whose circle, widened by `slop`, contains the point; undefined when none does. */
export function topmostAt<T extends { x: number; y: number; r: number }>(shapes: readonly T[], x: number, y: number, slop: number): T | undefined {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i]
    if ((s.x - x) ** 2 + (s.y - y) ** 2 <= (s.r + slop) ** 2) return s
  }
  return undefined
}

/** Bubble text: 999, 1.2k, 12k (the short form supercluster used to give). */
export function abbreviateCount(count: number): string {
  if (count >= 10000) return `${Math.round(count / 1000)}k`
  if (count >= 1000) return `${Math.round(count / 100) / 10}k`
  return String(count)
}

const HEAT_STOPS = [RAMP[4], RAMP[5], RAMP[6]].map(hexToRgb)
/** Number of distinct bubble fills (and swatches in the legend). */
export const BUBBLE_HEAT_STEPS = 5

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Bubble fill for a share 0..1: the heat scale's heat-4 → heat-6, in BUBBLE_HEAT_STEPS steps. All three are light enough for dark text. */
export function bubbleHeatColor(share: number): string {
  const step = Math.min(BUBBLE_HEAT_STEPS - 1, Math.floor(Math.min(1, Math.max(0, share)) * BUBBLE_HEAT_STEPS))
  const x = (step / (BUBBLE_HEAT_STEPS - 1)) * (HEAT_STOPS.length - 1)
  const i = Math.min(HEAT_STOPS.length - 2, Math.floor(x))
  const t = x - i
  const [a, b] = [HEAT_STOPS[i], HEAT_STOPS[i + 1]]
  const hex = (k: number) => Math.round(a[k] + (b[k] - a[k]) * t).toString(16).padStart(2, '0')
  return `#${hex(0)}${hex(1)}${hex(2)}`
}
