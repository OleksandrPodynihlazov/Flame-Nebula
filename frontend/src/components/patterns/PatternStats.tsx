import { cn } from '@/lib/utils'
import { COMPARE_COLORS, type CompareSide } from '../../constants/compare'
import { MONTHS_FULL } from '../../constants/fire'
import { formatProbability, type PatternStatsData } from '../../utils/patterns'
import { AnimatedNumber } from '../AnimatedNumber'
import { Delta, FIGURE, Metric, Readout } from '../StatCards'

export interface PatternSideStats {
  side: CompareSide
  month: number
  stats: PatternStatsData | null
  loading: boolean
}

/** Desktop readout for one month (no compare) or one ruled readout per month (compare). */
export function PatternStats({ a, b = null }: { a: PatternSideStats; b?: PatternSideStats | null }) {
  const rows = b ? [a, b] : [a]
  return (
    <div className="flex flex-col gap-5" data-testid="pattern-stats">
      {rows.map((d) => {
        const other = b && d.side === 'b' ? a : null
        const top = d.stats?.top
        return (
          <div
            key={d.side}
            className={cn(b && 'border-l-2 pl-4', d.loading && 'opacity-60')}
            style={b ? { borderColor: COMPARE_COLORS[d.side] } : undefined}
            aria-busy={d.loading}
          >
            <p className="mb-2 text-xs font-semibold text-foreground">{b ? MONTHS_FULL[d.month - 1] : `Patterns · ${MONTHS_FULL[d.month - 1]}`}</p>
            <Readout className="grid-cols-[1fr_1.3fr_1fr]">
              <Metric label="Recurring cells">
                {d.stats ? (
                  <AnimatedNumber className={cn(FIGURE, 'text-3xl leading-none')} testId="pattern-likely" value={d.stats.cells} />
                ) : (
                  <span className={cn(FIGURE, 'text-3xl leading-none')} data-testid="pattern-likely">—</span>
                )}
                {other && <Delta from={other.stats?.cells} to={d.stats?.cells} />}
              </Metric>
              <Metric label="Most regular cell">
                <span className={cn(FIGURE, 'text-xl leading-none')}>{top ? formatProbability(top.probability) : '—'}</span>
                {top && (
                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    {top.lat.toFixed(2)}, {top.lon.toFixed(2)}
                  </span>
                )}
              </Metric>
              <Metric label="Every year">
                {d.stats ? <AnimatedNumber className={cn(FIGURE, 'text-xl leading-none')} value={d.stats.everyYear} /> : <span className={cn(FIGURE, 'text-xl leading-none')}>—</span>}
                {other && <Delta from={other.stats?.everyYear} to={d.stats?.everyYear} />}
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
          {d.stats ? (
            <AnimatedNumber className="truncate text-sm font-semibold tracking-tight text-foreground" testId="pattern-likely" value={d.stats.cells} />
          ) : (
            <span className="truncate text-sm font-semibold tracking-tight text-foreground tabular-nums" data-testid="pattern-likely">—</span>
          )}
          <span className="truncate text-sm font-semibold tracking-tight text-foreground tabular-nums">{d.stats?.top ? formatProbability(d.stats.top.probability) : '—'}</span>
          {d.stats ? (
            <AnimatedNumber className="truncate text-sm font-semibold tracking-tight text-foreground" value={d.stats.everyYear} />
          ) : (
            <span className="truncate text-sm font-semibold tracking-tight text-foreground tabular-nums">—</span>
          )}
        </div>
      ))}
    </div>
  )
}
