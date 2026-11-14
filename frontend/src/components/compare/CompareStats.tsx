import type { ReactNode } from 'react'
import { COMPARE_COLORS, type CompareSide } from '../../constants/compare'
import type { Sensor, StatsResponse } from '../../types/api'
import type { CalendarGrid } from '../../utils/calendar'
import { formatPct, pctChange } from '../../utils/compare'
import { MiniStats, StatCards } from '../StatCards'

export interface CompareSideData {
  side: CompareSide
  year: number
  stats: StatsResponse | null
  grid: CalendarGrid | null
  loading: boolean
  sensors: Sensor[]
}

function YearTag({ side, year, children }: { side: CompareSide; year: number; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: COMPARE_COLORS[side] }} />
      <span className="font-mono font-semibold text-white">{year}</span>
      {children}
    </div>
  )
}

function Delta({ a, b }: { a: CompareSideData; b: CompareSideData }) {
  if (!a.stats || !b.stats) return null
  const p = pctChange(a.stats.total, b.stats.total)
  const color = p === null || p === 0 ? 'text-slate-400' : p > 0 ? 'text-rose-300' : 'text-emerald-300'
  return (
    <span className={`font-mono text-[11px] ${color}`} data-testid="compare-delta" title={`Hotspots ${b.year} vs ${a.year}`}>
      {formatPct(p)} vs {a.year}
    </span>
  )
}

export function CompareStats({ a, b }: { a: CompareSideData; b: CompareSideData }) {
  return (
    <div className="flex flex-col gap-3" data-testid="compare-stats">
      {[a, b].map((d) => (
        <div key={d.side} className="flex flex-col gap-2">
          <YearTag side={d.side} year={d.year}>
            {d.side === 'b' && <Delta a={a} b={b} />}
          </YearTag>
          <StatCards stats={d.stats} grid={d.grid} scope={`Full year ${d.year}`} loading={d.loading} sensors={d.sensors} />
        </div>
      ))}
    </div>
  )
}

export function CompareMiniStats({ a, b }: { a: CompareSideData; b: CompareSideData }) {
  return (
    <div className="flex flex-col gap-2" data-testid="compare-stats">
      {[a, b].map((d) => (
        <div key={d.side} className="flex flex-col gap-1">
          <YearTag side={d.side} year={d.year}>
            {d.side === 'b' && <Delta a={a} b={b} />}
          </YearTag>
          <MiniStats stats={d.stats} grid={d.grid} loading={d.loading} />
        </div>
      ))}
    </div>
  )
}
