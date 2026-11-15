import { describe, expect, it, vi } from 'vitest'
import { HINTS_STORAGE_KEY, HINT_STEPS, browserStorage, hintsSuppressed, initialStep, markDismissed, nextStep, wasDismissed } from './hints'

const throwing = () => {
  throw new DOMException('blocked', 'SecurityError')
}

describe('nextStep', () => {
  it('walks through every step and then finishes', () => {
    expect(HINT_STEPS).toHaveLength(3)
    expect(nextStep(0)).toBe(1)
    expect(nextStep(1)).toBe(2)
    expect(nextStep(2)).toBeNull()
  })
})

describe('hintsSuppressed', () => {
  it('hides for automated browsers', () => expect(hintsSuppressed(true, '')).toBe(true))
  it('hides for ?nohints, with or without other params', () => {
    expect(hintsSuppressed(false, '?nohints')).toBe(true)
    expect(hintsSuppressed(false, '?year=2008&nohints=1')).toBe(true)
  })
  it('shows otherwise', () => {
    expect(hintsSuppressed(false, '')).toBe(false)
    expect(hintsSuppressed(false, '?hints')).toBe(false)
  })
})

describe('persistence guard', () => {
  it('stores and reads the dismissal under the v1 key', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
    expect(wasDismissed(storage)).toBe(false)
    expect(markDismissed(storage)).toBe(true)
    expect(data.get(HINTS_STORAGE_KEY)).toBe('1')
    expect(wasDismissed(storage)).toBe(true)
  })
  it('treats a throwing storage as not seen and reports the failed write', () => {
    expect(wasDismissed({ getItem: throwing })).toBe(false)
    expect(markDismissed({ setItem: throwing })).toBe(false)
  })
  it('handles missing storage', () => {
    expect(wasDismissed(null)).toBe(false)
    expect(markDismissed(null)).toBe(false)
  })
  it('browserStorage is null when reading localStorage throws', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        return throwing()
      },
    })
    expect(browserStorage()).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('initialStep', () => {
  const never = { getItem: () => null }
  it('opens at step 0 for a first-time visitor', () => expect(initialStep({ webdriver: false, search: '', storage: never })).toBe(0))
  it('stays closed once dismissed', () => expect(initialStep({ webdriver: false, search: '', storage: { getItem: () => '1' } })).toBeNull())
  it('stays closed for webdriver and ?nohints', () => {
    expect(initialStep({ webdriver: true, search: '', storage: never })).toBeNull()
    expect(initialStep({ webdriver: false, search: '?nohints', storage: never })).toBeNull()
  })
  it('opens when storage throws (just does not persist)', () => {
    expect(initialStep({ webdriver: false, search: '', storage: { getItem: throwing } })).toBe(0)
  })
})
