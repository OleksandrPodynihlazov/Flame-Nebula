import type { Area, HotspotFeature, LonLat, RegionGeometry } from '../types/api'
import { areaKm2 } from './selectionSummary'

const EARTH_RADIUS_KM = 6371.0088

export interface SelectionShapeFeature {
  type: 'Feature'
  geometry: { type: 'Polygon'; coordinates: LonLat[][] } | RegionGeometry
  properties: { selection: true; area_km2: number; radius_km?: number; region_id?: number; name?: string }
}

export interface SelectionExport {
  type: 'FeatureCollection'
  features: (HotspotFeature | SelectionShapeFeature)[]
}

/** Closed ring of `steps` points around a center on the sphere (first point repeated at the end). */
export function circleRing(lat: number, lon: number, radiusKm: number, steps = 64): LonLat[] {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const lat1 = toRad(lat)
  const lon1 = toRad(lon)
  const dist = radiusKm / EARTH_RADIUS_KM
  const ring: LonLat[] = []
  for (let i = 0; i < steps; i++) {
    const bearing = (2 * Math.PI * i) / steps
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dist) + Math.cos(lat1) * Math.sin(dist) * Math.cos(bearing))
    const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(dist) * Math.cos(lat1), Math.cos(dist) - Math.sin(lat1) * Math.sin(lat2))
    ring.push([+toDeg(lon2).toFixed(6), +toDeg(lat2).toFixed(6)])
  }
  ring.push(ring[0])
  return ring
}

export function selectionShapeFeature(area: Area): SelectionShapeFeature {
  const area_km2 = +areaKm2(area).toFixed(3)
  if (area.kind === 'circle') {
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [circleRing(area.lat, area.lon, area.radiusKm)] },
      properties: { selection: true, area_km2, radius_km: area.radiusKm },
    }
  }
  if (area.kind === 'region') {
    return {
      type: 'Feature',
      geometry: area.geometry,
      properties: { selection: true, area_km2, region_id: area.id, name: area.name },
    }
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[...area.points, area.points[0]]] },
    properties: { selection: true, area_km2 },
  }
}

/** The loaded dots plus the selection shape, as one FeatureCollection. */
export function selectionGeoJson(area: Area, features: readonly HotspotFeature[]): SelectionExport {
  return { type: 'FeatureCollection', features: [...features, selectionShapeFeature(area)] }
}
