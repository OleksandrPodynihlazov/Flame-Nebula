import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { COMPARE_COLORS, type CompareSide } from '../../constants/compare'
import { MONTHS_FULL } from '../../constants/fire'
import type { StatsResponse } from '../../types/api'
import type { CalendarGrid } from '../../utils/calendar'
import { formatMW, peakIndex } from '../../utils/compare'
import { DIM, Delta, FIGURE, Metric, Readout, SrLoading, UNIT } from '../StatCards'

export interface CompareSideData {
  side: CompareSide
  year: number
  stats: StatsResponse | null
  grid: CalendarGrid | null
  loading: boolean
}

function YearTag({ side, year }: { side: CompareSide; year: number }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground tabular-nums">
      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: COMPARE_COLORS[side] }} />
      {year}
    </span>
  )
}

/** "1.2K MW" as a figure and its unit. */
function splitMW(mw: number): [string, string] {
  const [figure, unit] = formatMW(mw).split(' ')
  return [figure, unit]
}

function metrics(d: CompareSideData) {
  const peak = d.grid ? peakIndex(d.grid.monthFrp) : null
  return {
    frp: d.stats?.frp_sum,
    total: d.stats?.total,
    peak: peak === null ? null : { name: MONTHS_FULL[peak], frp: d.grid!.monthFrp[peak] },
  }
}

function Row({ d, other, children }: { d: CompareSideData; other: CompareSideData | null; children: (m: ReturnType<typeof metrics>, o: ReturnType<typeof metrics> | null) => ReactNode }) {
  return <>{children(metrics(d), other ? metrics(other) : null)}</>
}

/** Desktop: one readout per year, ruled in its series colour. Main figure is summed FRP; year B shows the change vs A. */
export function CompareStats({ a, b }: { a: CompareSideData; b: CompareSideData }) {
  return (
    <div className="flex flex-col gap-5" data-testid="compare-stats">
      {[a, b].map((d) => (
        <Row key={d.side} d={d} other={d.side === 'b' ? a : null}>
          {(m, o) => {
            const first = d.loading && d.stats === null
            return (
              <div className={cn('border-l-2 pl-4', d.loading && !first && DIM)} style={{ borderColor: COMPARE_COLORS[d.side] }} aria-busy={d.loading}>
                <p className="mb-2 text-xs font-semibold text-foreground tabular-nums">{d.year}</p>
                {first && <SrLoading />}
                <Readout className="grid-cols-[1.2fr_1fr_1fr]">
                  <Metric label="Total FRP">
                    {first ? (
                      <Skeleton className="h-[30px] w-20" />
                    ) : (
                      <>
                        <span className={cn(FIGURE, 'text-3xl leading-none')} data-testid="stat-frp" title={m.frp === undefined ? undefined : `${m.frp.toLocaleString('en-US')} MW`}>
                          {m.frp === undefined ? '—' : splitMW(m.frp)[0]}
                        </span>
                        {m.frp !== undefined && <span className={UNIT}>{splitMW(m.frp)[1]}</span>}
                        {o && <Delta from={o.frp} to={m.frp} testId="compare-delta" />}
                      </>
                    )}
                  </Metric>
                  <Metric label="Peak month">
                    {d.loading && d.grid === null ? <Skeleton className="h-5 w-20" /> : <span className="text-xl leading-none font-semibold text-foreground">{m.peak?.name ?? '—'}</span>}
                  </Metric>
                  <Metric label="Hotspots">
                    {first ? (
                      <Skeleton className="h-5 w-14" />
                    ) : (
                      <>
                        <span className={cn(FIGURE, 'text-xl leading-none')} data-testid="stat-total">
                          {m.total === undefined ? '—' : m.total.toLocaleString('en-US')}
                        </span>
                        {o && <Delta from={o.total} to={m.total} />}
                      </>
                    )}
                  </Metric>
                </Readout>
              </div>
            )
          }}
        </Row>
      ))}
    </div>
  )
}

/** Phone: two compact rows, FRP first. */
export function CompareMiniStats({ a, b }: { a: CompareSideData; b: CompareSideData }) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="compare-stats">
      <div className="grid grid-cols-[3.25rem_1fr_1fr_1fr] gap-x-2 text-[11px] text-muted-foreground">
        <span />
        <span>FRP, MW</span>
        <span>Peak</span>
        <span>Hotspots</span>
      </div>
      {[a, b].map((d) => (
        <Row key={d.side} d={d} other={d.side === 'b' ? a : null}>
          {(m, o) => {
            const first = d.loading && d.stats === null
            return (
              <div className={cn('grid grid-cols-[3.25rem_1fr_1fr_1fr] items-baseline gap-x-2', d.loading && !first && DIM)} aria-busy={d.loading}>
                <YearTag side={d.side} year={d.year} />
                {first ? (
                  <>
                    <SrLoading />
                    <Skeleton className="h-3.5 w-12 self-center" />
                    <Skeleton className="h-3.5 w-8 self-center" />
                    <Skeleton className="h-3.5 w-12 self-center" />
                  </>
                ) : (
                  <>
                    <span className="truncate text-sm font-semibold tracking-tight text-foreground tabular-nums" data-testid="stat-frp">
                      {m.frp === undefined ? '—' : formatMW(m.frp).replace(' MW', '')} {o && <Delta from={o.frp} to={m.frp} testId="compare-delta" />}
                    </span>
                    <span className="truncate text-sm font-semibold text-foreground">{m.peak ? m.peak.name.slice(0, 3) : '—'}</span>
                    <span className="truncate text-sm font-semibold tracking-tight text-foreground tabular-nums" data-testid="stat-total">
                      {m.total === undefined ? '—' : m.total.toLocaleString()}
                    </span>
                  </>
                )}
              </div>
            )
          }}
        </Row>
      ))}
    </div>
  )
}
