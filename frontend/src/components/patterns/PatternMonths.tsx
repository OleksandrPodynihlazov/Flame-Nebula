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

/** 12 month buttons for the pattern view: colour = how many likely cells that month has. */
export function PatternMonths({ months, selected, loading, onSelect, compact = false }: Props) {
  const max = Math.max(1, ...(months ?? []).map((m) => m.likely))
  return (
    <div
      className={`flex flex-col gap-3 ${compact ? '' : 'rounded-xl border border-slate-800 bg-slate-900/70 p-4'}`}
      aria-busy={loading}
      data-testid="pattern-months"
    >
      {!compact && (
        <div>
          <h2 className="text-sm font-semibold text-white">Fire patterns by month</h2>
          <p className="text-xs text-slate-400">Cells that burned in at least half of the years (S-NPP, 2012–2025). Pick a month.</p>
        </div>
      )}
      <div className={`grid grid-cols-4 gap-2 transition-opacity ${loading ? 'opacity-60' : ''}`} role="radiogroup" aria-label="Pattern month">
        {MONTHS.map((name, i) => {
          const m = months?.[i]
          const likely = m?.likely ?? 0
          const ratio = likely / max
          const active = selected === i + 1
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${MONTHS_FULL[i]}: ${likely} likely cells`}
              onClick={() => onSelect(i + 1)}
              className={`flex flex-col items-start rounded-lg px-2.5 py-2 text-left transition-transform active:scale-95 ${
                active ? 'ring-2 ring-white' : 'ring-1 ring-slate-800'
              } ${ratio > 0.6 ? 'text-white' : 'text-slate-950'}`}
              style={{ background: likely > 0 ? patternColor(0.15 + 0.85 * ratio) : '#1e293b', color: likely > 0 ? undefined : '#94a3b8' }}
            >
              <span className="text-xs font-semibold">{name}</span>
              <span className="font-mono text-[11px] opacity-80">{likely.toLocaleString()}</span>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-slate-500">Number = likely cells (≥50% of years) in the area.</p>
    </div>
  )
}
