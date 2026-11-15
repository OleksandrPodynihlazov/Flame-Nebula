import type { ComponentProps } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { MONTHS_FULL } from '../constants/fire'
import type { StatsResponse } from '../types/api'
import type { CalendarGrid } from '../utils/calendar'
import { pctChange } from '../utils/compare'
import { AnimatedNumber } from './AnimatedNumber'

interface Props {
  stats: StatsResponse | null
  grid: CalendarGrid | null
  /** Month or day selected, e.g. "Aug 2008"; null for the full year. */
  scope: string | null
  loading: boolean
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

/** Old numbers stay on screen, dimmed, while the same readout reloads; the first load shows skeletons instead. */
export const DIM = 'opacity-60 motion-safe:transition-opacity'

/** Read by screen readers once per loading region; the region itself carries `aria-busy`. */
export function SrLoading() {
  return <span className="sr-only">Loading…</span>
}

/** Headline numbers: the sans face with fixed-width digits so columns of figures line up. */
export const FIGURE = 'font-semibold tracking-tight text-foreground tabular-nums'
export const UNIT = 'text-xs text-muted-foreground'

/** Change from one side to the other as muted text beside the number: a decrease is not "good", so no green or red. */
export function Delta({ from, to, testId }: { from: number | undefined; to: number | undefined; testId?: string }) {
  if (from === undefined || to === undefined) return null
  const p = pctChange(from, to)
  return (
    <span className="text-xs text-muted-foreground tabular-nums" data-testid={testId}>
      {p === null ? (
        '—'
      ) : (
        <>
          {p !== 0 && <span className="sr-only">{p > 0 ? 'up ' : 'down '}</span>}
          {p > 0 ? '+' : p < 0 ? '−' : ''}
          {Math.abs(p)}%
        </>
      )}
    </span>
  )
}

function DayNightBar({ dayPct }: { dayPct: number }) {
  return (
    <span role="img" aria-label={`${dayPct}% by day`} title={`${dayPct}% by day`} className="flex h-1 w-full gap-px overflow-hidden rounded-full">
      <span className="bg-flare" style={{ width: `${dayPct}%` }} />
      <span className="flex-1 bg-compare-a" />
    </span>
  )
}

function DayNight({ day, night }: { day: number; night: number }) {
  return (
    <>
      <AnimatedNumber className={FIGURE} value={day} />
      <span className="text-muted-foreground">/</span>
      <AnimatedNumber className={FIGURE} value={night} />
    </>
  )
}

function dayNightFooter(day: number, total: number) {
  return total > 0 ? <DayNightBar dayPct={Math.round((day / total) * 100)} /> : null
}

export function StatCards({ stats, grid, scope, loading }: Props) {
  const total = stats?.total ?? 0
  const day = stats?.by_daynight.D ?? 0
  const night = stats?.by_daynight.N ?? 0
  const peak = grid?.peakMonth
  const first = loading && stats === null
  const peakFirst = loading && grid === null
  const none = '—'

  return (
    <div className={cn('flex shrink-0 flex-col gap-3', loading && !first && DIM)} aria-busy={loading}>
      {first && <SrLoading />}
      <Readout className="grid-cols-[1fr_0.9fr_1.3fr]">
        <Metric label={scope ? `Hotspots · ${scope}` : 'Hotspots'}>
          {first ? (
            <Skeleton className="h-[30px] w-20" />
          ) : (
            stats ? <AnimatedNumber className={cn(FIGURE, 'text-3xl leading-none')} testId="stat-total" value={total} /> : <span className={cn(FIGURE, 'text-3xl leading-none')} data-testid="stat-total">{none}</span>
          )}
        </Metric>
        <Metric label="Peak month">
          {peakFirst ? <Skeleton className="h-5 w-24" /> : <span className="text-xl leading-none font-semibold text-foreground">{peak ? MONTHS_FULL[peak.month] : none}</span>}
        </Metric>
        <Metric label="Day / night" footer={dayNightFooter(day, total)}>
          {first ? (
            <Skeleton className="h-5 w-28" />
          ) : (
            <span className="flex items-baseline gap-x-1.5 text-xl leading-none">
              <DayNight day={day} night={night} />
            </span>
          )}
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
  const first = loading && stats === null
  const peakFirst = loading && grid === null
  const none = '—'

  return (
    <div className={cn(loading && !first && DIM)} aria-busy={loading}>
      {first && <SrLoading />}
      <Readout className="grid-cols-[1fr_1fr_1.4fr]">
        <Metric label="Hotspots" className="px-3">
          {first ? (
            <Skeleton className="h-4 w-12" />
          ) : (
            stats ? <AnimatedNumber className={cn(FIGURE, 'text-base leading-none')} testId="stat-total" value={total} /> : <span className={cn(FIGURE, 'text-base leading-none')} data-testid="stat-total">{none}</span>
          )}
        </Metric>
        <Metric label="Peak month" className="px-3">
          {peakFirst ? <Skeleton className="h-4 w-10" /> : <span className="text-base leading-none font-semibold text-foreground">{peak ? MONTHS_FULL[peak.month].slice(0, 3) : none}</span>}
        </Metric>
        <Metric label="Day / night" className="px-3" footer={dayNightFooter(day, total)}>
          {first ? (
            <Skeleton className="h-4 w-20" />
          ) : (
            <span className="flex items-baseline gap-x-1 text-base leading-none">
              <DayNight day={day} night={night} />
            </span>
          )}
        </Metric>
      </Readout>
    </div>
  )
}
