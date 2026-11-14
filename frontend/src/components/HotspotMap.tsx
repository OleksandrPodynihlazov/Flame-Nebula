import 'leaflet/dist/leaflet.css'
import { useState } from 'react'
import type { ControlPosition } from 'leaflet'
import { CircleMarker, MapContainer, Pane, Popup, TileLayer, useMap } from 'react-leaflet'
import { FIRE_TYPES, ITALY_CENTER } from '../constants/fire'
import { HOTSPOT_PANE, useGeoman } from '../hooks/useGeoman'
import type { Area, HotspotCollection } from '../types/api'
import { MapLegend } from './MapLegend'
import { SelectionPanel } from './SelectionPanel'

const IS_NARROW = typeof window !== 'undefined' && window.innerWidth < 1024
const DEFAULT_ZOOM = IS_NARROW ? 5 : 6
// Narrow: the selection card spans the top, so the tools go top-right. Wide: the card sits top-right.
const TOOLBAR_POSITION: ControlPosition = IS_NARROW ? 'topright' : 'topleft'

function DrawTools({ area, onAreaChange }: { area: Area | null; onAreaChange: (area: Area | null) => void }) {
  useGeoman(area, onAreaChange, TOOLBAR_POSITION)
  return null
}

function ResetView() {
  const map = useMap()
  return (
    <button
      type="button"
      onClick={() => map.setView(ITALY_CENTER, DEFAULT_ZOOM)}
      className="ml-1 text-[11px] text-slate-400 underline decoration-slate-600 hover:text-white"
    >
      Reset view
    </button>
  )
}

interface Props {
  data: HotspotCollection | null
  loading: boolean
  label: string
  area: Area | null
  onAreaChange: (area: Area | null) => void
  fileTag: string
  downloading: boolean
  onDownloadCsv: () => void
}

export function HotspotMap({ data, loading, label, area, onAreaChange, fileTag, downloading, onDownloadCsv }: Props) {
  const features = data?.features ?? []
  const [legendOpen, setLegendOpen] = useState(true)

  return (
    <section className="relative h-[42vh] w-full shrink-0 border-b border-slate-800 lg:h-full lg:w-[45%] lg:border-r lg:border-b-0">
      <MapContainer center={ITALY_CENTER} zoom={DEFAULT_ZOOM} preferCanvas className="z-10 h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={18}
        />
        <Pane name={HOTSPOT_PANE} style={{ zIndex: 450 }}>
          {features.map(({ properties: p }) => {
            const meta = FIRE_TYPES[p.type]
            return (
              <CircleMarker
                key={p.id}
                center={[p.latitude, p.longitude]}
                radius={p.type === 0 ? 4.5 : 5.5}
                pmIgnore
                pathOptions={{ fillColor: meta.color, color: '#020617', weight: 1, opacity: 0.9, fillOpacity: 0.85 }}
              >
                <Popup>
                  <div className="min-w-[190px] space-y-1.5 text-xs">
                    <div className="border-b border-slate-700/80 pb-1 font-semibold" style={{ color: meta.color }}>
                      Type {p.type}: {meta.label}
                    </div>
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                      <dt className="text-slate-400">Date (UTC)</dt>
                      <dd className="text-right font-mono">
                        {p.acq_date} {p.acq_time.slice(0, 2)}:{p.acq_time.slice(2)}
                      </dd>
                      <dt className="text-slate-400">Lat, lon</dt>
                      <dd className="text-right font-mono">
                        {p.latitude}, {p.longitude}
                      </dd>
                      <dt className="text-slate-400">Sensor</dt>
                      <dd className="text-right">
                        {p.sensor} ({p.satellite})
                      </dd>
                      <dt className="text-slate-400">Pass · FRP</dt>
                      <dd className="text-right font-mono">
                        {p.daynight === 'D' ? 'Day' : 'Night'} · {p.frp ?? '—'} MW
                      </dd>
                      <dt className="text-slate-400">Confidence</dt>
                      <dd className="text-right font-mono">{p.confidence ?? '—'}%</dd>
                    </dl>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
        </Pane>

        <DrawTools area={area} onAreaChange={onAreaChange} />

        <div className="absolute top-3 left-12 z-[1000] flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/90 px-3 py-1.5 shadow-xl backdrop-blur-md">
          <span className={`h-2 w-2 rounded-full bg-orange-500 ${loading ? 'animate-pulse' : ''}`} />
          <span className="text-xs font-medium text-slate-100" aria-live="polite">
            {label} · {loading ? 'loading…' : `${features.length.toLocaleString()} hotspots`}
          </span>
          <ResetView />
        </div>
      </MapContainer>

      <MapLegend open={legendOpen} onToggle={() => setLegendOpen((o) => !o)} />

      {area && (
        <SelectionPanel
          area={area}
          features={features}
          loading={loading}
          fileTag={fileTag}
          downloading={downloading}
          onDownloadCsv={onDownloadCsv}
          onAreaChange={onAreaChange}
        />
      )}
    </section>
  )
}
