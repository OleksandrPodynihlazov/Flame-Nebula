import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { USE_MOCKS, downloadBlob, fetchHotspots } from '../api/client'
import { ALL_TYPES, FIRE_TYPES, MONTHS, MONTHS_FULL } from '../constants/fire'
import type { ApiQuery, Area, SelectionSummaryResponse } from '../types/api'
import { selectionGeoJson } from '../utils/selectionExport'
import { formatAreaKm2, selectionSummary } from '../utils/selectionSummary'
import { FLOAT_PANEL } from './floating'

type CircleArea = Extract<Area, { kind: 'circle' }>

interface Props {
  area: Area
  /** `GET /api/selection-summary` for the area; null until the first answer. */
  summary: SelectionSummaryResponse | null
  loading: boolean
  /** Failed summary request: shown instead of the numbers. */
  error: string | null
  /** Filters + area; the GeoJSON export loads the area's dots with it on click. */
  query: ApiQuery
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
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-mono text-foreground tabular-nums" data-testid={testId}>
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
    <fieldset className="flex flex-col gap-1.5">
      <legend className="sr-only">Circle center and radius</legend>
      <div className="grid grid-cols-3 gap-2">
        {FIELDS.map((f) => {
          const invalid = parsed[f.key] === null
          return (
            <label key={f.key} className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
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
                className={cn(
                  'h-11 w-full min-w-0 rounded-md border bg-background/60 px-2 font-mono text-xs text-foreground tabular-nums outline-none focus-visible:ring-2 lg:h-8',
                  invalid ? 'border-destructive focus-visible:ring-destructive/50' : 'border-input focus-visible:ring-ring',
                )}
              />
            </label>
          )
        })}
      </div>
      {errors.length > 0 && (
        <ul id="circle-input-errors" aria-live="polite" className="text-xs text-destructive">
          {errors.map((f) => (
            <li key={f.key}>{f.error}</li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}

export function SelectionPanel({ area, summary, loading, error, query, fileTag, downloading, onDownloadCsv, onAreaChange }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<{ queryKey: string; message: string } | null>(null)
  const queryKey = JSON.stringify(query)
  // Never show the previous area's numbers under a failed request.
  const s = useMemo(() => selectionSummary(area, error ? null : summary), [area, summary, error])
  const areaText = `${formatAreaKm2(s.areaKm2)} km²`
  const countText = loading ? '…' : error ? '—' : fmt(s.count)
  // An export error belongs to the filters it was made with.
  const geoJsonError = exportError?.queryKey === queryKey ? exportError.message : null

  // The dots are loaded only here, on click: the card itself needs only the summary.
  const downloadGeoJson = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const { features } = await fetchHotspots(query)
      const json = JSON.stringify(selectionGeoJson(area, features))
      const name = `firms_italy_${fileTag}_area${USE_MOCKS ? '_DEMO' : ''}.geojson`
      downloadBlob(new Blob([json], { type: 'application/geo+json' }), name)
    } catch (err: unknown) {
      setExportError({ queryKey, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setExporting(false)
    }
  }

  return (
    <section
      aria-label="Selected area"
      data-testid="selection-panel"
      aria-busy={loading}
      className={cn(
        FLOAT_PANEL,
        'absolute top-16 right-16 left-[68px] z-20 flex max-h-[calc(100%-5rem)] flex-col overflow-hidden lg:top-[10px] lg:right-[calc(var(--panel-inset,0px)+10px)] lg:left-auto lg:max-h-[calc(100%-6rem)] lg:w-72',
      )}
    >
      <div className="flex items-stretch lg:hidden">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-controls="selection-details"
          data-testid="selection-toggle"
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 py-2 pr-1 pl-3 text-xs text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" />
            <span className="truncate font-medium">
              {area.kind === 'region' && <>{area.name} · </>}
              <span className="font-mono tabular-nums">{countText}</span> hotspots · <span className="font-mono tabular-nums">{areaText}</span>
            </span>
          </span>
          {expanded ? (
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onAreaChange(null)}
          aria-label="Clear selection"
          data-testid="selection-clear-compact"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <h2 className="hidden items-start gap-2 px-3 pt-3 text-sm font-medium text-foreground lg:flex">
        <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
        {area.kind === 'region' ? (
          <span className="min-w-0" data-testid="selection-region">
            <span className="block truncate">{area.name}</span>
            {area.path && <span className="block truncate text-xs font-normal text-muted-foreground">{area.path}</span>}
          </span>
        ) : (
          'Selected area'
        )}
      </h2>

      <div
        id="selection-details"
        className={cn('flex-col gap-3 overflow-y-auto px-3 pt-2 pb-3 lg:flex', expanded ? 'flex' : 'hidden', loading && 'opacity-60')}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
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

        {error && !loading && (
          <p role="alert" className="text-xs text-destructive" data-testid="selection-error">
            {error}
          </p>
        )}

        {geoJsonError && (
          <p role="alert" className="text-xs text-destructive" data-testid="selection-export-error">
            GeoJSON: {geoJsonError}
          </p>
        )}

        {s.count === 0 && !loading && !error && (
          <p className="text-xs text-muted-foreground" data-testid="selection-empty">
            No hotspots in this area
          </p>
        )}

        {s.count > 0 && (
          <>
            <Separator />
            <ul className="flex flex-col gap-1 text-xs" aria-label="Hotspots by type">
              {ALL_TYPES.filter((t) => s.byType[t] > 0).map((t) => (
                <li key={t} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: FIRE_TYPES[t].color }} />
                    {FIRE_TYPES[t].label}
                  </span>
                  <span className="font-mono text-foreground tabular-nums">{fmt(s.byType[t])}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {area.kind === 'circle' && (
          <>
            <Separator />
            <CircleInputs key={`${area.lat}|${area.lon}|${area.radiusKm}`} area={area} onAreaChange={onAreaChange} />
          </>
        )}

        <Separator />
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={onDownloadCsv}
            disabled={downloading}
            data-testid="selection-download-csv"
            className="flex-1 max-lg:h-11"
          >
            {downloading ? 'Preparing…' : 'CSV'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void downloadGeoJson()}
            disabled={loading || error !== null || exporting}
            aria-busy={exporting}
            data-testid="selection-download-geojson"
            className="flex-1 max-lg:h-11"
          >
            {exporting ? 'Preparing…' : 'GeoJSON'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onAreaChange(null)} data-testid="selection-clear" className="flex-1 max-lg:h-11">
            Clear
          </Button>
        </div>
      </div>
    </section>
  )
}
