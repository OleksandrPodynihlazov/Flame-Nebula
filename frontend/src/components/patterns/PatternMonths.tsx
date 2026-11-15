import { cn } from '@/lib/utils'
import { MONTHS, MONTHS_FULL } from '../../constants/fire'
import type { PatternMonth } from '../../types/api'
import { patternColor } from '../../utils/patterns'

interface Props {
  months: PatternMonth[] | null
  selected: number
  loading: boolean
  onSelect: (month: number) => void
  compact?: boolean
}

/** 12 month buttons for the pattern view: colour = how many recurring cells that month has. */
export function PatternMonths({ months, selected, loading, onSelect, compact = false }: Props) {
  const max = Math.max(1, ...(months ?? []).map((m) => m.cells))
  return (
    <div
      className={cn('flex flex-col gap-3', !compact && 'rounded-lg border border-border bg-card p-4')}
      aria-busy={loading}
      data-testid="pattern-months"
    >
      {!compact && (
        <div>
          <h2 className="text-sm font-medium text-foreground">Fire patterns by month</h2>
          <p className="text-xs text-muted-foreground">Cells that burned in at least 12 of 14 years that month (S-NPP, 2012–2025). Pick a month.</p>
        </div>
      )}
      <div className={cn('grid grid-cols-4 gap-2 transition-opacity', loading && 'opacity-60')} role="radiogroup" aria-label="Pattern month">
        {MONTHS.map((name, i) => {
          const m = months?.[i]
          const likely = m?.cells ?? 0
          const ratio = likely / max
          const active = selected === i + 1
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${MONTHS_FULL[i]}: ${likely} recurring cells`}
              onClick={() => onSelect(i + 1)}
              className={cn(
                'flex min-h-11 flex-col items-start rounded-lg px-2.5 py-2 text-left outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-95',
                active ? 'ring-2 ring-foreground' : 'ring-1 ring-border',
                likely === 0 ? 'bg-muted text-muted-foreground' : ratio > 0.6 ? 'text-foreground' : 'text-primary-foreground',
              )}
              style={likely > 0 ? { background: patternColor(0.15 + 0.85 * ratio) } : undefined}
            >
              <span className="text-xs font-medium">{name}</span>
              <span className="font-mono text-[11px] tabular-nums opacity-80">{likely.toLocaleString()}</span>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">Number = recurring cells (≥12 of 14 years) in the area.</p>
    </div>
  )
}
