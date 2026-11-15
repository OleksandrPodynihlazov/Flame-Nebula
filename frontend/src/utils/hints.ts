/** First-visit guide: step data, targets and the "seen it" flag. Pure, so the flow is testable without a DOM. */

export const HINTS_STORAGE_KEY = 'fn.hints.v1'

export type HintId = 'draw' | 'calendar' | 'compare'

export interface HintStep {
  id: HintId
  title: string
  body: string
  /** Where the card prefers to sit relative to its target, in order; the first that fits wins. */
  sides: readonly ('top' | 'bottom' | 'left' | 'right')[]
  /** CSS selectors of the element to point at, in priority order, per layout. The first visible one is used. */
  targets: { desktop: readonly string[]; mobile: readonly string[] }
}

export const HINT_STEPS: readonly HintStep[] = [
  {
    id: 'draw',
    title: 'Draw an area',
    body: 'Draw a rectangle, polygon or circle to see hotspots inside it.',
    sides: ['right', 'left', 'bottom', 'top'],
    targets: { desktop: ['.leaflet-pm-toolbar'], mobile: ['.leaflet-pm-toolbar'] },
  },
  {
    id: 'calendar',
    title: 'Pick a month or day',
    body: 'Select a month or a day to filter the map.',
    sides: ['left', 'top', 'bottom', 'right'],
    targets: {
      desktop: ['section[aria-label="Burning activity calendar"]', 'aside[aria-label="Statistics"]', '[data-testid="panel-toggle"]'],
      mobile: ['button[aria-label="Show calendar"]', 'button[aria-label="Hide calendar"]'],
    },
  },
  {
    id: 'compare',
    title: 'Compare two years',
    body: 'Compare shows two years side by side with a swipe divider.',
    sides: ['bottom', 'left', 'top', 'right'],
    targets: { desktop: ['[data-testid="compare-toggle"]'], mobile: ['button[aria-label="Filters"]'] },
  },
]

/** Index of the step after `index`, or null when `index` was the last one (the guide is done). */
export function nextStep(index: number): number | null {
  return index + 1 < HINT_STEPS.length ? index + 1 : null
}

/** Automated browsers and `?nohints` never see the guide. */
export function hintsSuppressed(webdriver: boolean, search: string): boolean {
  return webdriver || new URLSearchParams(search).has('nohints')
}

type ReadStorage = Pick<Storage, 'getItem'>
type WriteStorage = Pick<Storage, 'setItem'>

/** True when the guide was finished or skipped before. A storage that throws counts as "not seen". */
export function wasDismissed(storage: ReadStorage | null): boolean {
  if (!storage) return false
  try {
    return storage.getItem(HINTS_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Remembers the dismissal. False when storage is missing or throws: the guide still closes, it just returns next visit. */
export function markDismissed(storage: WriteStorage | null): boolean {
  if (!storage) return false
  try {
    storage.setItem(HINTS_STORAGE_KEY, '1')
    return true
  } catch {
    return false
  }
}

/** `window.localStorage`, or null when even reading the property throws (blocked site data). */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Step to open with on page load: the first one, or null when the guide must stay hidden. */
export function initialStep(env: { webdriver: boolean; search: string; storage: ReadStorage | null }): number | null {
  if (hintsSuppressed(env.webdriver, env.search)) return null
  return wasDismissed(env.storage) ? null : 0
}
