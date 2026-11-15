import { describe, expect, it } from 'vitest'
import { mockHotspots, mockSelectionSummary } from '../api/mocks'
import type { Area, DayNight, FireType, HotspotFeature, Month } from '../types/api'
import { areaKm2, selectionSummary, summarizeFeatures, type SelectionSummary } from './selectionSummary'

// Parity: the card's numbers from the summary endpoint's shape must equal what the browser computed
// from every dot before (/api/hotspots + selectionSummary(area, features)). `legacySummary` is that
// old function, copied unchanged; the API applies the same rules in SQL (api/lib/summary.js, tested
// against real dots in e2e/tests/contract-api.spec.js).

const isMonth = (n: number): n is Month => Number.isInteger(n) && n >= 0 && n <= 11

function legacySummary(area: Area, features: readonly HotspotFeature[]): SelectionSummary {
  const km2 = areaKm2(area)
  const byType: Record<FireType, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
  const byDaynight: Record<DayNight, number> = { D: 0, N: 0 }
  const months = new Array<number>(12).fill(0)
  const days = new Map<string, number>()
  let frpSum = 0
  let frpCount = 0
  let frpMax = -Infinity
  let firstDate: string | null = null
  let lastDate: string | null = null

  for (const { properties: p } of features) {
    if (p.type !== null) byType[p.type]++
    byDaynight[p.daynight]++
    if (p.frp !== null) {
      frpSum += p.frp
      frpCount++
      frpMax = Math.max(frpMax, p.frp)
    }
    const m = Number(p.acq_date.slice(5, 7)) - 1
    if (isMonth(m)) months[m]++
    days.set(p.acq_date, (days.get(p.acq_date) ?? 0) + 1)
    if (firstDate === null || p.acq_date < firstDate) firstDate = p.acq_date
    if (lastDate === null || p.acq_date > lastDate) lastDate = p.acq_date
  }

  let peakMonth: SelectionSummary['peakMonth'] = null
  months.forEach((count, m) => {
    if (count > 0 && isMonth(m) && (peakMonth === null || count > peakMonth.count)) peakMonth = { month: m, count }
  })

  let peakDay: SelectionSummary['peakDay'] = null
  for (const date of [...days.keys()].sort()) {
    const count = days.get(date) ?? 0
    if (peakDay === null || count > peakDay.count) peakDay = { date, count }
  }

  return {
    areaKm2: km2,
    count: features.length,
    densityPer1000Km2: km2 > 0 ? (features.length / km2) * 1000 : null,
    byType,
    byDaynight,
    frp: frpCount > 0 ? { sum: frpSum, mean: frpSum / frpCount, max: frpMax } : null,
    peakMonth,
    peakDay,
    firstDate,
    lastDate,
  }
}

let nextId = 1
function dot(acq_date: string, opts: { frp?: number | null; type?: FireType | null; daynight?: DayNight } = {}): HotspotFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [12.5, 42.5] },
    properties: {
      id: nextId++,
      latitude: 42.5,
      longitude: 12.5,
      acq_date,
      acq_time: '1030',
      sensor: 'MODIS',
      satellite: 'Terra',
      daynight: opts.daynight ?? 'D',
      frp: opts.frp === undefined ? 10 : opts.frp,
      confidence: 80,
      confidence_level: 'high',
      confidence_score: null,
      confidence_class: null,
      confidence_reasons: null,
      worldview_url: null,
      type: opts.type === undefined ? 0 : opts.type,
    },
  }
}

const BOX: Area = { kind: 'polygon', points: [[12, 42], [13, 42], [13, 43], [12, 43]] }
const CIRCLE: Area = { kind: 'circle', lat: 37.6, lon: 14.2, radiusKm: 80 }

/** FRP sums may differ in the last bits by summation order (SQL vs JS); everything else is exact. */
function expectSame(actual: SelectionSummary, expected: SelectionSummary) {
  const { frp: a, ...restA } = actual
  const { frp: e, ...restE } = expected
  expect(restA).toEqual(restE)
  if (e === null) return expect(a).toBeNull()
  expect(a).not.toBeNull()
  expect(a!.sum).toBeCloseTo(e.sum, 6)
  expect(a!.mean).toBeCloseTo(e.mean, 9)
  expect(a!.max).toBe(e.max)
}

const viaEndpoint = (area: Area, features: HotspotFeature[]) => selectionSummary(area, summarizeFeatures(features))

describe('selection card parity: summary endpoint vs the old per-dot summary', () => {
  const cases: [string, HotspotFeature[]][] = [
    ['no dots', []],
    ['one dot', [dot('2008-06-15', { frp: 12.5, type: 2, daynight: 'N' })]],
    ['every FRP null', [dot('2008-07-01', { frp: null }), dot('2008-07-02', { frp: null })]],
    ['some FRP null', [dot('2008-07-01', { frp: null }), dot('2008-07-02', { frp: 30 }), dot('2008-07-03', { frp: 10 })]],
    ['NULL type (FIRMS API rows)', [dot('2008-07-01', { type: null }), dot('2008-07-02', { type: 3 })]],
    [
      'peak ties go to the earliest month and day, unsorted input',
      [
        dot('2008-08-21'),
        dot('2008-03-05'),
        dot('2008-08-20'),
        dot('2008-03-09'),
        dot('2008-08-20'),
        dot('2008-03-05'),
      ],
    ],
    ['later strictly larger peak wins', [dot('2008-01-05'), dot('2008-03-01'), dot('2008-03-02'), dot('2008-03-02')]],
  ]

  for (const [name, features] of cases) {
    it(name, () => {
      expectSame(viaEndpoint(BOX, features), legacySummary(BOX, features))
    })
  }

  it('the mock endpoint matches the old summary over the demo data (MODIS 2008, circle)', async () => {
    const q = { from: '2008-01-01', to: '2008-12-31', sensor: 'MODIS', lat: 37.6, lon: 14.2, radius_km: 80 }
    const { features } = await mockHotspots(q)
    expect(features.length).toBeGreaterThan(100)
    expectSame(selectionSummary(CIRCLE, await mockSelectionSummary(q)), legacySummary(CIRCLE, features))
  })

  it('the mock endpoint matches the old summary over the demo data (MODIS + VIIRS 2020, polygon, one month)', async () => {
    const area: Area = { kind: 'polygon', points: [[13, 36.5], [16, 36.5], [16, 38.5], [13, 38.5]] }
    const q = {
      from: '2020-08-01',
      to: '2020-08-31',
      sensor: 'MODIS,VIIRS',
      polygon: JSON.stringify(area.kind === 'polygon' ? area.points : []),
    }
    const { features } = await mockHotspots(q)
    expect(features.length).toBeGreaterThan(100)
    expectSame(selectionSummary(area, await mockSelectionSummary(q)), legacySummary(area, features))
  })
})
