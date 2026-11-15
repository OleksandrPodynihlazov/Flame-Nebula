import { RAMP } from './calendar'

/** From this zoom every hotspot is drawn as its own dot; below it the map shows grid bubbles. */
export const SINGLE_DOT_ZOOM = 9

/** Smallest and largest bubble radius in px. The cell cap below wins over both when a cell is small. */
export const BUBBLE_MIN_R = 5
export const BUBBLE_MAX_R = 28
/** Empty px kept between two neighbouring bubbles at their largest. */
export const BUBBLE_GAP = 2

/** On-screen width in px of a grid cell of `cellDeg` degrees at `zoom` (Web Mercator, 256 px tiles). */
export function cellPixelSize(cellDeg: number, zoom: number): number {
  return ((cellDeg / 360) * 256) * 2 ** zoom
}

/**
 * Largest radius a bubble may have so it stays inside its cell: bubbles sit at cell centres, which are at least
 * one cell width apart (Mercator only stretches cells vertically), so two max-size neighbours keep BUBBLE_GAP px between them.
 */
export function bubbleCap(cellPx: number): number {
  return Math.max(1, Math.min(BUBBLE_MAX_R, cellPx / 2 - BUBBLE_GAP / 2))
}

/** Share of the view's biggest cell, 0..1, on a √ scale (area ~ count). */
export function bubbleShare(count: number, maxCount: number): number {
  if (maxCount <= 0) return 0
  return Math.sqrt(Math.min(1, Math.max(0, count) / maxCount))
}

/** Bubble radius in px: grows with √count relative to the biggest cell in view, never above `bubbleCap(cellPx)`. */
export function bubbleRadius(count: number, maxCount: number, cellPx: number): number {
  const cap = bubbleCap(cellPx)
  const min = Math.min(BUBBLE_MIN_R, cap)
  return min + (cap - min) * bubbleShare(count, maxCount)
}

/** Bubble text: 999, 1.2k, 12k (the short form supercluster used to give). */
export function abbreviateCount(count: number): string {
  if (count >= 10000) return `${Math.round(count / 1000)}k`
  if (count >= 1000) return `${Math.round(count / 100) / 10}k`
  return String(count)
}

const LABEL_FONTS = [12, 11, 10, 9] as const
/** Glyph width of the monospace label font, in em. */
const MONO_EM = 0.6
/** Share of the bubble diameter the text may use (a chord through the centre; the corners of the text box are inside the circle). */
const LABEL_FILL = 0.88

export interface BubbleLabel {
  text: string
  fontPx: number
}

/** The largest font at which the count fits inside a bubble of radius `r`; null when none does (the bubble is drawn bare). */
export function bubbleLabel(count: number, r: number): BubbleLabel | null {
  const text = abbreviateCount(count)
  for (const fontPx of LABEL_FONTS) {
    if (text.length * fontPx * MONO_EM <= 2 * r * LABEL_FILL && fontPx <= 2 * r * LABEL_FILL) return { text, fontPx }
  }
  return null
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
