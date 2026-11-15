import { describe, expect, it } from 'vitest'
import type { ConfidenceClass } from '../types/api'
import {
  DOT_STYLES,
  classFromScore,
  confidenceSummary,
  confidenceTier,
  dotRadius,
  orderDots,
  reasonPhrases,
  type ConfidenceTier,
} from './confidence'

const tier = (confidence_class: ConfidenceClass | null) => confidenceTier({ confidence_class })

describe('confidenceTier', () => {
  it('maps classes, null as unscored and any non_fire:* as non_fire', () => {
    expect(tier('confirmed')).toBe('confirmed')
    expect(tier('doubtful')).toBe('doubtful')
    expect(tier(null)).toBe('unscored')
    expect(tier('non_fire:volcano')).toBe('non_fire')
    expect(tier('non_fire:urban')).toBe('non_fire')
  })
})

describe('DOT_STYLES', () => {
  it('encodes confidence in opacity, size and ring, as designed', () => {
    expect(DOT_STYLES.confirmed).toMatchObject({ opacity: 1, radiusDelta: 1, ring: true, hollow: false, grey: false })
    expect(DOT_STYLES.likely).toMatchObject({ opacity: 1, radiusDelta: 0, ring: false, hollow: false })
    expect(DOT_STYLES.unverified).toMatchObject({ opacity: 0.55, radiusDelta: 0 })
    expect(DOT_STYLES.doubtful).toMatchObject({ opacity: 0.3, radiusDelta: -1 })
    expect(DOT_STYLES.unscored).toMatchObject({ hollow: true, grey: false })
    expect(DOT_STYLES.non_fire).toMatchObject({ opacity: 0.6, grey: true, hollow: false })
  })

  it('grows and shrinks the sensor radius by a pixel', () => {
    expect(dotRadius(6, 'confirmed')).toBe(7)
    expect(dotRadius(6, 'likely')).toBe(6)
    expect(dotRadius(6, 'doubtful')).toBe(5)
    expect(dotRadius(1, 'doubtful')).toBe(1.5)
  })
})

describe('orderDots', () => {
  const all: ConfidenceTier[] = ['likely', 'confirmed', 'non_fire', 'unscored', 'doubtful', 'unverified']

  it('draws confirmed last (on top) and non-fire first', () => {
    const ordered = orderDots(all.map((t) => ({ t, r: 6 })), (d) => d.t).map((d) => d.t)
    expect(ordered).toEqual(['non_fire', 'doubtful', 'unverified', 'unscored', 'likely', 'confirmed'])
  })

  it('puts the bigger dot first within a tier and does not mutate the input', () => {
    const input = [{ t: 'likely' as const, r: 3 }, { t: 'likely' as const, r: 6 }]
    expect(orderDots(input, (d) => d.t).map((d) => d.r)).toEqual([6, 3])
    expect(input.map((d) => d.r)).toEqual([3, 6])
  })
})

describe('classFromScore', () => {
  it('uses the contract thresholds', () => {
    expect([100, 80, 79, 60, 59, 40, 39, 0].map(classFromScore)).toEqual([
      'confirmed', 'confirmed', 'likely', 'likely', 'unverified', 'unverified', 'doubtful', 'doubtful',
    ])
  })
})

describe('confidenceSummary', () => {
  it('names class and score', () => {
    expect(confidenceSummary({ confidence_class: 'likely', confidence_score: 72 })).toEqual({ kind: 'scored', label: 'Likely', score: 72 })
  })

  it('says unscored for null', () => {
    expect(confidenceSummary({ confidence_class: null, confidence_score: null })).toEqual({ kind: 'unscored' })
  })

  it('names the non-fire kind in plain words', () => {
    const noun = (c: ConfidenceClass) => (confidenceSummary({ confidence_class: c, confidence_score: 20 }) as { noun: string }).noun
    expect([noun('non_fire:static'), noun('non_fire:volcano'), noun('non_fire:offshore'), noun('non_fire:urban')]).toEqual([
      'industry', 'volcano', 'offshore', 'city',
    ])
  })
})

describe('reasonPhrases', () => {
  it('translates the known tokens', () => {
    expect(reasonPhrases('L1:static')).toEqual(['Known industrial site'])
    expect(reasonPhrases('L1:volcano')).toEqual(['Volcano'])
    expect(reasonPhrases('L1:offshore')).toEqual(['Offshore platform'])
    expect(reasonPhrases('L1:urban')).toEqual(['City area'])
    expect(reasonPhrases('L3:xsensor:snpp')).toEqual(['Also seen by S-NPP'])
    expect(reasonPhrases('L3:xsensor:noaa20')).toEqual(['Also seen by NOAA-20'])
    expect(reasonPhrases('L3:xsensor:foo')).toEqual(['Also seen by FOO'])
    expect(reasonPhrases('L6:effis:123:450ha')).toEqual(['Matches EFFIS burned area (450 ha)'])
    expect(reasonPhrases('L6:effis:123')).toEqual(['Matches EFFIS burned area'])
  })

  it('omits unknown tokens and keeps the order of the rest', () => {
    expect(reasonPhrases('L5:burnscar;L3:xsensor:snpp;L9:what;L6:effis:1:20ha;')).toEqual([
      'Also seen by S-NPP',
      'Matches EFFIS burned area (20 ha)',
    ])
    expect(reasonPhrases('L1:lava')).toEqual([])
  })

  it('is empty for null and blank, merges repeats and stops at three', () => {
    expect(reasonPhrases(null)).toEqual([])
    expect(reasonPhrases('')).toEqual([])
    expect(reasonPhrases('L1:static;L1:static')).toEqual(['Known industrial site'])
    expect(reasonPhrases('L1:static;L1:volcano;L1:offshore;L1:urban')).toHaveLength(3)
  })
})
