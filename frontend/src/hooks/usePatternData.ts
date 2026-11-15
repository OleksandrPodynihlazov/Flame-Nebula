import { useMemo } from 'react'
import { fetchPatternSummary, fetchPatterns } from '../api/client'
import type { Filters, PatternQuery, PatternsResponse, PatternSummaryResponse } from '../types/api'
import { patternQuery } from '../utils/patterns'
import { useEndpoint } from './useDashboardData'

/** Cells of one month in the selected area. `month` null = nothing to load. */
export function usePatternCells(filters: Filters, month: number | null) {
  const query = useMemo(() => (month === null ? null : patternQuery(filters, month)), [filters, month])
  return useEndpoint<PatternsResponse, PatternQuery>(fetchPatterns, query)
}

/** Per-month counts for the month buttons. `enabled` false = no request. */
export function usePatternSummary(filters: Filters, enabled: boolean) {
  const query = useMemo(() => (enabled ? patternQuery(filters) : null), [filters, enabled])
  return useEndpoint<PatternSummaryResponse, PatternQuery>(fetchPatternSummary, query)
}
