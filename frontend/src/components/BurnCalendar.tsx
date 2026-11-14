import { MONTHS, MONTHS_FULL } from '../constants/fire'
import type { Filters, Month } from '../types/api'
import { RAMP, rampBounds, rampIndex, type CalendarGrid } from '../utils/calendar'
import { isoDate } from '../utils/filters'

interface Props {
  grid: CalendarGrid | null
  filters: Filters
  loading: boolean
  onSelectMonth: (m: Month) => void
  onSelectDate: (date: string) => void
  onClear: () => void
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
const COLS = 'grid-cols-[38px_repeat(31,minmax(14px,1fr))_52px]'

export function BurnCalendar({ grid, filters, loading, onSelectMonth, onSelectDate, onClear }: Props) {
  const hasSelection = filters.month !== null || filters.date !== null

  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Burning activity calendar · {filters.year}</h2>
          <p className="text-xs text-slate-400">Hotspots per day (UTC). Click a day or a month to filter the map.</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={!hasSelection}
          className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-40"
        >
          Show full year
        </button>
      </div>

      <div className={`overflow-x-auto pb-1 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
        <div className="flex min-w-[640px] flex-col gap-[3px]" role="grid" aria-label={`Hotspots per day, ${filters.year}`}>
          <div className={`grid ${COLS} gap-[3px] pb-1 text-[10px] font-semibold text-slate-500`} role="row">
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
              <div key={name} className={`grid ${COLS} items-center gap-[3px]`} role="row">
                <button
                  type="button"
                  onClick={() => onSelectMonth(m)}
                  title={`Show all of ${MONTHS_FULL[m]}`}
                  className={`rounded px-1 py-0.5 text-left font-mono text-[11px] font-semibold transition-colors ${
                    monthSelected ? 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-400' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {name}
                </button>

                {row.map((count, di) => {
                  if (count === null) return <span key={di} role="gridcell" aria-hidden="true" />
                  const date = isoDate(filters.year, m, di + 1)
                  const selected = filters.date === date
                  const inMonth = monthSelected
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
                      className={`h-5 rounded-[3px] transition-transform hover:scale-125 hover:ring-1 hover:ring-white/70 ${
                        selected ? 'z-10 scale-125 ring-2 ring-white' : inMonth ? 'ring-1 ring-orange-400/60' : ''
                      }`}
                      style={{ background: RAMP[rampIndex(count, grid?.maxDay ?? 0)] }}
                    />
                  )
                })}

                <button
                  type="button"
                  onClick={() => onSelectMonth(m)}
                  className={`h-5 rounded border border-slate-800 bg-slate-900/90 pr-1.5 text-right font-mono text-[11px] font-semibold text-slate-200 hover:bg-slate-800 ${
                    monthSelected ? 'ring-1 ring-white' : ''
                  }`}
                >
                  {(grid?.monthTotals[m] ?? 0).toLocaleString()}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <RampLegend max={grid?.maxDay ?? 0} total={grid?.total ?? 0} />
    </div>
  )
}

function RampLegend({ max, total }: { max: number; total: number }) {
  const bounds = rampBounds(max)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-400">
      <div className="flex items-center gap-2">
        <span>0</span>
        <div className="flex items-center gap-1">
          {RAMP.map((c, i) => (
            <span
              key={c}
              className="h-3 w-5 rounded-sm border border-slate-700/60"
              style={{ background: c }}
              title={i === 0 ? 'No detections' : `≤ ${bounds[i - 1]} per day`}
            />
          ))}
        </div>
        <span>{max.toLocaleString()} / day</span>
        <span className="text-slate-600">(log scale)</span>
      </div>
      <span className="font-mono text-slate-300">Year total: {total.toLocaleString()}</span>
    </div>
  )
}
