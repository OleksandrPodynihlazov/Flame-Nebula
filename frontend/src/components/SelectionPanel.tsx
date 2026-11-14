import { useMemo, useState, type ReactNode } from 'react'
import { USE_MOCKS, downloadBlob } from '../api/client'
import { ALL_TYPES, FIRE_TYPES, MONTHS, MONTHS_FULL } from '../constants/fire'
import type { Area, HotspotFeature } from '../types/api'
import { selectionGeoJson } from '../utils/selectionExport'
import { formatAreaKm2, selectionSummary } from '../utils/selectionSummary'

type CircleArea = Extract<Area, { kind: 'circle' }>

interface Props {
  area: Area
  features: readonly HotspotFeature[]
  loading: boolean
  fileTag: string
  downloading: boolean
  onDownloadCsv: () => void
  onAreaChange: (area: Area | null) => void
}

const fmt = (n: number, digits = 0) => n.toLocaleString(undefined, { maximumFractionDigits: digits })

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

function Row({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <>
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-mono text-slate-100" data-testid={testId}>
        {children}
      </dd>
    </>
  )
}

const FIELDS = [
  { key: 'lat', label: 'Lat', min: -90, max: 90, error: 'Latitude must be between -90 and 90.' },
  { key: 'lon', label: 'Lon', min: -180, max: 180, error: 'Longitude must be between -180 and 180.' },
  { key: 'radiusKm', label: 'Radius km', min: 0, max: 1000, error: 'Radius must be more than 0 and at most 1000 km.' },
] as const

type FieldKey = (typeof FIELDS)[number]['key']

function parseField(key: FieldKey, raw: string): number | null {
  const field = FIELDS.find((f) => f.key === key)
  const n = raw.trim() === '' ? NaN : Number(raw)
  if (!field || !Number.isFinite(n)) return null
  const aboveMin = key === 'radiusKm' ? n > field.min : n >= field.min
  return aboveMin && n <= field.max ? n : null
}

/** Lat / lon / radius of a drawn circle. Commits on Enter or blur when every value is valid. */
function CircleInputs({ area, onAreaChange }: { area: CircleArea; onAreaChange: (area: Area) => void }) {
  const [draft, setDraft] = useState<Record<FieldKey, string>>({
    lat: String(area.lat),
    lon: String(area.lon),
    radiusKm: String(area.radiusKm),
  })
  const parsed = {
    lat: parseField('lat', draft.lat),
    lon: parseField('lon', draft.lon),
    radiusKm: parseField('radiusKm', draft.radiusKm),
  }
  const errors = FIELDS.filter((f) => parsed[f.key] === null)

  const commit = () => {
    const { lat, lon, radiusKm } = parsed
    if (lat === null || lon === null || radiusKm === null) return
    if (lat === area.lat && lon === area.lon && radiusKm === area.radiusKm) return
    onAreaChange({ kind: 'circle', lat, lon, radiusKm })
  }

  return (
    <fieldset className="border-t border-slate-800/80 pt-2.5">
      <legend className="sr-only">Circle center and radius</legend>
      <div className="grid grid-cols-3 gap-2">
        {FIELDS.map((f) => {
          const invalid = parsed[f.key] === null
          return (
            <label key={f.key} className="flex min-w-0 flex-col gap-1 text-[11px] text-slate-400">
              {f.label}
              <input
                type="text"
                inputMode="decimal"
                value={draft[f.key]}
                aria-invalid={invalid}
                aria-describedby={invalid ? 'circle-input-errors' : undefined}
                data-testid={`circle-${f.key}`}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit()
                }}
                className={`w-full min-w-0 rounded-md border bg-slate-950/70 px-2 py-1.5 font-mono text-xs text-slate-100 focus:outline-none focus:ring-1 ${
                  invalid ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-700 focus:ring-orange-500'
                }`}
              />
            </label>
          )
        })}
      </div>
      {errors.length > 0 && (
        <ul id="circle-input-errors" aria-live="polite" className="mt-1.5 text-[11px] text-rose-300">
          {errors.map((f) => (
            <li key={f.key}>{f.error}</li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}

const BUTTON =
  'flex flex-1 items-center justify-center rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 disabled:opacity-60'

export function SelectionPanel({ area, features, loading, fileTag, downloading, onDownloadCsv, onAreaChange }: Props) {
  const [expanded, setExpanded] = useState(false)
  const s = useMemo(() => selectionSummary(area, features), [area, features])
  const areaText = `${formatAreaKm2(s.areaKm2)} km²`
  const countText = loading ? '…' : fmt(s.count)

  const downloadGeoJson = () => {
    const json = JSON.stringify(selectionGeoJson(area, features))
    const name = `firms_italy_${fileTag}_area${USE_MOCKS ? '_DEMO' : ''}.geojson`
    downloadBlob(new Blob([json], { type: 'application/geo+json' }), name)
  }

  return (
    <section
      aria-label="Selected area"
      data-testid="selection-panel"
      aria-busy={loading}
      className="absolute top-14 right-14 left-12 z-20 flex max-h-[calc(100%-4.5rem)] flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/90 shadow-xl backdrop-blur-md lg:right-3 lg:left-auto lg:w-64"
    >
      <div className="flex items-stretch lg:hidden">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-controls="selection-details"
          data-testid="selection-toggle"
          className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2 pr-1 pl-3 text-xs text-slate-200 transition-colors hover:bg-slate-800/60"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" />
            <span className="truncate font-medium">
              <span className="font-mono">{countText}</span> hotspots · <span className="font-mono">{areaText}</span>
            </span>
          </span>
          <span className="text-[10px] text-slate-400">{expanded ? '▲' : '▼'}</span>
        </button>
        <button
          type="button"
          onClick={() => onAreaChange(null)}
          aria-label="Clear selection"
          data-testid="selection-clear-compact"
          className="flex min-h-8 min-w-8 shrink-0 items-center justify-center px-2 text-base leading-none text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <h2 className="hidden items-center gap-2 px-3 pt-2.5 text-xs font-semibold text-slate-200 lg:flex">
        <span className="h-2 w-2 rounded-full bg-orange-500" />
        Selected area
      </h2>

      <div
        id="selection-details"
        className={`${expanded ? 'flex' : 'hidden'} flex-col gap-2.5 overflow-y-auto px-3 pt-2 pb-3 lg:flex ${loading ? 'opacity-60' : ''}`}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          <Row label="Area" testId="selection-area">
            {areaText}
          </Row>
          {s.count > 0 && (
            <>
              <Row label="Hotspots" testId="selection-count">
                {fmt(s.count)}
              </Row>
              <Row label="Density">{s.densityPer1000Km2 === null ? '—' : `${fmt(s.densityPer1000Km2, 1)} / 1,000 km²`}</Row>
              <Row label="Day / night">
                {fmt(s.byDaynight.D)} / {fmt(s.byDaynight.N)}
              </Row>
              <Row label="FRP sum">{s.frp ? `${fmt(s.frp.sum)} MW` : '—'}</Row>
              <Row label="FRP mean / max">{s.frp ? `${fmt(s.frp.mean, 1)} / ${fmt(s.frp.max, 1)} MW` : '—'}</Row>
              <Row label="Peak month">{s.peakMonth ? `${MONTHS_FULL[s.peakMonth.month]} (${fmt(s.peakMonth.count)})` : '—'}</Row>
              <Row label="Peak day">{s.peakDay ? `${shortDate(s.peakDay.date)} (${fmt(s.peakDay.count)})` : '—'}</Row>
              <Row label="First / last">
                {s.firstDate && s.lastDate ? `${shortDate(s.firstDate)} – ${shortDate(s.lastDate)}` : '—'}
              </Row>
            </>
          )}
        </dl>

        {s.count === 0 && !loading && (
          <p className="text-[11px] text-slate-400" data-testid="selection-empty">
            No hotspots in this area
          </p>
        )}

        {s.count > 0 && (
          <ul className="flex flex-col gap-1 border-t border-slate-800/80 pt-2 text-[11px]" aria-label="Hotspots by type">
            {ALL_TYPES.filter((t) => s.byType[t] > 0).map((t) => (
              <li key={t} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: FIRE_TYPES[t].color }} />
                  {FIRE_TYPES[t].label}
                </span>
                <span className="font-mono text-slate-100">{fmt(s.byType[t])}</span>
              </li>
            ))}
          </ul>
        )}

        {area.kind === 'circle' && (
          <CircleInputs key={`${area.lat}|${area.lon}|${area.radiusKm}`} area={area} onAreaChange={onAreaChange} />
        )}

        <div className="flex gap-2 border-t border-slate-800/80 pt-2.5">
          <button
            type="button"
            onClick={onDownloadCsv}
            disabled={downloading}
            data-testid="selection-download-csv"
            className={`${BUTTON} border-orange-600 bg-orange-600 text-white hover:bg-orange-500`}
          >
            {downloading ? 'Preparing…' : 'CSV'}
          </button>
          <button
            type="button"
            onClick={downloadGeoJson}
            disabled={loading}
            data-testid="selection-download-geojson"
            className={`${BUTTON} border-slate-700 bg-slate-800/80 text-slate-100 hover:bg-slate-800`}
          >
            GeoJSON
          </button>
          <button
            type="button"
            onClick={() => onAreaChange(null)}
            data-testid="selection-clear"
            className={`${BUTTON} border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800/60 hover:text-white`}
          >
            Clear
          </button>
        </div>
      </div>
    </section>
  )
}
