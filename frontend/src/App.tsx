import { useMemo, useState } from 'react'
import { downloadCsv } from './api/client'
import { BurnCalendar } from './components/BurnCalendar'
import { HotspotMap } from './components/HotspotMap'
import { StatCards } from './components/StatCards'
import { TopBar } from './components/TopBar'
import { DEFAULT_FILTERS } from './constants/fire'
import { useDashboardData } from './hooks/useDashboardData'
import type { Filters } from './types/api'
import { buildGrid } from './utils/calendar'
import { selectionLabel } from './utils/filters'

export default function App() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [downloading, setDownloading] = useState(false)
  const { calendar, stats, hotspots, isDemo, selectionQuery } = useDashboardData(filters)

  const grid = useMemo(() => (calendar.data ? buildGrid(filters.year, calendar.data) : null), [calendar.data, filters.year])
  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))

  const onDownload = async () => {
    setDownloading(true)
    try {
      const tag = filters.date ?? (filters.month !== null ? `${filters.year}-${String(filters.month + 1).padStart(2, '0')}` : filters.year)
      await downloadCsv(selectionQuery, `firms_italy_modis_${tag}.csv`)
    } finally {
      setDownloading(false)
    }
  }

  const error = calendar.error ?? stats.error ?? hotspots.error

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased">
      <TopBar filters={filters} onChange={update} onDownload={onDownload} downloading={downloading} isDemo={isDemo} />

      <main className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <HotspotMap data={hotspots.data} loading={hotspots.loading} label={selectionLabel(filters)} />

        <section className="flex flex-1 flex-col gap-4 overflow-y-auto bg-slate-950 p-4 lg:h-full lg:w-[55%] lg:p-5">
          {error && (
            <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              Could not load data: {error}
            </p>
          )}

          <StatCards stats={stats.data} grid={grid} scope={selectionLabel(filters)} loading={stats.loading} />

          <BurnCalendar
            grid={grid}
            filters={filters}
            loading={calendar.loading}
            onSelectMonth={(month) => update({ month, date: null })}
            onSelectDate={(date) => update({ month: (Number(date.slice(5, 7)) - 1) as Filters['month'], date })}
            onClear={() => update({ month: null, date: null })}
          />
        </section>
      </main>
    </div>
  )
}
