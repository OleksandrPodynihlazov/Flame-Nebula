import { describe, expect, it } from 'vitest'
import type { Region } from '../types/api'
import { inGeometry } from '../utils/area'
import { HttpError, isTooManyInView } from './errors'
import { checkBboxCap, matchRegions, mockHotspots, mockRegion, mockSearchRegions, mockStats, parseMockFail } from './mocks'

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
