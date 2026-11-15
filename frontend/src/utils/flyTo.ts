import type L from 'leaflet'

const FLY_SECONDS = 0.6

/** Moves the map to `bounds` after a user action: a short fly, or an instant jump under reduced motion. */
export function flyToFit(map: L.Map, bounds: L.LatLngBoundsExpression, options?: L.FitBoundsOptions): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    map.fitBounds(bounds, options)
    return
  }
  map.flyToBounds(bounds, { ...options, duration: FLY_SECONDS })
}
