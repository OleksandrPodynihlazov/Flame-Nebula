import { useRef, type PointerEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { MONTHS, MONTHS_FULL, YEARS } from '../constants/fire'
import type { Filters, Month } from '../types/api'
import { heatInk, heatVar, rampIndex, type CalendarGrid } from '../utils/calendar'
import { daysInMonth, isoDate } from '../utils/filters'
import { HeatLegend } from './HeatLegend'
import { DIM, SrLoading } from './StatCards'

interface Props {
  grid: CalendarGrid | null
  filters: Filters
  loading: boolean
  onYear: (year: number) => void
  onMonth: (month: Month | null) => void
  onDate: (date: string) => void
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const SWIPE_PX = 40
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function StepButton({ dir, label, disabled, onClick }: { dir: 'left' | 'right'; label: string; disabled: boolean; onClick: () => void }) {
  const Icon = dir === 'left' ? ChevronLeft : ChevronRight
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClick} disabled={disabled} aria-label={label} className="text-muted-foreground">
      <Icon aria-hidden="true" />
    </Button>
  )
}

const CRUMB = 'h-8 px-2 text-sm'
const CRUMB_CURRENT = 'bg-secondary text-foreground ring-1 ring-flare hover:bg-secondary'
const CRUMB_PARENT = 'text-muted-foreground hover:text-foreground'

/** Phone calendar: year → 12 months → days of one month. Tap again to unselect; swipe to change month. */
export function MobileCalendar({ grid, filters, loading, onYear, onMonth, onDate }: Props) {
  const { year, month } = filters
  const startX = useRef<number | null>(null)
  const firstYear = YEARS[0]
  const lastYear = YEARS[YEARS.length - 1]

  const stepMonth = (delta: number) => {
    if (month === null) return
    const next = month + delta
    if (next >= 0 && next <= 11) onMonth(next as Month)
  }

  const onPointerDown = (e: PointerEvent) => {
    startX.current = e.clientX
  }
  const onPointerUp = (e: PointerEvent) => {
    if (startX.current === null) return
    const dx = e.clientX - startX.current
    startX.current = null
    if (Math.abs(dx) < SWIPE_PX) return
    stepMonth(dx < 0 ? 1 : -1)
  }

  const monthMax = Math.max(0, ...(grid?.monthTotals ?? []))
  const first = loading && grid === null
  // Reloading keeps the old grid dimmed; a year without hotspots or a failed load keeps the year's shape, dimmed.
  const dimmed = loading ? !first : grid === null || grid.total === 0

  return (
    <div className="flex flex-col gap-3" aria-busy={loading} data-testid="mobile-calendar">
      {first && <SrLoading />}
      <div className="flex items-center justify-between">
        {month === null ? (
          <StepButton dir="left" label="Previous year" disabled={year <= firstYear} onClick={() => onYear(year - 1)} />
        ) : (
          <span className="w-8" aria-hidden="true" />
        )}
        <nav className="flex items-center gap-0.5" aria-label="Calendar level">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onMonth(null)}
            className={cn(CRUMB, 'font-mono', month === null ? CRUMB_CURRENT : CRUMB_PARENT)}
            data-testid="calendar-year"
          >
            {year}
          </Button>
          {month !== null && (
            <>
              <span className="text-muted-foreground" aria-hidden="true">/</span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onMonth(month)}
                title="Unselect month"
                className={cn(CRUMB, filters.date ? CRUMB_PARENT : CRUMB_CURRENT)}
                data-testid="calendar-month"
              >
                {MONTHS_FULL[month]}
              </Button>
            </>
          )}
          {filters.date && (
            <>
              <span className="text-muted-foreground" aria-hidden="true">/</span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onDate(filters.date!)}
                title="Unselect day"
                className={cn(CRUMB, 'font-mono', CRUMB_CURRENT)}
                data-testid="calendar-day"
              >
                {Number(filters.date.slice(8))}
              </Button>
            </>
          )}
        </nav>
        {month === null ? (
          <StepButton dir="right" label="Next year" disabled={year >= lastYear} onClick={() => onYear(year + 1)} />
        ) : (
          <span className="w-8" aria-hidden="true" />
        )}
      </div>

      <div className={cn(dimmed && DIM)}>
        {month === null ? (
          <ul className="grid grid-cols-4 gap-2">
            {MONTHS.map((name, mi) => {
              if (first) return <li key={name} aria-hidden="true"><Skeleton className="h-[52px] rounded-lg" /></li>
              const total = grid?.monthTotals[mi] ?? 0
              const idx = rampIndex(total, monthMax)
              const peak = grid?.peakMonth?.month === mi
              return (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => onMonth(mi as Month)}
                    className={cn(
                      'flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left ring-1 transition-transform active:scale-95',
                      peak ? 'ring-flare' : 'ring-border',
                      FOCUS_RING,
                      heatInk(idx),
                    )}
                    style={{ background: heatVar(idx) }}
                    aria-label={`${MONTHS_FULL[mi]}: ${total} hotspots`}
                  >
                    <span className="text-xs font-semibold">{name}</span>
                    <span className="font-mono text-[11px] tabular-nums">{total.toLocaleString('en-US')}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="flex items-center gap-1">
            <StepButton dir="left" label="Previous month" disabled={month <= 0} onClick={() => stepMonth(-1)} />
            <div
              className="flex-1 touch-pan-y select-none"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (startX.current = null)}
            >
              <div className="mb-1 grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-muted-foreground">
                {WEEKDAYS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${MONTHS_FULL[month]} ${year}`}>
                {Array.from({ length: (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7 }, (_, i) => (
                  <span key={`pad-${i}`} aria-hidden="true" />
                ))}
                {(grid?.counts[month] ?? Array.from({ length: first ? daysInMonth(year, month) : 0 }, () => 0)).map((count, di) => {
                  if (count === null) return null
                  if (first) return <Skeleton key={di} aria-hidden="true" className="h-11 rounded-md" />
                  const date = isoDate(year, month, di + 1)
                  const selected = filters.date === date
                  const idx = rampIndex(count, grid?.maxDay ?? 0)
                  return (
                    <button
                      key={date}
                      type="button"
                      role="gridcell"
                      onClick={() => onDate(date)}
                      aria-pressed={selected}
                      aria-label={`${di + 1} ${MONTHS_FULL[month]}: ${count} hotspots`}
                      className={cn(
                        'flex h-11 flex-col items-center justify-center rounded-md text-[11px] leading-none font-semibold transition-transform active:scale-95',
                        heatInk(idx),
                        selected && 'ring-2 ring-flare ring-offset-1 ring-offset-card',
                        FOCUS_RING,
                      )}
                      style={{ background: heatVar(idx) }}
                    >
                      {di + 1}
                      {count > 0 && <span className="mt-0.5 font-mono text-[9px] font-normal">{count}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
            <StepButton dir="right" label="Next month" disabled={month >= 11} onClick={() => stepMonth(1)} />
          </div>
        )}
      </div>

      {!first && grid && <HeatLegend max={month === null ? monthMax : grid.maxDay} unit={month === null ? 'month' : 'day'} />}

      <p className="text-center text-xs text-muted-foreground">
        {month === null ? 'Tap a month to see its days' : 'Tap a day to filter · tap again to unselect · swipe for next month'}
      </p>
    </div>
  )
}
