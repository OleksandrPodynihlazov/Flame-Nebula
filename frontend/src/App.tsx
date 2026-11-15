import { useCallback, useMemo, useState } from 'react'
import { downloadCsv } from './api/client'
import { BurnCalendar } from './components/BurnCalendar'
import { CompareBars } from './components/compare/CompareBars'
import { CompareMiniStats, CompareStats, type CompareSideData } from './components/compare/CompareStats'
import { HotspotMap } from './components/HotspotMap'
import { MobileCalendar } from './components/MobileCalendar'
import { MobileSheet } from './components/MobileSheet'
import { PatternMonths } from './components/patterns/PatternMonths'
import { PatternMiniStats, PatternStats, type PatternSideStats } from './components/patterns/PatternStats'
import { MiniStats, StatCards } from './components/StatCards'
import { Brand, FilterControls, SearchField, TopBar } from './components/TopBar'
import { COMPARE_COLORS, type CompareYears } from './constants/compare'
import { DEFAULT_FILTERS, MONTHS, MONTHS_FULL } from './constants/fire'
import { useDashboardData } from './hooks/useDashboardData'
import { useIsDesktop } from './hooks/useMediaQuery'
import { usePatternCells, usePatternSummary } from './hooks/usePatternData'
import type { Area, Filters, HotspotFeature, MapView } from './types/api'
import { buildGrid } from './utils/calendar'
import { filtersForYear, formatMW } from './utils/compare'
import { activeSensors, selectionLabel, toggleDatePatch, toggleMonthPatch, yearPatch } from './utils/filters'
import { PATTERN_DEFAULT_MONTH, YEAR_BANDS, patternStats, yearBands } from './utils/patterns'

const NO_FEATURES: readonly HotspotFeature[] = []
const PANEL_WIDTH = 600

export default function App() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [downloading, setDownloading] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [compare, setCompare] = useState<CompareYears | null>(null)
  const [view, setView] = useState<MapView>('spots')
  const [patternMonth, setPatternMonth] = useState(PATTERN_DEFAULT_MONTH)
  const [patternCompare, setPatternCompare] = useState<CompareYears | null>(null)
  const isDesktop = useIsDesktop()
  const isPatterns = view === 'patterns'

  const summary = usePatternSummary(filters, isPatterns)
  const monthA = patternCompare?.a ?? patternMonth
  const cellsA = usePatternCells(filters, isPatterns ? monthA : null)
  const cellsB = usePatternCells(filters, isPatterns && patternCompare ? patternCompare.b : null)
  const patternA = useMemo(() => patternStats(cellsA.data?.cells ?? null), [cellsA.data])
  const patternB = useMemo(() => patternStats(cellsB.data?.cells ?? null), [cellsB.data])

  const filtersA = useMemo(() => (compare ? filtersForYear(filters, compare.a) : filters), [filters, compare])
  const filtersB = useMemo(() => filtersForYear(filters, compare?.b ?? filters.year), [filters, compare])
  const { calendar, stats, selection, isDemo, selectionQuery } = useDashboardData(filtersA, !isPatterns)
  const second = useDashboardData(filtersB, compare !== null && !isPatterns)

  const grid = useMemo(() => (calendar.data ? buildGrid(filtersA.year, calendar.data) : null), [calendar.data, filtersA.year])
  const gridB = useMemo(
    () => (compare && second.calendar.data ? buildGrid(filtersB.year, second.calendar.data) : null),
    [compare, second.calendar.data, filtersB.year],
  )
  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const setArea = useCallback((area: Area | null) => setFilters((f) => ({ ...f, area })), [])
  const sensors = activeSensors(filters)
  const dateTag = filters.date ?? (filters.month !== null ? `${filters.year}-${String(filters.month + 1).padStart(2, '0')}` : String(filters.year))
  const fileTag = `${sensors.join('_').toLowerCase()}_${dateTag}`

  const onDownload = async () => {
    setDownloading(true)
    try {
      await downloadCsv(selectionQuery, `firms_italy_${fileTag}.csv`)
    } finally {
      setDownloading(false)
    }
  }

  // Map and selection card show their own request errors.
  const error = isPatterns
    ? (summary.error ?? cellsA.error ?? cellsB.error)
    : (calendar.error ?? stats.error ?? (compare ? (second.calendar.error ?? second.stats.error) : null))

  const errorBanner = error && (
    <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
      Could not load data: {error}
    </p>
  )

  const calendarView = (
    <BurnCalendar
      grid={grid}
      filters={filters}
      sensors={sensors}
      loading={calendar.loading}
      onSelectMonth={(month) => update(toggleMonthPatch(filters, month))}
      onSelectDate={(date) => update(toggleDatePatch(filters, date))}
      onClear={() => update({ month: null, date: null })}
    />
  )

  const sideA: CompareSideData | null = compare && {
    side: 'a',
    year: filtersA.year,
    stats: stats.data,
    grid,
    loading: stats.loading,
  }
  const sideB: CompareSideData | null = compare && {
    side: 'b',
    year: filtersB.year,
    stats: second.stats.data,
    grid: gridB,
    loading: second.stats.loading,
  }

  const compareChart = compare && (
    <CompareBars
      title={`Fire radiative power per month · ${compare.a} vs ${compare.b}`}
      subtitle="Summed FRP (MW) per month (UTC). Same area and filters on both sides."
      format={formatMW}
      categories={MONTHS}
      loading={calendar.loading || second.calendar.loading}
      series={[
        { label: String(compare.a), color: COMPARE_COLORS.a, values: grid?.monthFrp ?? [] },
        { label: String(compare.b), color: COMPARE_COLORS.b, values: gridB?.monthFrp ?? [] },
      ]}
    />
  )

  const mapCompare = compare && {
    a: { year: compare.a, query: selectionQuery, total: stats.data?.total ?? null, loading: stats.loading },
    b: { year: compare.b, query: second.selectionQuery, total: second.stats.data?.total ?? null, loading: second.stats.loading },
  }

  const pSideA: PatternSideStats = { side: 'a', month: monthA, stats: patternA, loading: cellsA.loading }
  const pSideB: PatternSideStats | null = patternCompare && { side: 'b', month: patternCompare.b, stats: patternB, loading: cellsB.loading }

  const patternChart = patternCompare && (
    <CompareBars
      title={`Recurring cells · ${MONTHS_FULL[patternCompare.a - 1]} vs ${MONTHS_FULL[patternCompare.b - 1]}`}
      subtitle="0.1° cells by years burned that month. Same area on both sides."
      categories={YEAR_BANDS}
      loading={cellsA.loading || cellsB.loading}
      series={[
        { label: MONTHS_FULL[patternCompare.a - 1], color: COMPARE_COLORS.a, values: yearBands(cellsA.data?.cells ?? null) },
        { label: MONTHS_FULL[patternCompare.b - 1], color: COMPARE_COLORS.b, values: yearBands(cellsB.data?.cells ?? null) },
      ]}
    />
  )

  const patternMonths = (compact: boolean) => (
    <PatternMonths months={summary.data?.months ?? null} selected={patternMonth} loading={summary.loading} onSelect={setPatternMonth} compact={compact} />
  )

  const scope = isPatterns
    ? `Patterns · ${patternCompare ? `${MONTHS_FULL[patternCompare.a - 1].slice(0, 3)} vs ${MONTHS_FULL[patternCompare.b - 1].slice(0, 3)}` : MONTHS_FULL[patternMonth - 1]}`
    : undefined

  const controls = {
    filters,
    onChange: update,
    onDownload,
    downloading,
    compare,
    onCompareChange: setCompare,
    patternMode: isPatterns ? { compare: patternCompare, onCompareChange: setPatternCompare } : null,
  }
  const mapProps = {
    query: selectionQuery,
    total: stats.data?.total ?? null,
    totalLoading: stats.loading,
    selection: {
      features: selection.data?.features ?? NO_FEATURES,
      loading: selection.loading,
      error: selection.error,
    },
    label: selectionLabel(filters),
    sensors,
    area: filters.area,
    onAreaChange: setArea,
    fileTag,
    downloading,
    onDownloadCsv: onDownload,
    compare: mapCompare,
    view,
    onViewChange: setView,
    patterns: isPatterns
      ? {
          a: { month: monthA, cells: cellsA.data?.cells ?? null, loading: cellsA.loading, error: cellsA.error },
          b: patternCompare && { month: patternCompare.b, cells: cellsB.data?.cells ?? null, loading: cellsB.loading, error: cellsB.error },
        }
      : null,
  }

  if (!isDesktop) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased">
        <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900/95 px-3">
          <Brand year={filters.year} sensors={sensors} isDemo={isDemo} compare={compare} scope={scope} />
          <SearchField area={filters.area} onAreaChange={setArea} />
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
                  <FilterControls {...controls} stacked hideYear patternMonth={patternMonth} />
                </div>
              )}
            </div>

            <MobileSheet
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              peek={
                <div className="flex flex-col gap-2">
                  {errorBanner}
                  {isPatterns ? (
                    <PatternMiniStats a={pSideA} b={pSideB} />
                  ) : sideA && sideB ? (
                    <CompareMiniStats a={sideA} b={sideB} />
                  ) : (
                    <MiniStats stats={stats.data} grid={grid} loading={stats.loading} />
                  )}
                </div>
              }
            >
              {isPatterns ? (
                patternChart || patternMonths(true)
              ) : compareChart || (
                <MobileCalendar
                  grid={grid}
                  filters={filters}
                  loading={calendar.loading}
                  onYear={(year) => update(yearPatch(filters, year))}
                  onMonth={(month) => update(month === null ? { month: null, date: null } : toggleMonthPatch(filters, month))}
                  onDate={(date) => update(toggleDatePatch(filters, date))}
                />
              )}
            </MobileSheet>
          </HotspotMap>
        </main>
      </div>
    )
  }

  const panelWidth = Math.min(PANEL_WIDTH, Math.round(window.innerWidth * 0.48))

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased">
      <TopBar {...controls} isDemo={isDemo} scope={scope} patternMonth={patternMonth} />

      <main className="relative flex-1 overflow-hidden">
        <HotspotMap {...mapProps} rightInset={panelOpen ? panelWidth : 0} />

        <aside
          className={`absolute inset-y-0 right-0 z-[1100] flex transition-transform duration-200 ${panelOpen ? '' : 'translate-x-full'}`}
          style={{ width: panelWidth }}
          aria-label="Statistics"
        >
          <button
            type="button"
            onClick={() => setPanelOpen((o) => !o)}
            aria-expanded={panelOpen}
            aria-label={panelOpen ? 'Hide statistics' : 'Show statistics'}
            data-testid="panel-toggle"
            className="absolute top-1/2 -left-7 flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-slate-700/80 bg-slate-900/95 text-slate-300 shadow-xl backdrop-blur-md hover:text-white"
          >
            <svg className={`h-4 w-4 transition-transform ${panelOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
            </svg>
          </button>
          <section className="flex h-full w-full flex-col gap-4 overflow-y-auto border-l border-slate-800 bg-slate-950/95 p-5 backdrop-blur-md">
            {errorBanner}
            {isPatterns ? (
              <>
                <PatternStats a={pSideA} b={pSideB} />
                {patternChart || patternMonths(false)}
              </>
            ) : (
              <>
                {sideA && sideB ? (
                  <CompareStats a={sideA} b={sideB} />
                ) : (
                  <StatCards stats={stats.data} grid={grid} scope={selectionLabel(filters)} loading={stats.loading} sensors={sensors} />
                )}
                {compareChart || calendarView}
              </>
            )}
          </section>
        </aside>
      </main>
    </div>
  )
}
