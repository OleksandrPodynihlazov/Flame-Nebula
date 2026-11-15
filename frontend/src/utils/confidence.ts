import type { ConfidenceClass, HotspotProperties, NonFireKind } from '../types/api'

/** Fire-confidence tiers a dot can be drawn in (docs/contracts.md [1b]); `unscored` = the API sent null. */
export type ConfidenceTier = 'confirmed' | 'likely' | 'unverified' | 'doubtful' | 'unscored' | 'non_fire'

/** Mirrors --flare (ring on confirmed dots) and --muted-foreground (non-fire dots). */
export const FLARE = '#ffc24b'
export const MUTED = '#8696a8'

export interface DotStyle {
  /** Fill (or stroke, when hollow) opacity, 0–1. */
  opacity: number
  /** Added to the sensor's dot radius, in px. */
  radiusDelta: number
  /** Thin light ring around the dot. */
  ring: boolean
  /** Outline only, no fill. */
  hollow: boolean
  /** Grey instead of the FIRMS type colour. */
  grey: boolean
  /** Draw order: lower is drawn first (underneath). */
  rank: number
}

/** The one place that says how each tier looks; the map and the legend samples both read it. */
export const DOT_STYLES: Record<ConfidenceTier, DotStyle> = {
  non_fire: { opacity: 0.6, radiusDelta: 0, ring: false, hollow: false, grey: true, rank: 0 },
  doubtful: { opacity: 0.3, radiusDelta: -1, ring: false, hollow: false, grey: false, rank: 1 },
  unverified: { opacity: 0.55, radiusDelta: 0, ring: false, hollow: false, grey: false, rank: 2 },
  unscored: { opacity: 1, radiusDelta: 0, ring: false, hollow: true, grey: false, rank: 3 },
  likely: { opacity: 1, radiusDelta: 0, ring: false, hollow: false, grey: false, rank: 4 },
  confirmed: { opacity: 1, radiusDelta: 1, ring: true, hollow: false, grey: false, rank: 5 },
}

const MIN_RADIUS = 1.5

/** Class from a 0–100 score with the contract thresholds: confirmed ≥ 80, likely 60–79, unverified 40–59, doubtful < 40. */
export function classFromScore(score: number): 'confirmed' | 'likely' | 'unverified' | 'doubtful' {
  if (score >= 80) return 'confirmed'
  if (score >= 60) return 'likely'
  if (score >= 40) return 'unverified'
  return 'doubtful'
}

export function isNonFire(c: ConfidenceClass | null | undefined): c is `non_fire:${NonFireKind}` {
  return typeof c === 'string' && c.startsWith('non_fire:')
}

export function confidenceTier(p: Pick<HotspotProperties, 'confidence_class'>): ConfidenceTier {
  const c = p.confidence_class
  if (c === null || c === undefined) return 'unscored'
  return isNonFire(c) ? 'non_fire' : c
}

export function dotRadius(base: number, tier: ConfidenceTier): number {
  return Math.max(MIN_RADIUS, base + DOT_STYLES[tier].radiusDelta)
}

/** Draw order for single dots: low tiers first, confirmed last (on top); within a tier the bigger dot first. */
export function orderDots<T extends { r: number }>(dots: readonly T[], tierOf: (dot: T) => ConfidenceTier): T[] {
  return [...dots].sort((a, b) => DOT_STYLES[tierOf(a)].rank - DOT_STYLES[tierOf(b)].rank || b.r - a.r)
}

export const TIER_LABELS: Record<Exclude<ConfidenceTier, 'non_fire'>, string> = {
  confirmed: 'Confirmed',
  likely: 'Likely',
  unverified: 'Unverified',
  doubtful: 'Doubtful',
  unscored: 'No score',
}

const NON_FIRE_NOUN: Record<NonFireKind, string> = {
  static: 'industry',
  volcano: 'volcano',
  offshore: 'offshore',
  urban: 'city',
}

export type ConfidenceSummary =
  | { kind: 'scored'; label: string; score: number | null }
  | { kind: 'non_fire'; noun: string }
  | { kind: 'unscored' }

/** What the popup's Confidence row says. */
export function confidenceSummary(p: Pick<HotspotProperties, 'confidence_class' | 'confidence_score'>): ConfidenceSummary {
  const c = p.confidence_class
  if (isNonFire(c)) return { kind: 'non_fire', noun: NON_FIRE_NOUN[c.slice('non_fire:'.length) as NonFireKind] ?? 'other' }
  if (c === null || c === undefined) return { kind: 'unscored' }
  return { kind: 'scored', label: TIER_LABELS[c], score: p.confidence_score ?? null }
}

const SATELLITES: Record<string, string> = { snpp: 'S-NPP', noaa20: 'NOAA-20', noaa21: 'NOAA-21', terra: 'Terra', aqua: 'Aqua' }
const KNOWN_SOURCES: Record<string, string> = {
  static: 'Known industrial site',
  volcano: 'Volcano',
  offshore: 'Offshore platform',
  urban: 'City area',
}
const MAX_REASONS = 3

/** One `reasons` token as a short phrase; null for tokens we have no wording for. */
function phrase(token: string): string | null {
  const [level, kind, ...rest] = token.trim().split(':')
  if (level === 'L1' && kind && rest.length === 0) return KNOWN_SOURCES[kind] ?? null
  if (level === 'L3' && kind === 'xsensor' && rest[0]) return `Also seen by ${SATELLITES[rest[0].toLowerCase()] ?? rest[0].toUpperCase()}`
  if (level === 'L6' && kind === 'effis') {
    const ha = /^(\d+(?:\.\d+)?)ha$/.exec(rest[1] ?? '')
    return ha ? `Matches EFFIS burned area (${ha[1]} ha)` : 'Matches EFFIS burned area'
  }
  return null
}

/** `L1:static;L3:xsensor:snpp` → plain phrases, unknown tokens dropped, repeats merged, at most three. */
export function reasonPhrases(reasons: string | null | undefined): string[] {
  if (!reasons) return []
  const out: string[] = []
  for (const token of reasons.split(';')) {
    const text = phrase(token)
    if (text !== null && !out.includes(text)) out.push(text)
  }
  return out.slice(0, MAX_REASONS)
}

/** The satellite's own detection confidence in one line for both sensors: MODIS gives a percentage, VIIRS only a
 * class (low / nominal / high), so the class is shown when there is no number. Not the fire-confidence score. */
export function sensorConfidence(p: Pick<HotspotProperties, 'confidence' | 'confidence_level'>): string {
  if (p.confidence !== null) return `${p.confidence}%`
  if (p.confidence_level) return p.confidence_level[0].toUpperCase() + p.confidence_level.slice(1)
  return '—'
}
