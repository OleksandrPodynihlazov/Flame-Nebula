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
      className={cn('flex flex-col gap-3', !compact && 'border-t border-border pt-4')}
      aria-busy={loading}
      data-testid="pattern-months"
    >
      {!compact && <h2 className="text-sm font-semibold text-foreground">By month</h2>}
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
                active ? 'ring-2 ring-foreground' : null,
                likely === 0 ? 'bg-muted text-muted-foreground' : ratio > 0.6 ? 'text-foreground' : 'text-primary-foreground',
              )}
              style={likely > 0 ? { background: patternColor(0.15 + 0.85 * ratio) } : undefined}
            >
              <span className="text-xs font-medium">{name}</span>
              <span className="text-[11px] tabular-nums opacity-80">{likely.toLocaleString()}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
