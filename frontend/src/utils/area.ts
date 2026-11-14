import type { Area, HotspotFeature, LonLat } from '../types/api'

/** Great-circle distance in km (mean Earth radius 6371 km). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

/** Ray casting on lon/lat as a flat plane; `poly` is an open ring. */
export function inPolygon([lon, lat]: LonLat, poly: readonly LonLat[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Same rules as the mock API: polygon by ray casting, circle by haversine (edge included). */
export function inArea(f: HotspotFeature, area: Area): boolean {
  if (area.kind === 'polygon') return inPolygon(f.geometry.coordinates, area.points)
  return haversineKm(area.lat, area.lon, f.properties.latitude, f.properties.longitude) <= area.radiusKm
}

export function filterByArea(features: readonly HotspotFeature[], area: Area): HotspotFeature[] {
  return features.filter((f) => inArea(f, area))
}
