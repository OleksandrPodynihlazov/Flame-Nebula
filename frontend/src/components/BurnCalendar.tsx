import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { MONTHS, MONTHS_FULL } from '../constants/fire'
import type { Filters, Month, Sensor } from '../types/api'
import { RAMP, heatVar, rampBounds, rampIndex, topDays, type CalendarGrid } from '../utils/calendar'
import { daysInMonth, isoDate } from '../utils/filters'
import { DIM, SrLoading } from './StatCards'

interface Props {
  grid: CalendarGrid | null
  filters: Filters
  sensors: Sensor[]
  loading: boolean
  onSelectMonth: (m: Month) => void
  onSelectDate: (date: string) => void
  onClear: () => void
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
const COLS = 'grid-cols-[34px_repeat(31,minmax(0,1fr))_48px]'
const TOP_DAYS = 5

export function BurnCalendar({ grid, filters, sensors, loading, onSelectMonth, onSelectDate, onClear }: Props) {
  const hasSelection = filters.month !== null || filters.date !== null
  const first = loading && grid === null
  // Reloading keeps the old grid dimmed; a year without hotspots or a failed load keeps the year's shape, dimmed.
  const dimmed = loading ? !first : grid === null || grid.total === 0

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-4" aria-label="Burning activity calendar">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Burning activity calendar <span className="font-mono font-normal text-muted-foreground">· {filters.year}</span>
          </h2>
          <p className="text-xs text-muted-foreground">Hotspots per day (UTC). Select a day or a month to filter the map.</p>
          {sensors.length > 1 && (
            <p className="mt-1 text-xs text-flare">MODIS + VIIRS raw counts added together, not harmonized. VIIRS detects more, smaller fires.</p>
          )}
        </div>
        {hasSelection && (
          <Button type="button" variant="outline" size="sm" onClick={onClear} className="shrink-0">
            Show full year
          </Button>
        )}
      </div>

      <div className={cn('flex flex-col', dimmed && DIM)} aria-busy={loading}>
        {first && <SrLoading />}
        <div className="flex flex-col gap-px" role="grid" aria-label={`Hotspots per day, ${filters.year}`}>
          <div className={`grid ${COLS} gap-px pb-1 font-mono text-[10px] text-muted-foreground`} role="row">
            <span role="columnheader" />
            {DAYS.map((d) => (
              <span key={d} role="columnheader" className="text-center">
                {d % 5 === 0 || d === 1 ? d : ''}
              </span>
            ))}
            <span role="columnheader" className="pr-1 text-right">
              Total
            </span>
          </div>

          {MONTHS.map((name, mi) => {
            const m = mi as Month
            const row = grid?.counts[m] ?? Array<number | null>(31).fill(0)
            const monthSelected = filters.month === m && filters.date === null
            return (
              <div key={name} className={`grid h-6 ${COLS} items-stretch gap-px`} role="row">
                <button
                  type="button"
                  onClick={() => onSelectMonth(m)}
                  title={`Show all of ${MONTHS_FULL[m]}`}
                  className={cn(
                    'rounded-[2px] px-1 text-left font-mono text-[11px] transition-colors',
                    monthSelected ? 'text-foreground ring-1 ring-flare' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {name}
                </button>

                {row.map((count, di) => {
                  if (count === null || (first && di >= daysInMonth(filters.year, m))) return <span key={di} role="gridcell" aria-hidden="true" />
                  if (first) return <Skeleton key={di} role="gridcell" aria-hidden="true" className="rounded-[2px]" />
                  const date = isoDate(filters.year, m, di + 1)
                  const selected = filters.date === date
                  const label = `${di + 1} ${MONTHS_FULL[m]}: ${count} hotspot${count === 1 ? '' : 's'}`
                  return (
                    <button
                      key={di}
                      type="button"
                      role="gridcell"
                      aria-label={label}
                      aria-selected={selected}
                      title={label}
                      onClick={() => onSelectDate(date)}
                      className={cn(
                        'rounded-[2px] hover:ring-1 hover:ring-foreground/70',
                        selected && 'z-10 ring-2 ring-flare ring-offset-2 ring-offset-background',
                        !selected && monthSelected && 'ring-1 ring-flare/40',
                      )}
                      style={{ background: heatVar(rampIndex(count, grid?.maxDay ?? 0)) }}
                    />
                  )
                })}

                <button
                  type="button"
                  onClick={() => onSelectMonth(m)}
                  className={cn(
                    'rounded-[2px] pr-1 text-right font-mono text-[11px] tabular-nums transition-colors',
                    monthSelected ? 'text-foreground ring-1 ring-flare' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {first ? <Skeleton className="ml-auto h-3 w-8" /> : (grid?.monthTotals[m] ?? 0).toLocaleString('en-US')}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <RampLegend max={grid?.maxDay ?? 0} total={grid?.total ?? 0} loading={first} />
      {first ? <BusiestDaysSkeleton /> : grid && grid.total > 0 && <BusiestDays grid={grid} filters={filters} onSelectDate={onSelectDate} />}
    </section>
  )
}

function RampLegend({ max, total, loading }: { max: number; total: number; loading: boolean }) {
  const bounds = rampBounds(max)
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="font-mono tabular-nums">0</span>
        <div className="flex items-center gap-px">
          {RAMP.map((_, i) => (
            <span key={i} className="h-2.5 w-5 rounded-[2px]" style={{ background: heatVar(i) }} title={i === 0 ? 'No detections' : `≤ ${bounds[i - 1]} per day`} />
          ))}
        </div>
        {loading ? <Skeleton className="h-3 w-14" /> : <span className="font-mono tabular-nums">{max.toLocaleString('en-US')} / day</span>}
        <span>log scale</span>
      </div>
      {loading ? <Skeleton className="h-3 w-24" /> : <span className="font-mono tabular-nums">Year total {total.toLocaleString('en-US')}</span>}
    </div>
  )
}

const dayLabel = (date: string, names: readonly string[]) => `${Number(date.slice(8))} ${names[Number(date.slice(5, 7)) - 1]}`

function BusiestDaysSkeleton() {
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3" aria-hidden="true">
      <Skeleton className="mb-1 h-3 w-28" />
      {Array.from({ length: TOP_DAYS }, (_, i) => (
        <div key={i} className="flex h-8 items-center px-2">
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  )
}

function BusiestDays({ grid, filters, onSelectDate }: { grid: CalendarGrid; filters: Filters; onSelectDate: (date: string) => void }) {
  const month = filters.date ? ((Number(filters.date.slice(5, 7)) - 1) as Month) : filters.month
  const days = topDays(grid, filters.year, month, TOP_DAYS)
  if (days.length === 0) return null
  const top = days[0].count
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <h3 className="mb-1 text-xs text-muted-foreground">
        Busiest days <span className="font-mono">· {month === null ? filters.year : `${MONTHS[month]} ${filters.year}`}</span>
      </h3>
      <ul className="flex flex-col">
        {days.map(({ date, count }) => (
          <li key={date}>
            <button
              type="button"
              onClick={() => onSelectDate(date)}
              aria-label={`Busiest day: ${dayLabel(date, MONTHS_FULL)}, ${count} hotspots`}
              className={cn(
                'grid h-8 w-full grid-cols-[4rem_1fr_3.5rem] items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-accent',
                filters.date === date && 'ring-1 ring-flare',
              )}
            >
              <span className="font-mono text-xs text-foreground">{dayLabel(date, MONTHS)}</span>
              <span className="h-1.5 rounded-full bg-muted" aria-hidden="true">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.max(4, (count / top) * 100)}%`, background: heatVar(rampIndex(count, grid.maxDay)) }}
                />
              </span>
              <span className="text-right font-mono text-xs text-foreground tabular-nums">{count.toLocaleString('en-US')}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
