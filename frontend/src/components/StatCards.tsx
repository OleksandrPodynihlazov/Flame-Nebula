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

function Card({ title, badge, children, wide }: { title: string; badge?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/70 p-3 sm:p-3.5 ${wide ? 'col-span-2 xl:col-span-1' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 sm:text-[11px]">{title}</span>
        {badge && <span className="shrink-0 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">{badge}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">{children}</div>
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
    <div className={`grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
      <Card title="Detected hotspots" badge={scope}>
        <span className="font-mono text-2xl font-bold text-white" data-testid="stat-total">
          {total.toLocaleString()}
        </span>
        <span className="text-xs text-slate-400">{sensors.join(' + ')} detections</span>
      </Card>

      <Card title="Peak fire month" badge={grid ? 'Year' : undefined}>
        <span className="text-xl font-bold sm:text-2xl text-white">{peak ? MONTHS_FULL[peak.month] : '—'}</span>
        {peak && <span className="font-mono text-xs text-slate-400">{peak.count.toLocaleString()} pts</span>}
      </Card>

      <Card title="Day / night" badge={scope} wide>
        <span className="whitespace-nowrap font-mono text-xl font-bold sm:text-2xl text-white">
          {day.toLocaleString()}
          <span className="text-slate-500"> / </span>
          {night.toLocaleString()}
        </span>
        <span className="whitespace-nowrap text-xs text-slate-400">{total ? `${dayPct}% by day` : ''}</span>
      </Card>
    </div>
  )
}

export function MiniStats({ stats, grid, loading }: Omit<Props, 'scope' | 'sensors'>) {
  const total = stats?.total ?? 0
  const day = stats?.by_daynight.D ?? 0
  const night = stats?.by_daynight.N ?? 0
  const peak = grid?.peakMonth
  const items = [
    { label: 'Hotspots', value: total.toLocaleString() },
    { label: 'Peak month', value: peak ? MONTHS_FULL[peak.month].slice(0, 3) : '—' },
    { label: 'Day / night', value: `${day.toLocaleString()} / ${night.toLocaleString()}` },
  ]
  return (
    <dl className={`grid grid-cols-3 divide-x divide-slate-800 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
      {items.map(({ label, value }) => (
        <div key={label} className="px-2 first:pl-0 last:pr-0">
          <dt className="text-[10px] font-medium tracking-wider text-slate-400 uppercase">{label}</dt>
          <dd className="mt-0.5 truncate font-mono text-base font-bold text-white" data-testid={label === 'Hotspots' ? 'stat-total' : undefined}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
