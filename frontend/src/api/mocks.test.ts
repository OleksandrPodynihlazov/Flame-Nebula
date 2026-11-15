import { describe, expect, it } from 'vitest'
import type { Region } from '../types/api'
import { inGeometry } from '../utils/area'
import { HttpError, isTooManyInView } from './errors'
import { classFromScore, isNonFire } from '../utils/confidence'
import { checkBboxCap, matchRegions, mockConfidence, mockGrid, mockHotspots, mockRegion, mockSearchRegions, mockStats, parseMockFail } from './mocks'

const region = (id: number, name: string): Region => ({ id, name, level: 2, country: 'ITA', parent_id: null, path: '' })
const REGIONS = [region(1, 'Toscana'), region(2, 'Sicilia'), region(3, 'Basilicata'), region(4, 'Sardegna'), region(5, 'Trentino-Alto Adige')]

describe('matchRegions', () => {
  it('is case-insensitive', () => {
    expect(matchRegions(REGIONS, 'SIC').map((r) => r.name)).toEqual(['Sicilia'])
    expect(matchRegions(REGIONS, 'sIcIlIa')).toHaveLength(1)
  })

  it('is accent-insensitive', () => {
    expect(matchRegions([region(1, 'Südtirol')], 'sud').map((r) => r.name)).toEqual(['Südtirol'])
  })

  it('lists prefix matches before substring matches, each sorted by name', () => {
    expect(matchRegions(REGIONS, 'si').map((r) => r.name)).toEqual(['Sicilia', 'Basilicata'])
    expect(matchRegions([region(1, 'Zasi'), region(2, 'Basi'), region(3, 'Sib'), region(4, 'Sia')], 'si').map((r) => r.name)).toEqual(['Sia', 'Sib', 'Basi', 'Zasi'])
  })

  it('returns at most 20 matches', () => {
    const many = Array.from({ length: 30 }, (_, i) => region(i, `Zona ${i}`))
    expect(matchRegions(many, 'zona')).toHaveLength(20)
  })

  it('returns nothing when no name matches', () => {
    expect(matchRegions(REGIONS, 'zzz')).toEqual([])
  })

  it('rejects queries outside 2–100 characters, like the API (400)', () => {
    expect(() => matchRegions(REGIONS, 's')).toThrow(/2-100/)
    expect(() => matchRegions(REGIONS, 'x'.repeat(101))).toThrow(/2-100/)
    expect(matchRegions(REGIONS, 'x'.repeat(100))).toEqual([])
  })
})

describe('mock regions', () => {
  it('finds Sicilia by "Sic" with the API row shape', async () => {
    const [sicilia] = await mockSearchRegions('Sic')
    expect(sicilia).toMatchObject({ name: 'Sicilia', level: 2, country: 'ITA', path: 'Italy › Isole' })
  })

  it('serves a closed outline and throws like the API for an unknown id', async () => {
    const [{ id }] = await mockSearchRegions('Sic')
    const feature = await mockRegion(id)
    expect(feature).toMatchObject({ type: 'Feature', id, properties: { name: 'Sicilia' } })
    const [ring] = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates : []
    expect(ring[0]).toEqual(ring[ring.length - 1])
    expect(() => mockRegion(1)).toThrow('region not found: 1')
  })

  it('filters hotspots and stats by region id', async () => {
    const q = { from: '2008-01-01', to: '2008-12-31', sensor: 'MODIS' }
    const [{ id }] = await mockSearchRegions('Sic')
    const { geometry } = await mockRegion(id)
    const inRegion = await mockHotspots({ ...q, region: id })
    expect(inRegion.features.length).toBeGreaterThan(100)
    expect(inRegion.features.every((f) => inGeometry(f.geometry.coordinates, geometry))).toBe(true)
    expect((await mockStats({ ...q, region: id })).total).toBe(inRegion.features.length)
  })

  it('every demo region outline holds hotspots', async () => {
    const all = (await Promise.all(['Sicilia', 'Sardegna', 'Calabria', 'Puglia', 'Campania', 'Lazio', 'Toscana', 'Lombardia'].map(mockSearchRegions))).flat()
    expect(all).toHaveLength(8)
    for (const r of all) {
      const { features } = await mockHotspots({ from: '2008-01-01', to: '2008-12-31', sensor: 'MODIS', region: r.id })
      expect(features.length, r.name).toBeGreaterThan(0)
    }
  })
})

describe('parseMockFail', () => {
  it('splits a comma list, trims and lower-cases', () => {
    expect([...parseMockFail(' Stats, calendar ,')]).toEqual(['stats', 'calendar'])
  })

  it('is empty for unset or blank values', () => {
    expect(parseMockFail(undefined).size).toBe(0)
    expect(parseMockFail('').size).toBe(0)
    expect(parseMockFail(' , ').size).toBe(0)
  })
})

describe('checkBboxCap', () => {
  it('passes up to the cap and rejects above it with the contract 400', () => {
    expect(() => checkBboxCap(50, 50)).not.toThrow()
    let caught: unknown
    try {
      checkBboxCap(51, 50)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(HttpError)
    expect((caught as HttpError).status).toBe(400)
    expect((caught as HttpError).message).toBe('Too many hotspots in view (more than 50). Zoom in.')
    expect(isTooManyInView(caught)).toBe(true)
  })

  it('mockHotspots with a bbox answers while under the default cap of 20000', async () => {
    const { features } = await mockHotspots({ from: '2008-01-01', to: '2008-12-31', sensor: 'MODIS', bbox: '6,36,19,48' })
    expect(features.length).toBeGreaterThan(0)
    expect(features.length).toBeLessThanOrEqual(20000)
  })
})

describe('mock fire confidence', () => {
  const q = { from: '2008-01-01', to: '2008-12-31', sensor: 'MODIS' }

  it('is the same on every call', async () => {
    const a = (await mockHotspots({ ...q, include_non_fire: true })).features.map((f) => f.properties)
    const b = a.map((p) => mockConfidence(p))
    expect(b.map((c) => c.confidence_score)).toEqual(a.map((p) => p.confidence_score))
    expect(b.map((c) => c.confidence_reasons)).toEqual(a.map((p) => p.confidence_reasons))
  })

  it('classes follow the score thresholds', async () => {
    const { features } = await mockHotspots({ ...q, include_non_fire: true })
    for (const { properties: p } of features) {
      if (p.confidence_score === null || isNonFire(p.confidence_class)) continue
      expect(p.confidence_class, `score ${p.confidence_score}`).toBe(classFromScore(p.confidence_score))
    }
    expect([classFromScore(80), classFromScore(79), classFromScore(60), classFromScore(59), classFromScore(40), classFromScore(39)]).toEqual([
      'confirmed', 'likely', 'likely', 'unverified', 'unverified', 'doubtful',
    ])
  })

  it('has ~3 % non-fire, ~5 % unscored (all four fields null) and every class', async () => {
    const { features } = await mockHotspots({ ...q, include_non_fire: true })
    const n = features.length
    const nonFire = features.filter((f) => isNonFire(f.properties.confidence_class))
    const unscored = features.filter((f) => f.properties.confidence_class === null)
    expect(nonFire.length / n).toBeGreaterThan(0.015)
    expect(nonFire.length / n).toBeLessThan(0.06)
    expect(unscored.length / n).toBeGreaterThan(0.03)
    expect(unscored.length / n).toBeLessThan(0.08)
    for (const { properties: p } of unscored) {
      expect([p.confidence_score, p.confidence_class, p.confidence_reasons, p.worldview_url]).toEqual([null, null, null, null])
    }
    for (const c of ['confirmed', 'likely', 'unverified', 'doubtful']) {
      expect(features.some((f) => f.properties.confidence_class === c), c).toBe(true)
    }
    // Non-fire is mostly volcano / industry / offshore points.
    expect(nonFire.filter((f) => f.properties.type !== 0).length).toBeGreaterThan(nonFire.length * 0.8)
  })

  it('builds the Worldview link from date and a 0.4 degree box', () => {
    const urls = Array.from({ length: 40 }, (_, id) =>
      mockConfidence({ id, latitude: 37.5, longitude: 14, acq_date: '2008-08-14', sensor: 'MODIS', type: 0, confidence: 70 }).worldview_url,
    ).filter((u) => u !== null)
    expect(urls.length).toBeGreaterThan(0)
    expect(new Set(urls)).toEqual(new Set(['https://worldview.earthdata.nasa.gov/?t=2008-08-14&v=13.8,37.3,14.2,37.7']))
  })

  it('hides non-fire points unless include_non_fire is true', async () => {
    const hidden = await mockHotspots(q)
    const shown = await mockHotspots({ ...q, include_non_fire: true })
    expect(hidden.features.some((f) => isNonFire(f.properties.confidence_class))).toBe(false)
    expect(shown.features.length).toBeGreaterThan(hidden.features.length)
    expect(shown.features.filter((f) => !isNonFire(f.properties.confidence_class))).toEqual(hidden.features)
    expect((await mockStats(q)).total).toBe(hidden.features.length)
    expect((await mockStats({ ...q, include_non_fire: true })).total).toBe(shown.features.length)
    const grid = await mockGrid({ ...q, cell: 1 })
    expect(grid.cells.reduce((s, c) => s + c.count, 0)).toBe(hidden.features.length)
  })

  it('min_confidence keeps scored points at or above it and drops unscored ones', async () => {
    const { features } = await mockHotspots({ ...q, min_confidence: 60 })
    expect(features.length).toBeGreaterThan(0)
    expect(features.every((f) => f.properties.confidence_score !== null && f.properties.confidence_score >= 60)).toBe(true)
    const all = await mockHotspots({ ...q, min_confidence: 0 })
    expect(all.features.every((f) => f.properties.confidence_score !== null)).toBe(true)
  })

  it('stats by_class counts every matching point, hidden non-fire included, whatever include_non_fire says', async () => {
    const hidden = await mockStats(q)
    const shown = await mockStats({ ...q, include_non_fire: true })
    expect(hidden.by_class).toEqual(shown.by_class)
    const by = hidden.by_class!
    const nonFireTotal = Object.values(by.non_fire).reduce((s, n) => s + n, 0)
    expect(nonFireTotal).toBeGreaterThan(0)
    expect(shown.total).toBe(hidden.total + nonFireTotal)
    const classes = (by.confirmed ?? 0) + (by.likely ?? 0) + (by.unverified ?? 0) + (by.doubtful ?? 0) + (by.unscored ?? 0)
    expect(classes).toBe(hidden.total)
  })

  it('stats by_class honours min_confidence and always has non_fire', async () => {
    const s = await mockStats({ ...q, min_confidence: 60 })
    expect(s.by_class?.unscored).toBeUndefined()
    expect(s.by_class?.doubtful).toBeUndefined()
    const none = await mockStats({ ...q, from: '2008-01-01', to: '2008-01-01', lat: 0, lon: 0, radius_km: 1 })
    expect(none.by_class).toEqual({ non_fire: {} })
  })
})
