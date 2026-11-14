import Supercluster from 'supercluster'
import type { FireType, HotspotFeature, HotspotProperties } from '../types/api'

/** From this zoom every hotspot is drawn as its own dot. */
export const SINGLE_DOT_ZOOM = 9

/** Hotspot count per `type` inside a cluster. */
export type TypeCounts = Record<`t${FireType}`, number>

export type HotspotIndex = Supercluster<HotspotProperties, TypeCounts>

export function typeCounts(p: Pick<HotspotProperties, 'type'>): TypeCounts {
  return { t0: p.type === 0 ? 1 : 0, t1: p.type === 1 ? 1 : 0, t2: p.type === 2 ? 1 : 0, t3: p.type === 3 ? 1 : 0 }
}

/** Supercluster `reduce`: adds `next` into `acc` in place (supercluster owns `acc`). */
export function mergeTypeCounts(acc: TypeCounts, next: Readonly<TypeCounts>): void {
  acc.t0 += next.t0
  acc.t1 += next.t1
  acc.t2 += next.t2
  acc.t3 += next.t3
}

/** Most common type; a tie goes to the lower type number (vegetation first). */
export function majorityType(c: Readonly<TypeCounts>): FireType {
  let best: FireType = 0
  for (const t of [1, 2, 3] as const) if (c[`t${t}`] > c[`t${best}`]) best = t
  return best
}

/** Bubble radius in px: grows with √count, clamped to 10–32. */
export function bubbleRadius(count: number): number {
  return Math.min(32, Math.max(10, 8 + Math.sqrt(Math.max(0, count))))
}

export function createHotspotIndex(features: HotspotFeature[]): HotspotIndex {
  return new Supercluster<HotspotProperties, TypeCounts>({
    radius: 60,
    maxZoom: SINGLE_DOT_ZOOM - 1,
    map: typeCounts,
    reduce: mergeTypeCounts,
  }).load(features)
}
