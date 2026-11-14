import { COMPARE_COLORS, type CompareSide, type CompareYears } from '../constants/compare'
import { ALL_SENSORS, ALL_TYPES, FIRE_TYPES, SENSORS, YEARS } from '../constants/fire'

import type { Area, DayNight, FireType, Filters, Sensor } from '../types/api'
import { RegionSearch } from './RegionSearch'

import { defaultCompareYears } from '../utils/compare'
import { activeSensors, sensorAvailable, yearPatch } from '../utils/filters'


interface Props {
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  onDownload: () => void
  downloading: boolean
  isDemo: boolean
  compare: CompareYears | null
  onCompareChange: (compare: CompareYears | null) => void
}

export function Brand({
  year,
  sensors,
  isDemo,
  compare = null,
}: {
  year: number
  sensors: Sensor[]
  isDemo: boolean
  compare?: CompareYears | null
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-600 shadow-lg shadow-orange-500/20">
          <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 23c-4.97 0-9-3.58-9-8 0-3.19 2.13-6.48 4.46-8.77.45-.44 1.21-.15 1.25.48.13 2.02 1.21 3.29 2.29 3.29.41 0 .75-.34.75-.75 0-2.61 1.48-5.34 3.44-7.01.47-.4 1.19-.08 1.21.53.11 3.22 1.77 5.23 3.22 6.84C21.13 11.29 22 13.06 22 15c0 4.42-4.03 8-10 8z" />
          </svg>
        </div>
        <h1 className="whitespace-nowrap text-sm font-bold tracking-tight text-white">Flame Nebula</h1>
        <span className="hidden whitespace-nowrap rounded-full border border-orange-500/30 2xl:inline bg-orange-500/15 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-orange-300">
          Italy · {compare ? `${compare.a} vs ${compare.b}` : year} · {sensors.join(' + ')}
        </span>
        {isDemo && (
          <span
            className="whitespace-nowrap rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-amber-300"
            title="The API is not reachable, so synthetic demo data is shown. Not real FIRMS detections."
          >
            Demo data
          </span>
        )}
          </div>
  )
}

/** Region search bound to `filters.area`. */
export function SearchField({ area, onAreaChange }: { area: Area | null; onAreaChange: (area: Area | null) => void }) {
  return <RegionSearch area={area} onSelect={onAreaChange} />
}

export function FilterControls({
  filters,
  onChange,
  onDownload,
  downloading,
  compare,
  onCompareChange,
  stacked = false,
  hideYear = false,
}: Omit<Props, 'isDemo'> & { stacked?: boolean; hideYear?: boolean }) {
  const typeValue = filters.types.length === ALL_TYPES.length ? 'all' : String(filters.types[0])

  const setType = (v: string) => {
    if (v === 'all') return onChange({ types: ALL_TYPES })
    const t = Number(v) as FireType
    onChange({ types: [t], hideNoise: FIRE_TYPES[t].noise ? false : filters.hideNoise })
  }

  const sensors = activeSensors(filters)

  const setYear = (year: number) => onChange(yearPatch(filters, year))

  const toggleSensor = (s: Sensor) => {
    const next = filters.sensors.includes(s) ? filters.sensors.filter((x) => x !== s) : [...filters.sensors, s]
    if (next.some((x) => sensorAvailable(x, filters.year))) onChange({ sensors: next })
  }

  const toggleNoise = () => {
    const hideNoise = !filters.hideNoise
    const onlyNoise = filters.types.every((t) => FIRE_TYPES[t].noise)
    onChange(hideNoise && onlyNoise ? { hideNoise, types: ALL_TYPES } : { hideNoise })
  }

  return (
    <div className={stacked ? 'flex flex-col items-stretch gap-2.5' : 'flex flex-nowrap items-center gap-2 xl:gap-3'}>
        <button
          type="button"
          role="switch"
          aria-checked={compare !== null}
          onClick={() => onCompareChange(compare ? null : defaultCompareYears(filters.year))}
          title="Compare two years side by side"
          data-testid="compare-toggle"
          className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            compare ? 'border-orange-500/60 bg-orange-500/15 text-orange-200' : 'border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-800'
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M5 7l-3 5 3 5M19 7l3 5-3 5" />
          </svg>
          Compare
        </button>

        {compare ? (
          (['a', 'b'] as CompareSide[]).map((side) => (
            <label key={side} className={`flex items-center gap-1.5 text-xs ${stacked ? '[&>select]:flex-1' : ''}`}>
              <span className={stacked ? 'flex w-14 items-center gap-1.5 text-slate-400' : 'flex items-center'}>
                <span className="h-2 w-2 rounded-full" style={{ background: COMPARE_COLORS[side] }} />
                {stacked && `Year ${side.toUpperCase()}`}
              </span>
              <select
                value={compare[side]}
                onChange={(e) => onCompareChange({ ...compare, [side]: Number(e.target.value) })}
                aria-label={`Compare year ${side.toUpperCase()}`}
                data-testid={`compare-year-${side}`}
                className="rounded-lg border bg-slate-800/90 px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-500"
                style={{ borderColor: COMPARE_COLORS[side] }}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          ))
        ) : hideYear ? null : (
          <label className={`flex items-center gap-1.5 text-xs ${stacked ? '[&>select]:flex-1' : ''}`}>
            <span className={stacked ? 'w-14 text-slate-400' : 'hidden text-slate-400 2xl:inline'}>Year</span>
            <select
              value={filters.year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className={`flex items-center gap-1.5 text-xs ${stacked ? '[&>select]:flex-1' : ''}`}>
          <span className={stacked ? 'w-14 text-slate-400' : 'hidden text-slate-400 2xl:inline'}>Fire type</span>
          <select
            value={typeValue}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="all">All types (0–3)</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t} — {FIRE_TYPES[t].label}
              </option>
            ))}
          </select>
        </label>

        <label className={`flex items-center gap-1.5 text-xs ${stacked ? '[&>select]:flex-1' : ''}`}>
          <span className={stacked ? 'w-14 text-slate-400' : 'hidden text-slate-400 2xl:inline'}>Pass</span>
          <select
            value={filters.daynight ?? 'all'}
            onChange={(e) => onChange({ daynight: e.target.value === 'all' ? null : (e.target.value as DayNight) })}
            className="rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="all">Day + night</option>
            <option value="D">Day only</option>
            <option value="N">Night only</option>
          </select>
        </label>

        <button
          type="button"
          role="switch"
          aria-checked={filters.hideNoise}
          onClick={toggleNoise}
          title="Hide non-vegetation detections: volcanoes, industrial sites, offshore"
          className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs transition-colors hover:bg-slate-800"
        >
          <span className={`flex h-4 w-7 items-center rounded-full px-0.5 transition-colors ${filters.hideNoise ? 'bg-orange-500' : 'bg-slate-700'}`}>
            <span className={`h-3 w-3 rounded-full transition-transform ${filters.hideNoise ? 'translate-x-3 bg-white' : 'bg-slate-300'}`} />
          </span>
          <span className="font-medium text-slate-200">Hide noise</span>
        </button>

        <fieldset
          className={`items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-xs ${stacked ? 'flex' : 'hidden xl:flex'}`}
        >
          <legend className="sr-only">Sensors</legend>
          {ALL_SENSORS.map((s, i) => {
            const available = sensorAvailable(s, filters.year)
            const checked = available && filters.sensors.includes(s)
            const isLast = checked && sensors.length === 1
            const meta = SENSORS[s]
            const title = !available
              ? `${s} has data for ${meta.from}–${meta.to} only`
              : isLast
                ? 'At least one sensor must stay selected'
                : `${s} · ${meta.pixel} pixels`
            return (
              <span key={s} className="contents">
                {i > 0 && <span className="text-slate-700">|</span>}
                <label
                  title={title}
                  className={`flex items-center gap-1.5 font-medium ${available ? 'cursor-pointer text-slate-200' : 'cursor-not-allowed text-slate-500'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!available || isLast}
                    onChange={() => toggleSensor(s)}
                    className="accent-orange-500"
                  />
                  {s}
                  {!available && (
                    <span className="rounded bg-slate-800 px-1.5 text-[9px] tracking-wider text-slate-400">{meta.from}+</span>
                  )}
                </label>
              </span>
            )
          })}
        </fieldset>

        <button
          type="button"
          onClick={onDownload}
          disabled={downloading || compare !== null}
          title={compare ? 'CSV export works on one year: turn compare off first' : undefined}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-500 active:bg-orange-700 disabled:opacity-60"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
          </svg>
          {downloading ? 'Preparing…' : 'CSV'}
        </button>
          </div>
  )
}

export function TopBar({ isDemo, ...rest }: Props) {
  return (
    <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-4">
      <div className="flex min-w-0 items-center gap-4">
<Brand year={rest.filters.year} sensors={activeSensors(rest.filters)} isDemo={isDemo} compare={rest.compare} />
          <div className={rest.compare ? 'hidden 2xl:block' : 'contents'}>
            <SearchField area={rest.filters.area} onAreaChange={(area) => rest.onChange({ area })} />
          </div>
      </div>
      <FilterControls {...rest} />
    </header>
  )
}
