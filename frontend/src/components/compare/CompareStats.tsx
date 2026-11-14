import type { ReactNode } from 'react'
import { COMPARE_COLORS, type CompareSide } from '../../constants/compare'
import { MONTHS_FULL } from '../../constants/fire'
import type { StatsResponse } from '../../types/api'
import type { CalendarGrid } from '../../utils/calendar'
import { formatMW, formatPct, pctChange, peakIndex } from '../../utils/compare'
import { Card } from '../StatCards'

export interface CompareSideData {
  side: CompareSide
  year: number
  stats: StatsResponse | null
  grid: CalendarGrid | null
  loading: boolean
}

function YearTag({ side, year }: { side: CompareSide; year: number }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-white">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: COMPARE_COLORS[side] }} />
      {year}
    </span>
  )
}

function Delta({ from, to, testId }: { from: number | undefined; to: number | undefined; testId?: string }) {
  if (from === undefined || to === undefined) return null
  const p = pctChange(from, to)
  const color = p === null || p === 0 ? 'text-slate-400' : p > 0 ? 'text-rose-300' : 'text-emerald-300'
  return (
    <span className={`font-mono text-[11px] ${color}`} data-testid={testId}>
      {formatPct(p)}
    </span>
  )
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

/** Desktop: one row of cards per year. Main figure is summed FRP; year B shows the change vs A. */
export function CompareStats({ a, b }: { a: CompareSideData; b: CompareSideData }) {
  return (
    <div className="flex flex-col gap-3" data-testid="compare-stats">
      {[a, b].map((d) => (
        <Row key={d.side} d={d} other={d.side === 'b' ? a : null}>
          {(m, o) => (
            <div
              className={`grid shrink-0 grid-cols-3 gap-3 border-l-2 pl-3 ${d.loading ? 'opacity-60' : ''}`}
              style={{ borderColor: COMPARE_COLORS[d.side] }}
              aria-busy={d.loading}
            >
              <Card title="Total FRP" badge={String(d.year)}>
                <span className="font-mono text-2xl font-bold text-white" data-testid="stat-frp" title={m.frp === undefined ? undefined : `${m.frp.toLocaleString()} MW`}>
                  {m.frp === undefined ? '—' : formatMW(m.frp)}
                </span>
                {o && <Delta from={o.frp} to={m.frp} testId="compare-delta" />}
              </Card>
              <Card title="Peak month (FRP)">
                <span className="text-xl font-bold text-white">{m.peak?.name ?? '—'}</span>
                {m.peak && <span className="font-mono text-xs text-slate-400">{formatMW(m.peak.frp)}</span>}
              </Card>
              <Card title="Hotspots">
                <span className="font-mono text-xl font-bold text-white" data-testid="stat-total">
                  {m.total === undefined ? '—' : m.total.toLocaleString()}
                </span>
                {o && <Delta from={o.total} to={m.total} />}
              </Card>
            </div>
          )}
        </Row>
      ))}
    </div>
  )
}

/** Phone: two compact rows, FRP first. */
export function CompareMiniStats({ a, b }: { a: CompareSideData; b: CompareSideData }) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="compare-stats">
      <div className="grid grid-cols-[3.25rem_1fr_1fr_1fr] gap-x-2 text-[10px] font-medium tracking-wider text-slate-400 uppercase">
        <span />
        <span>FRP, MW</span>
        <span>Peak</span>
        <span>Hotspots</span>
      </div>
      {[a, b].map((d) => (
        <Row key={d.side} d={d} other={d.side === 'b' ? a : null}>
          {(m, o) => (
            <div className={`grid grid-cols-[3.25rem_1fr_1fr_1fr] items-baseline gap-x-2 ${d.loading ? 'opacity-60' : ''}`} aria-busy={d.loading}>
              <YearTag side={d.side} year={d.year} />
              <span className="truncate font-mono text-sm font-bold text-white" data-testid="stat-frp">
                {m.frp === undefined ? '—' : formatMW(m.frp).replace(' MW', '')} {o && <Delta from={o.frp} to={m.frp} testId="compare-delta" />}
              </span>
              <span className="truncate text-sm font-semibold text-white">{m.peak ? m.peak.name.slice(0, 3) : '—'}</span>
              <span className="truncate font-mono text-sm font-bold text-white" data-testid="stat-total">
                {m.total === undefined ? '—' : m.total.toLocaleString()}
              </span>
            </div>
          )}
        </Row>
      ))}
    </div>
  )
}
