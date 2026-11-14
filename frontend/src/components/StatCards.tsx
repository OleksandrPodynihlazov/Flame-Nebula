import type { ReactNode } from 'react'
import { MONTHS_FULL } from '../constants/fire'
import type { Sensor, StatsResponse } from '../types/api'
import type { CalendarGrid } from '../utils/calendar'

interface Props {
  stats: StatsResponse | null
  grid: CalendarGrid | null
  scope: string
  loading: boolean
  sensors: Sensor[]
}

function Card({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{title}</span>
        {badge && <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">{badge}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">{children}</div>
    </div>
  )
}

export function StatCards({ stats, grid, scope, loading, sensors }: Props) {
  const total = stats?.total ?? 0
  const day = stats?.by_daynight.D ?? 0
  const night = stats?.by_daynight.N ?? 0
  const dayPct = total ? Math.round((day / total) * 100) : 0
  const peak = grid?.peakMonth

  return (
    <div className={`grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-3 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
      <Card title="Detected hotspots" badge={scope}>
        <span className="font-mono text-2xl font-bold text-white">{total.toLocaleString()}</span>
        <span className="text-xs text-slate-400">{sensors.join(' + ')} detections</span>
      </Card>

      <Card title="Peak fire month" badge={grid ? 'Year' : undefined}>
        <span className="text-2xl font-bold text-white">{peak ? MONTHS_FULL[peak.month] : '—'}</span>
        {peak && <span className="font-mono text-xs text-slate-400">{peak.count.toLocaleString()} pts</span>}
      </Card>

      <Card title="Day / night" badge={scope}>
        <span className="font-mono text-2xl font-bold text-white">
          {day.toLocaleString()}
          <span className="text-slate-500"> / </span>
          {night.toLocaleString()}
        </span>
        <span className="text-xs text-slate-400">{total ? `${dayPct}% by day` : ''}</span>
      </Card>
    </div>
  )
}
