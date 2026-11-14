import "leaflet/dist/leaflet.css";
import { useMemo, useState, type ReactNode } from "react";
import type { ControlPosition, FitBoundsOptions } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Pane,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from "react-leaflet";
import { FIRE_TYPES, ITALY_BOUNDS, SENSORS } from "../constants/fire";
import { HOTSPOT_PANE, useGeoman } from "../hooks/useGeoman";
import type { Area, HotspotCollection, Sensor } from "../types/api";
import { MapLegend, SideLegend } from "./MapLegend";
import { SelectionPanel } from "./SelectionPanel";

function DrawTools({
  area,
  onAreaChange,
  position,
}: {
  area: Area | null;
  onAreaChange: (area: Area | null) => void;
  position: ControlPosition;
}) {
  useGeoman(area, onAreaChange, position);
  return null;
}

function ResetView({ options }: { options?: FitBoundsOptions }) {
  const map = useMap();
  return (
    <button
      type="button"
      onClick={() => map.fitBounds(ITALY_BOUNDS, options)}
      className="ml-1 shrink-0 whitespace-nowrap text-[11px] text-slate-400 underline decoration-slate-600 hover:text-white"
    >
      Reset view
    </button>
  );
}

interface Props {
  data: HotspotCollection | null;
  loading: boolean;
  label: string;
  sensors: Sensor[];
  area: Area | null;
  onAreaChange: (area: Area | null) => void;
  fileTag: string;
  downloading: boolean;
  onDownloadCsv: () => void;
  mobile?: boolean;
  children?: ReactNode;
}

export function HotspotMap({
  data,
  loading,
  label,
  sensors,
  area,
  onAreaChange,
  fileTag,
  downloading,
  onDownloadCsv,
  mobile = false,
  children,
}: Props) {
  const features = useMemo(
    () =>
      [...(data?.features ?? [])].sort(
        (a, b) => SENSORS[b.properties.sensor].radius - SENSORS[a.properties.sensor].radius,
      ),
    [data],
  );
  const [legendOpen, setLegendOpen] = useState(!mobile);
  const fitOptions: FitBoundsOptions | undefined = mobile
    ? { paddingTopLeft: [0, 48], paddingBottomRight: [0, 96] }
    : undefined;

  return (
    <section
      className={
        mobile
          ? "relative min-h-0 flex-1"
          : "relative h-full w-[45%] shrink-0 border-r border-slate-800"
      }
    >
      <MapContainer
        bounds={ITALY_BOUNDS}
        boundsOptions={fitOptions}
        zoomControl={false}
        preferCanvas
        className="z-10 h-full w-full"
      >
        {!mobile && <ZoomControl position="topleft" />}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri"
          maxZoom={16}
        />

        <Pane name={HOTSPOT_PANE} style={{ zIndex: 450 }}>
          {features.map(({ properties: p }) => {
            const meta = FIRE_TYPES[p.type];
            return (
              <CircleMarker
                key={p.id}
                center={[p.latitude, p.longitude]}
                radius={SENSORS[p.sensor].radius}
                pmIgnore
                pathOptions={{
                  fillColor: meta.color,
                  color: "#020617",
                  weight: 0.5,
                  opacity: 0.9,
                  fillOpacity: p.sensor === "VIIRS" ? 0.95 : 0.75,
                }}
              >
                <Popup
                  autoPanPaddingTopLeft={mobile ? [12, 56] : undefined}
                  autoPanPaddingBottomRight={mobile ? [12, 140] : undefined}
                >
                  <div className="min-w-[190px] space-y-1.5 text-xs">
                    <div
                      className="border-b border-slate-700/80 pb-1 font-semibold"
                      style={{ color: meta.color }}
                    >
                      Type {p.type}: {meta.label}
                    </div>
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                      <dt className="text-slate-400">Date (UTC)</dt>
                      <dd className="text-right font-mono">
                        {p.acq_date} {p.acq_time.slice(0, 2)}:
                        {p.acq_time.slice(2)}
                      </dd>
                      <dt className="text-slate-400">Lat, lon</dt>
                      <dd className="text-right font-mono">
                        {p.latitude}, {p.longitude}
                      </dd>
                      <dt className="text-slate-400">Sensor</dt>
                      <dd className="text-right">
                        {p.sensor} ({p.satellite}) · {SENSORS[p.sensor].pixel}
                      </dd>
                      <dt className="text-slate-400">Pass · FRP</dt>
                      <dd className="text-right font-mono">
                        {p.daynight === "D" ? "Day" : "Night"} · {p.frp ?? "—"}{" "}
                        MW
                      </dd>
                      <dt className="text-slate-400">Confidence</dt>
                      <dd className="text-right font-mono">
                        {p.confidence ?? "—"}%
                      </dd>
                    </dl>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </Pane>

        <DrawTools
          area={area}
          onAreaChange={onAreaChange}
          position={mobile ? "topright" : "topleft"}
        />

        <div
          className={`absolute top-3 z-[1000] flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/90 px-3 py-1.5 shadow-xl backdrop-blur-md ${
            mobile ? "left-3 max-w-[calc(100%-4.5rem)]" : "left-12"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full bg-orange-500 ${loading ? "animate-pulse" : ""}`}
          />
          <span
            className="truncate text-xs font-medium text-slate-100"
            aria-live="polite"
          >
            {label} ·{" "}
            {loading
              ? "loading…"
              : `${features.length.toLocaleString()} hotspots`}
          </span>
          <ResetView options={fitOptions} />
        </div>
      </MapContainer>

      {mobile ? (
        <SideLegend
          open={legendOpen}
          onToggle={() => setLegendOpen((o) => !o)}
          sensors={sensors}
        />
      ) : (
        <MapLegend
          open={legendOpen}
          onToggle={() => setLegendOpen((o) => !o)}
          sensors={sensors}
        />
      )}

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

      {children}
    </section>
  );
}
