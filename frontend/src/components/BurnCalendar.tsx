import { useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { MONTHS, MONTHS_FULL } from '../constants/fire'
import type { Filters, Month, Sensor } from '../types/api'
import { defaultCell, heatVar, isGridNavKey, moveCell, rampIndex, topDays, type CalendarGrid, type CellPos } from '../utils/calendar'
import { daysInMonth, isoDate } from '../utils/filters'
import { CAL_ATTR, CalendarTooltip } from './CalendarTooltip'
import { HeatLegend } from './HeatLegend'
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
const FOCUS_RING = 'focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none'

export function BurnCalendar({ grid, filters, sensors, loading, onSelectMonth, onSelectDate, onClear }: Props) {
  const hasSelection = filters.month !== null || filters.date !== null
  const first = loading && grid === null
  // Reloading keeps the old grid dimmed; a year without hotspots or a failed load keeps the year's shape, dimmed.
  const dimmed = loading ? !first : grid === null || grid.total === 0

  const gridRef = useRef<HTMLDivElement>(null)
  // The roving-tabindex cell: the last one focused or clicked (this year only), else the default one.
  const [active, setActive] = useState<(CellPos & { year: number }) | null>(null)
  const tabCell: CellPos | null = grid
    ? active?.year === filters.year && grid.counts[active.month][active.day - 1] !== null
      ? active
      : defaultCell(grid, filters.year, filters.date, new Date().toISOString().slice(0, 10))
    : null

  const onGridKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>(`[${CAL_ATTR}="day"]`)
    if (!cell || e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key === 'Escape') {
      if (hasSelection) {
        e.preventDefault()
        onClear()
      }
      return
    }
    if (!isGridNavKey(e.key)) return
    e.preventDefault()
    const to = moveCell(e.key, { month: Number(cell.dataset.month) as Month, day: Number(cell.dataset.day) }, filters.year)
    setActive({ ...to, year: filters.year })
    gridRef.current?.querySelector<HTMLElement>(`[${CAL_ATTR}="day"][data-month="${to.month}"][data-day="${to.day}"]`)?.focus()
  }

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-4" aria-label="Burning activity calendar">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Burning activity</h2>
          {sensors.length > 1 && (
            <p className="mt-1 text-xs text-flare">MODIS + VIIRS raw counts added together, not harmonized. VIIRS detects more, smaller fires.</p>
          )}
        </div>
        {hasSelection && (
          <Button type="button" variant="outline" size="sm" onClick={onClear} className="h-8 shrink-0">
            Show full year
          </Button>
        )}
      </div>

      <div className={cn('flex flex-col', dimmed && DIM)} aria-busy={loading}>
        {first && <SrLoading />}
        <div ref={gridRef} className="flex flex-col gap-px" role="grid" aria-label={`Hotspots per day, ${filters.year}`} onKeyDown={onGridKeyDown}>
          <div className={`grid ${COLS} gap-px pb-1 text-[10px] text-muted-foreground tabular-nums`} role="row">
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
                  data-cal="month"
                  data-month={m}
                  className={cn(
                    'rounded-[2px] px-1 text-left text-[11px] transition-colors',
                    FOCUS_RING,
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
                      data-cal="day"
                      data-month={m}
                      data-day={di + 1}
                      tabIndex={tabCell?.month === m && tabCell.day === di + 1 ? 0 : -1}
                      onFocus={() => setActive({ month: m, day: di + 1, year: filters.year })}
                      onClick={() => onSelectDate(date)}
                      className={cn(
                        'rounded-[2px] hover:ring-1 hover:ring-foreground/70',
                        selected && 'z-10 ring-2 ring-flare ring-offset-2 ring-offset-background',
                        !selected && monthSelected && 'ring-1 ring-flare/40',
                        FOCUS_RING,
                      )}
                      style={{ background: heatVar(rampIndex(count, grid?.maxDay ?? 0)) }}
                    />
                  )
                })}

                <button
                  type="button"
                  onClick={() => onSelectMonth(m)}
                  data-cal="month"
                  data-month={m}
                  className={cn(
                    'rounded-[2px] pr-1 text-right font-mono text-[11px] tabular-nums transition-colors',
                    FOCUS_RING,
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

      <CalendarTooltip gridRef={gridRef} grid={grid} year={filters.year} selectedDate={filters.date} />
      <HeatLegend max={grid?.maxDay ?? 0} unit="day" loading={first} />
      {first ? <BusiestDaysSkeleton /> : grid && grid.total > 0 && <BusiestDays grid={grid} filters={filters} onSelectDate={onSelectDate} />}
    </section>
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
      <h3 className="mb-1 text-xs text-muted-foreground">Busiest days</h3>
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
              <span className="text-xs text-foreground">{dayLabel(date, MONTHS)}</span>
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
