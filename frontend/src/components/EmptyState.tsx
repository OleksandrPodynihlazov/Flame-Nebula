import { SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import type { Filters } from '../types/api'
import { countChangedFilters, filterSummary } from '../utils/filters'

interface Props {
  filters: Filters
  onClearFilters: () => void
  onClearArea: () => void
}

/** The selection returned no hotspots: says what narrows it and offers the ways to widen it that exist today. */
export function EmptyState({ filters, onClearFilters, onClearArea }: Props) {
  const canClearFilters = countChangedFilters(filters) > 0
  const canClearArea = filters.area !== null

  return (
    <Empty className="flex-none border border-border" data-testid="empty-state">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No hotspots for this selection</EmptyTitle>
        <EmptyDescription>{filterSummary(filters)}</EmptyDescription>
      </EmptyHeader>
      {(canClearFilters || canClearArea) && (
        <EmptyContent className="flex-row justify-center">
          {canClearFilters && (
            <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          )}
          {canClearArea && (
            <Button type="button" variant="outline" size="sm" onClick={onClearArea}>
              Clear area
            </Button>
          )}
        </EmptyContent>
      )}
    </Empty>
  )
}
