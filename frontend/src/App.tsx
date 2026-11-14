import { useCallback, useMemo, useState } from 'react'
import { downloadCsv } from './api/client'
import { BurnCalendar } from './components/BurnCalendar'
import { HotspotMap } from './components/HotspotMap'
import { MobileSheet } from './components/MobileSheet'
import { MiniStats, StatCards } from './components/StatCards'
import { Brand, FilterControls, SearchField, TopBar } from './components/TopBar'
import { DEFAULT_FILTERS } from './constants/fire'
import { useDashboardData } from './hooks/useDashboardData'
import { useIsDesktop } from './hooks/useMediaQuery'
import type { Area, Filters } from './types/api'
import { buildGrid } from './utils/calendar'
import { selectionLabel } from './utils/filters'

export default function App() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [downloading, setDownloading] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const { calendar, stats, hotspots, isDemo, selectionQuery } = useDashboardData(filters)

  const grid = useMemo(() => (calendar.data ? buildGrid(filters.year, calendar.data) : null), [calendar.data, filters.year])
  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const setArea = useCallback((area: Area | null) => setFilters((f) => ({ ...f, area })), [])
  const fileTag = filters.date ?? (filters.month !== null ? `${filters.year}-${String(filters.month + 1).padStart(2, '0')}` : String(filters.year))

  const onDownload = async () => {
    setDownloading(true)
    try {
      await downloadCsv(selectionQuery, `firms_italy_modis_${fileTag}.csv`)
    } finally {
      setDownloading(false)
    }
  }

  const error = calendar.error ?? stats.error ?? hotspots.error

  const errorBanner = error && (
    <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
      Could not load data: {error}
    </p>
  )

  const calendarView = (
    <BurnCalendar
      grid={grid}
      filters={filters}
      loading={calendar.loading}
      onSelectMonth={(month) => update({ month, date: null })}
      onSelectDate={(date) => update({ month: (Number(date.slice(5, 7)) - 1) as Filters['month'], date })}
      onClear={() => update({ month: null, date: null })}
    />
  )

  const controls = { filters, onChange: update, onDownload, downloading }
  const mapProps = {
    data: hotspots.data,
    loading: hotspots.loading,
    label: selectionLabel(filters),
    area: filters.area,
    onAreaChange: setArea,
    fileTag,
    downloading,
    onDownloadCsv: onDownload,
  }

  if (!isDesktop) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased">
        <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900/95 px-3">
          <Brand year={filters.year} isDemo={isDemo} />
          <SearchField />
        </header>

        <main className="relative flex min-h-0 flex-1 flex-col">
          <HotspotMap {...mapProps} mobile>
            <div className="absolute top-3 right-3 z-[1001] flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                aria-expanded={filtersOpen}
                aria-label="Filters"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/90 text-slate-100 shadow-xl backdrop-blur-md"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h18M6 12h12M10 19h4" />
                </svg>
              </button>
              {filtersOpen && (
                <div className="w-64 rounded-xl border border-slate-700/80 bg-slate-900/95 p-3 shadow-xl backdrop-blur-md">
                  <FilterControls {...controls} stacked />
                </div>
              )}
            </div>

            <MobileSheet
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              peek={
                <div className="flex flex-col gap-2">
                  {errorBanner}
                  <MiniStats stats={stats.data} grid={grid} loading={stats.loading} />
                </div>
              }
            >
              {calendarView}
            </MobileSheet>
          </HotspotMap>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased">
      <TopBar {...controls} isDemo={isDemo} />

      <main className="flex flex-1 flex-row overflow-hidden">
        <HotspotMap {...mapProps} />

        <section className="flex h-full w-[55%] flex-col gap-4 overflow-y-auto bg-slate-950 p-5">
          {errorBanner}
          <StatCards stats={stats.data} grid={grid} scope={selectionLabel(filters)} loading={stats.loading} />
          {calendarView}
        </section>
      </main>
    </div>
  )
}
