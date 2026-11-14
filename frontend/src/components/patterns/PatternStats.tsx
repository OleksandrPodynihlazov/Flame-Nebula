import { COMPARE_COLORS, type CompareSide } from '../../constants/compare'
import { MONTHS_FULL } from '../../constants/fire'
import { formatPct, pctChange } from '../../utils/compare'
import { formatProbability, type PatternStatsData } from '../../utils/patterns'
import { Card } from '../StatCards'

export interface PatternSideStats {
  side: CompareSide
  month: number
  stats: PatternStatsData | null
  loading: boolean
}

function topLine(s: PatternStatsData | null) {
  if (!s?.top) return '—'
  return `${formatProbability(s.top.probability)} · ${s.top.years_burned}/${s.top.years_observed} yrs`
}

function Delta({ from, to }: { from: number | undefined; to: number | undefined }) {
  if (from === undefined || to === undefined) return null
  const p = pctChange(from, to)
  const color = p === null || p === 0 ? 'text-slate-400' : p > 0 ? 'text-rose-300' : 'text-emerald-300'
  return <span className={`font-mono text-[11px] ${color}`}>{formatPct(p)}</span>
}

/** Desktop cards for one month (no compare) or one row per month (compare). */
export function PatternStats({ a, b = null }: { a: PatternSideStats; b?: PatternSideStats | null }) {
  const rows = b ? [a, b] : [a]
  return (
    <div className="flex flex-col gap-3" data-testid="pattern-stats">
      {rows.map((d) => {
        const other = b && d.side === 'b' ? a : null
        return (
          <div
            key={d.side}
            className={`grid shrink-0 grid-cols-3 gap-3 ${b ? 'border-l-2 pl-3' : ''} ${d.loading ? 'opacity-60' : ''}`}
            style={b ? { borderColor: COMPARE_COLORS[d.side] } : undefined}
            aria-busy={d.loading}
          >
            <Card title="Likely cells" badge={MONTHS_FULL[d.month - 1]}>
              <span className="font-mono text-2xl font-bold text-white" data-testid="pattern-likely">
                {d.stats ? d.stats.likely.toLocaleString() : '—'}
              </span>
              {other && <Delta from={other.stats?.likely} to={d.stats?.likely} />}
              {!other && <span className="text-xs text-slate-400">burned ≥50% of years</span>}
            </Card>
            <Card title="Most regular cell">
              <span className="text-base font-bold whitespace-nowrap text-white">{topLine(d.stats)}</span>
              {d.stats?.top && (
                <span className="font-mono text-[11px] text-slate-400">
                  {d.stats.top.lat.toFixed(2)}, {d.stats.top.lon.toFixed(2)}
                </span>
              )}
            </Card>
            <Card title="Cells with fire">
              <span className="font-mono text-xl font-bold text-white">{d.stats ? d.stats.cells.toLocaleString() : '—'}</span>
              {other && <Delta from={other.stats?.cells} to={d.stats?.cells} />}
              {!other && <span className="text-xs text-slate-400">0.1° cells, any year</span>}
            </Card>
          </div>
        )
      })}
    </div>
  )
}

/** Phone: compact rows. */
export function PatternMiniStats({ a, b = null }: { a: PatternSideStats; b?: PatternSideStats | null }) {
  const rows = b ? [a, b] : [a]
  return (
    <div className="flex flex-col gap-1.5" data-testid="pattern-stats">
      <div className="grid grid-cols-[3.25rem_1fr_1fr_1fr] gap-x-2 text-[10px] font-medium tracking-wider text-slate-400 uppercase">
        <span />
        <span>Likely</span>
        <span>Top cell</span>
        <span>With fire</span>
      </div>
      {rows.map((d) => (
        <div key={d.side} className={`grid grid-cols-[3.25rem_1fr_1fr_1fr] items-baseline gap-x-2 ${d.loading ? 'opacity-60' : ''}`}>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
            {b && <span className="h-2.5 w-2.5 rounded-full" style={{ background: COMPARE_COLORS[d.side] }} />}
            {MONTHS_FULL[d.month - 1].slice(0, 3)}
          </span>
          <span className="truncate font-mono text-sm font-bold text-white" data-testid="pattern-likely">
            {d.stats ? d.stats.likely.toLocaleString() : '—'}
          </span>
          <span className="truncate font-mono text-sm font-bold text-white">{d.stats?.top ? formatProbability(d.stats.top.probability) : '—'}</span>
          <span className="truncate font-mono text-sm font-bold text-white">{d.stats ? d.stats.cells.toLocaleString() : '—'}</span>
        </div>
      ))}
    </div>
  )
}
