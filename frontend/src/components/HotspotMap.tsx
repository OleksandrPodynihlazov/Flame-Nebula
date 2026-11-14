import "leaflet/dist/leaflet.css";
import { useMemo, useState, type ReactNode } from "react";
import type { ControlPosition, FitBoundsOptions } from "leaflet";
import { MapContainer, TileLayer, ZoomControl, useMap } from "react-leaflet";
import { ITALY_BOUNDS } from "../constants/fire";
import { useGeoman } from "../hooks/useGeoman";
import { useHotspotLayer } from "../hooks/useHotspotLayer";
import type { Area, HotspotCollection, Sensor } from "../types/api";
import { createHotspotIndex, type HotspotIndex } from "../utils/clusters";
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

function HotspotLayer({
  index,
  dimmed,
  mobile,
}: {
  index: HotspotIndex;
  dimmed: boolean;
  mobile: boolean;
}) {
  useHotspotLayer(index, dimmed, mobile);
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
  /** `data` belongs to an older query: drawn dimmed until the response arrives. */
  stale: boolean;
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
  stale,
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
  const features = data?.features ?? [];
  // Built once per hotspot data change; pan and zoom only query it.
  const index = useMemo(() => createHotspotIndex(data?.features ?? []), [data]);
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

        <HotspotLayer index={index} dimmed={stale} mobile={mobile} />

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
            {stale
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
          loading={stale}
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
