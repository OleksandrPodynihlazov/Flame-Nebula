import type { Region } from '../types/api'

/** The API searches all loaded countries (Europe); the app is about Italy, so its matches go first. Order is otherwise kept. */
export function italyFirst(regions: readonly Region[]): Region[] {
  return [...regions.filter((r) => r.country === 'ITA'), ...regions.filter((r) => r.country !== 'ITA')]
}
