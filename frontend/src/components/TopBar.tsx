import { ALL_TYPES, FIRE_TYPES } from '../constants/fire'
import type { DayNight, FireType, Filters } from '../types/api'

interface Props {
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  onDownload: () => void
  downloading: boolean
  isDemo: boolean
}

export function TopBar({ filters, onChange, onDownload, downloading, isDemo }: Props) {
  const typeValue = filters.types.length === ALL_TYPES.length ? 'all' : String(filters.types[0])

  const setType = (v: string) => {
    if (v === 'all') return onChange({ types: ALL_TYPES })
    const t = Number(v) as FireType
    // Picking a noise type explicitly would show nothing while Hide Noise is on.
    onChange({ types: [t], hideNoise: FIRE_TYPES[t].noise ? false : filters.hideNoise })
  }

  const toggleNoise = () => {
    const hideNoise = !filters.hideNoise
    const onlyNoise = filters.types.every((t) => FIRE_TYPES[t].noise)
    onChange(hideNoise && onlyNoise ? { hideNoise, types: ALL_TYPES } : { hideNoise })
  }

  return (
    <header className="z-30 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/95 px-3 py-2 lg:h-14 lg:px-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-600 shadow-lg shadow-orange-500/20">
          <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 23c-4.97 0-9-3.58-9-8 0-3.19 2.13-6.48 4.46-8.77.45-.44 1.21-.15 1.25.48.13 2.02 1.21 3.29 2.29 3.29.41 0 .75-.34.75-.75 0-2.61 1.48-5.34 3.44-7.01.47-.4 1.19-.08 1.21.53.11 3.22 1.77 5.23 3.22 6.84C21.13 11.29 22 13.06 22 15c0 4.42-4.03 8-10 8z" />
          </svg>
        </div>
        <h1 className="text-sm font-bold tracking-tight text-white">Flame Nebula</h1>
        <span className="rounded-full border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-orange-300">
          Italy · {filters.year} · MODIS
        </span>
        {isDemo && (
          <span
            className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-amber-300"
            title="The API is not reachable, so synthetic demo data is shown. Not real FIRMS detections."
          >
            Demo data
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:gap-3">
        <label className="flex items-center gap-1.5 text-xs">
          <span className="hidden text-slate-400 xl:inline">Fire type</span>
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

        <label className="flex items-center gap-1.5 text-xs">
          <span className="hidden text-slate-400 xl:inline">Pass</span>
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
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs transition-colors hover:bg-slate-800"
        >
          <span className={`flex h-4 w-7 items-center rounded-full px-0.5 transition-colors ${filters.hideNoise ? 'bg-orange-500' : 'bg-slate-700'}`}>
            <span className={`h-3 w-3 rounded-full transition-transform ${filters.hideNoise ? 'translate-x-3 bg-white' : 'bg-slate-300'}`} />
          </span>
          <span className="font-medium text-slate-200">Hide noise</span>
        </button>

        <div className="hidden items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-xs sm:flex">
          <label className="flex items-center gap-1.5 font-medium text-slate-200">
            <input type="checkbox" checked readOnly disabled className="accent-orange-500" />
            MODIS
          </label>
          <span className="text-slate-700">|</span>
          <label className="flex cursor-not-allowed items-center gap-1.5 text-slate-500" title="VIIRS and harmonization come after the MVP">
            <input type="checkbox" disabled className="opacity-50" />
            VIIRS
            <span className="rounded bg-slate-800 px-1.5 text-[9px] uppercase tracking-wider text-slate-400">Soon</span>
          </label>
        </div>

        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-500 active:bg-orange-700 disabled:opacity-60"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
          </svg>
          {downloading ? 'Preparing…' : 'CSV'}
        </button>
      </div>
    </header>
  )
}
