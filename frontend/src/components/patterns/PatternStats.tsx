import { cn } from '@/lib/utils'
import { COMPARE_COLORS, type CompareSide } from '../../constants/compare'
import { MONTHS_FULL } from '../../constants/fire'
import { formatProbability, type PatternStatsData } from '../../utils/patterns'
import { Delta, FIGURE, Metric, Readout } from '../StatCards'

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

/** Desktop readout for one month (no compare) or one ruled readout per month (compare). */
export function PatternStats({ a, b = null }: { a: PatternSideStats; b?: PatternSideStats | null }) {
  const rows = b ? [a, b] : [a]
  return (
    <div className="flex flex-col gap-5" data-testid="pattern-stats">
      {rows.map((d) => {
        const other = b && d.side === 'b' ? a : null
        return (
          <div
            key={d.side}
            className={cn(b && 'border-l-2 pl-4', d.loading && 'opacity-60')}
            style={b ? { borderColor: COMPARE_COLORS[d.side] } : undefined}
            aria-busy={d.loading}
          >
            <p className="mb-2 text-xs font-semibold text-foreground">{MONTHS_FULL[d.month - 1]}</p>
            <Readout className="grid-cols-[1fr_1.3fr_1fr]">
              <Metric
                label="Recurring cells"
                footer={other ? <Delta from={other.stats?.cells} to={d.stats?.cells} /> : <span className="block truncate">burned 12+ of 14 years</span>}
              >
                <span className={cn(FIGURE, 'text-3xl leading-none')} data-testid="pattern-likely">
                  {d.stats ? d.stats.cells.toLocaleString('en-US') : '—'}
                </span>
              </Metric>
              <Metric
                label="Most regular cell"
                footer={d.stats?.top ? <span className="font-mono tabular-nums">{d.stats.top.lat.toFixed(2)}, {d.stats.top.lon.toFixed(2)}</span> : undefined}
              >
                <span className="text-base leading-none font-semibold text-foreground tabular-nums">{topLine(d.stats)}</span>
              </Metric>
              <Metric
                label="Every year"
                footer={other ? <Delta from={other.stats?.everyYear} to={d.stats?.everyYear} /> : <span className="block truncate">cells, 14 of 14 years</span>}
              >
                <span className={cn(FIGURE, 'text-xl leading-none')}>{d.stats ? d.stats.everyYear.toLocaleString('en-US') : '—'}</span>
              </Metric>
            </Readout>
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
