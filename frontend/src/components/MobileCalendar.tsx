import { useRef, type PointerEvent } from 'react'
import { MONTHS, MONTHS_FULL, YEARS } from '../constants/fire'
import type { Filters, Month } from '../types/api'
import { RAMP, rampIndex, type CalendarGrid } from '../utils/calendar'
import { isoDate } from '../utils/filters'

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

const textOn = (idx: number) => (idx >= RAMP.length - 2 ? 'text-slate-950' : 'text-slate-100')

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={dir === 'left' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
    </svg>
  )
}

function StepButton({ dir, label, disabled, onClick }: { dir: 'left' | 'right'; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-30"
    >
      <Chevron dir={dir} />
    </button>
  )
}

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

  return (
    <div className="flex flex-col gap-3" aria-busy={loading} data-testid="mobile-calendar">
      <div className="flex items-center justify-between">
        {month === null ? (
          <StepButton dir="left" label="Previous year" disabled={year <= firstYear} onClick={() => onYear(year - 1)} />
        ) : (
          <span className="w-8" />
        )}
        <nav className="flex items-center gap-1 text-sm font-semibold" aria-label="Calendar level">
          <button
            type="button"
            onClick={() => onMonth(null)}
            className={`rounded-md px-2 py-1 font-mono ${month === null ? 'text-white' : 'text-orange-300 hover:bg-slate-800'}`}
            data-testid="calendar-year"
          >
            {year}
          </button>
          {month !== null && (
            <>
              <span className="text-slate-600">/</span>
              <button
                type="button"
                onClick={() => onMonth(month)}
                title="Unselect month"
                className={`rounded-md px-2 py-1 ${
                  filters.date ? 'text-orange-300 hover:bg-slate-800' : 'bg-orange-500/15 text-orange-200 ring-1 ring-orange-400/60'
                }`}
                data-testid="calendar-month"
              >
                {MONTHS_FULL[month]}
              </button>
            </>
          )}
          {filters.date && (
            <>
              <span className="text-slate-600">/</span>
              <button
                type="button"
                onClick={() => onDate(filters.date!)}
                title="Unselect day"
                className="rounded-md bg-orange-500/15 px-2 py-1 font-mono text-orange-200 ring-1 ring-orange-400/60"
                data-testid="calendar-day"
              >
                {Number(filters.date.slice(8))}
              </button>
            </>
          )}
        </nav>
        {month === null ? (
          <StepButton dir="right" label="Next year" disabled={year >= lastYear} onClick={() => onYear(year + 1)} />
        ) : (
          <span className="w-8" />
        )}
      </div>

      <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
        {month === null ? (
          <div className="grid grid-cols-4 gap-2" role="list">
            {MONTHS.map((name, mi) => {
              const total = grid?.monthTotals[mi] ?? 0
              const idx = rampIndex(total, monthMax)
              const peak = grid?.peakMonth?.month === mi
              return (
                <button
                  key={name}
                  type="button"
                  role="listitem"
                  onClick={() => onMonth(mi as Month)}
                  className={`flex flex-col items-start rounded-lg px-2.5 py-2 text-left ring-1 transition-transform active:scale-95 ${
                    peak ? 'ring-orange-300' : 'ring-slate-800'
                  } ${textOn(idx)}`}
                  style={{ background: RAMP[idx] }}
                  aria-label={`${MONTHS_FULL[mi]}: ${total} hotspots`}
                >
                  <span className="text-xs font-semibold">{name}</span>
                  <span className="font-mono text-[11px] opacity-80">{total.toLocaleString()}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <StepButton dir="left" label="Previous month" disabled={month <= 0} onClick={() => stepMonth(-1)} />
            <div
              className="flex-1 touch-pan-y select-none"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (startX.current = null)}
            >
              <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-500">
                {WEEKDAYS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${MONTHS_FULL[month]} ${year}`}>
                {Array.from({ length: (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7 }, (_, i) => (
                  <span key={`pad-${i}`} aria-hidden="true" />
                ))}
                {(grid?.counts[month] ?? []).map((count, di) => {
                  if (count === null) return null
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
                      className={`flex h-9 flex-col items-center justify-center rounded-md text-[11px] leading-none font-semibold transition-transform active:scale-95 ${textOn(idx)} ${
                        selected ? 'ring-2 ring-white' : ''
                      }`}
                      style={{ background: RAMP[idx] }}
                    >
                      {di + 1}
                      {count > 0 && <span className="mt-0.5 font-mono text-[9px] font-normal opacity-75">{count}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
            <StepButton dir="right" label="Next month" disabled={month >= 11} onClick={() => stepMonth(1)} />
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-slate-500">
        {month === null ? 'Tap a month to see its days' : 'Tap a day to filter · tap again to unselect · swipe for next month'}
      </p>
    </div>
  )
}
