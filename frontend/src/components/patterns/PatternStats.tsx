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
  const color = p === null || p === 0 ? 'text-muted-foreground' : p > 0 ? 'text-destructive' : 'text-foreground'
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
            <Card title="Recurring cells" badge={MONTHS_FULL[d.month - 1]}>
              <span className="font-mono text-2xl font-semibold text-foreground tabular-nums" data-testid="pattern-likely">
                {d.stats ? d.stats.cells.toLocaleString() : '—'}
              </span>
              {other && <Delta from={other.stats?.cells} to={d.stats?.cells} />}
              {!other && <span className="text-xs text-muted-foreground">burned ≥12 of 14 years</span>}
            </Card>
            <Card title="Most regular cell">
              <span className="text-base font-semibold whitespace-nowrap text-foreground tabular-nums">{topLine(d.stats)}</span>
              {d.stats?.top && (
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {d.stats.top.lat.toFixed(2)}, {d.stats.top.lon.toFixed(2)}
                </span>
              )}
            </Card>
            <Card title="Every year">
              <span className="font-mono text-xl font-semibold text-foreground tabular-nums">{d.stats ? d.stats.everyYear.toLocaleString() : '—'}</span>
              {other && <Delta from={other.stats?.everyYear} to={d.stats?.everyYear} />}
              {!other && <span className="text-xs text-muted-foreground">cells, 14 of 14 years</span>}
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
      <div className="grid grid-cols-[3.25rem_1fr_1fr_1fr] gap-x-2 text-[11px] font-medium text-muted-foreground">
        <span />
        <span>Cells</span>
        <span>Top cell</span>
        <span>14/14</span>
      </div>
      {rows.map((d) => (
        <div key={d.side} className={`grid grid-cols-[3.25rem_1fr_1fr_1fr] items-baseline gap-x-2 ${d.loading ? 'opacity-60' : ''}`}>
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            {b && <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: COMPARE_COLORS[d.side] }} />}
            {MONTHS_FULL[d.month - 1].slice(0, 3)}
          </span>
          <span className="truncate font-mono text-sm font-semibold text-foreground tabular-nums" data-testid="pattern-likely">
            {d.stats ? d.stats.cells.toLocaleString() : '—'}
          </span>
          <span className="truncate font-mono text-sm font-semibold text-foreground tabular-nums">{d.stats?.top ? formatProbability(d.stats.top.probability) : '—'}</span>
          <span className="truncate font-mono text-sm font-semibold text-foreground tabular-nums">{d.stats ? d.stats.everyYear.toLocaleString() : '—'}</span>
        </div>
      ))}
    </div>
  )
}
