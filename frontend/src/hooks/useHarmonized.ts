import { useMemo } from 'react'
import { fetchHarmonized } from '../api/client'
import type { HarmonizedQuery, HarmonizedResponse } from '../types/api'
import { useEndpoint } from './useDashboardData'

/** Monthly series in one unit across satellites for one country (or EUR). `enabled` false = no request. */
export function useHarmonized(country: string, enabled: boolean) {
  const query = useMemo<HarmonizedQuery | null>(() => (enabled ? { country } : null), [country, enabled])
  return useEndpoint<HarmonizedResponse, HarmonizedQuery>(fetchHarmonized, query)
}
