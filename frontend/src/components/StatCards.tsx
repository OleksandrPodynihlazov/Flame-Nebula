import type { ComponentProps } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MONTHS_FULL } from '../constants/fire'
import type { Sensor, StatsResponse } from '../types/api'
import type { CalendarGrid } from '../utils/calendar'
import { pctChange } from '../utils/compare'

interface Props {
  stats: StatsResponse | null
  grid: CalendarGrid | null
  scope: string
  loading: boolean
  sensors: Sensor[]
}

/** Metrics side by side, split by vertical hairlines. Pair with `Metric`. */
export function Readout({ className, ...props }: ComponentProps<'dl'>) {
  return <dl className={cn('grid grid-cols-3 divide-x divide-border', className)} {...props} />
}

/** One readout column: a one-line label, the figure(s) as children, an optional footer line. */
export function Metric({ label, children, footer, className }: { label: string; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 px-4 first:pl-0 last:pr-0', className)}>
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-baseline gap-x-1.5 whitespace-nowrap">{children}</dd>
      {footer && <dd className="min-w-0 text-xs text-muted-foreground">{footer}</dd>}
    </div>
  )
}

export const FIGURE = 'font-mono font-semibold text-foreground tabular-nums'
export const UNIT = 'text-xs text-muted-foreground'

/** Change from one side to the other as a neutral badge: a decrease is not "good", so no green or red. */
export function Delta({ from, to, testId, compact = false }: { from: number | undefined; to: number | undefined; testId?: string; compact?: boolean }) {
  if (from === undefined || to === undefined) return null
  const p = pctChange(from, to)
  const body =
    p === null ? (
      '—'
    ) : (
      <>
        {p !== 0 && <span aria-hidden="true">{p > 0 ? '↑' : '↓'}</span>}
        {p !== 0 && <span className="sr-only">{p > 0 ? 'up ' : 'down '}</span>}
        {Math.abs(p)}%
      </>
    )
  if (compact) {
    return (
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums" data-testid={testId}>
        {body}
      </span>
    )
  }
  return (
    <Badge variant="outline" className="font-mono text-muted-foreground tabular-nums" data-testid={testId}>
      {body}
    </Badge>
  )
}

function DayNightBar({ dayPct }: { dayPct: number }) {
  return (
    <span aria-hidden="true" className="flex h-1 w-full gap-px overflow-hidden rounded-full">
      <span className="bg-flare" style={{ width: `${dayPct}%` }} />
      <span className="flex-1 bg-compare-a" />
    </span>
  )
}

function DayNight({ day, night }: { day: number; night: number }) {
  return (
    <>
      <span className={FIGURE}>{day.toLocaleString('en-US')}</span>
      <span className="text-muted-foreground">/</span>
      <span className={FIGURE}>{night.toLocaleString('en-US')}</span>
    </>
  )
}

function dayNightFooter(day: number, total: number, withText = true) {
  const dayPct = total ? Math.round((day / total) * 100) : 0
  return (
    <span className="flex flex-col gap-1.5">
      {total > 0 && <DayNightBar dayPct={dayPct} />}
      {withText && <span>{total ? `${dayPct}% by day` : '\u00a0'}</span>}
    </span>
  )
}

export function StatCards({ stats, grid, scope, loading, sensors }: Props) {
  const total = stats?.total ?? 0
  const day = stats?.by_daynight.D ?? 0
  const night = stats?.by_daynight.N ?? 0
  const peak = grid?.peakMonth

  return (
    <div className={cn('flex shrink-0 flex-col gap-3', loading && 'opacity-60')} aria-busy={loading}>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="font-mono text-foreground">
          {scope}
        </Badge>
        <span>{sensors.join(' + ')}</span>
      </p>
      <Readout className="grid-cols-[1fr_0.9fr_1.3fr]">
        <Metric label="Hotspots" footer={<span className="block truncate">detections</span>}>
          <span className={cn(FIGURE, 'text-3xl leading-none')} data-testid="stat-total">
            {total.toLocaleString('en-US')}
          </span>
        </Metric>
        <Metric label="Peak month" footer={peak ? <span className="block truncate font-mono tabular-nums">{peak.count.toLocaleString('en-US')} in year</span> : <span>&nbsp;</span>}>
          <span className="text-xl leading-none font-semibold text-foreground">{peak ? MONTHS_FULL[peak.month] : '—'}</span>
        </Metric>
        <Metric label="Day / night" footer={dayNightFooter(day, total)}>
          <span className="flex items-baseline gap-x-1.5 text-xl leading-none">
            <DayNight day={day} night={night} />
          </span>
        </Metric>
      </Readout>
    </div>
  )
}

export function MiniStats({ stats, grid, loading }: Omit<Props, 'scope' | 'sensors'>) {
  const total = stats?.total ?? 0
  const day = stats?.by_daynight.D ?? 0
  const night = stats?.by_daynight.N ?? 0
  const peak = grid?.peakMonth

  return (
    <Readout className={cn('grid-cols-[1fr_1fr_1.4fr]', loading && 'opacity-60')} aria-busy={loading}>
      <Metric label="Hotspots" className="px-3">
        <span className={cn(FIGURE, 'text-base leading-none')} data-testid="stat-total">
          {total.toLocaleString('en-US')}
        </span>
      </Metric>
      <Metric label="Peak month" className="px-3">
        <span className="text-base leading-none font-semibold text-foreground">{peak ? MONTHS_FULL[peak.month].slice(0, 3) : '—'}</span>
      </Metric>
      <Metric label="Day / night" className="px-3" footer={dayNightFooter(day, total, false)}>
        <span className="flex items-baseline gap-x-1 text-base leading-none">
          <DayNight day={day} night={night} />
        </span>
      </Metric>
    </Readout>
  )
}
