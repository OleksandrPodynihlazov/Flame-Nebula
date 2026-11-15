import "leaflet/dist/leaflet.css";
import { useState, type CSSProperties, type ReactNode } from "react";
import type { ControlPosition, FitBoundsOptions } from "leaflet";
import { MapContainer, TileLayer, ZoomControl, useMap } from "react-leaflet";
import { COMPARE_COLORS } from "../constants/compare";
import { ITALY_BOUNDS, MONTHS_FULL } from "../constants/fire";
import { HOTSPOT_PANE, HOTSPOT_PANE_B, useGeoman } from "../hooks/useGeoman";
import { useHotspotLayer } from "../hooks/useHotspotLayer";
import { usePatternLayer } from "../hooks/usePatternLayer";
import { useViewportData } from "../hooks/useViewportData";
import type { ApiQuery, Area, HotspotFeature, MapView, PatternCell, Sensor } from "../types/api";
import { MapLayersButton } from "./MapLayersButton";
import { MapLegend, SideLegend } from "./MapLegend";
import { RegionOutline } from "./RegionOutline";
import { SelectionPanel } from "./SelectionPanel";
import { SwipeCompare } from "./compare/SwipeCompare";

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

function MapStatus({
  label,
  total,
  totalLoading,
  loading,
  error,
  mobile,
  fitOptions,
}: {
  label: string;
  total: number | null;
  totalLoading: boolean;
  loading: boolean;
  error: string | null;
  mobile: boolean;
  fitOptions?: FitBoundsOptions;
}) {
  return (
    <div
      className={`absolute top-3 z-[1000] flex items-center gap-2 rounded-lg border bg-slate-900/90 px-3 py-1.5 shadow-xl backdrop-blur-md ${
        error ? "border-rose-500/60" : "border-slate-700/80"
      } ${mobile ? "left-3 max-w-[calc(100%-4.5rem)]" : "left-12 max-w-[calc(100%-4rem)]"}`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${error ? "bg-rose-500" : "bg-orange-500"} ${
          loading || totalLoading ? "animate-pulse" : ""
        }`}
      />
      {error ? (
        <span role="alert" data-testid="map-error" className="truncate text-xs font-medium text-rose-200" title={error}>
          Map: {error}
        </span>
      ) : (
        <span className="truncate text-xs font-medium text-slate-100" aria-live="polite">
          {label} · {totalLoading || total === null ? "loading…" : `${total.toLocaleString()} hotspots`}
        </span>
      )}
      <ResetView options={fitOptions} />
    </div>
  );
}

export interface PatternSide {
  month: number;
  cells: PatternCell[] | null;
  loading: boolean;
  error: string | null;
}

export interface PatternMapView {
  a: PatternSide;
  /** Set: compare two months with the divider. */
  b: PatternSide | null;
}


function PatternLayer({ side, pane, mobile }: { side: PatternSide; pane: string; mobile: boolean }) {
  usePatternLayer(side.cells, MONTHS_FULL[side.month - 1], side.loading && side.cells !== null, mobile, pane);
  return null;
}

function PatternLabel({ side }: { side: PatternSide }) {
  return (
    <span className="font-medium text-slate-100">
      <span className="font-semibold">{MONTHS_FULL[side.month - 1]}</span>
      <span className="text-slate-400"> · {side.loading || side.cells === null ? "…" : `${side.cells.length.toLocaleString()} cells`}</span>
    </span>
  );
}

function PatternStatus({ side, mobile, fitOptions }: { side: PatternSide; mobile: boolean; fitOptions?: FitBoundsOptions }) {
  const text = side.loading || side.cells === null ? "loading…" : `${side.cells.length.toLocaleString()} cells burned ≥12 of 14 years`;
  return (
    <div
      className={`absolute top-3 z-[1000] flex items-center gap-2 rounded-lg border bg-slate-900/90 px-3 py-1.5 shadow-xl backdrop-blur-md ${
        side.error ? "border-rose-500/60" : "border-slate-700/80"
      } ${mobile ? "left-3 max-w-[calc(100%-4.5rem)]" : "left-12 max-w-[calc(100%-4rem)]"}`}
      data-testid="pattern-status"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${side.error ? "bg-rose-500" : "bg-red-600"} ${side.loading ? "animate-pulse" : ""}`} />
      {side.error ? (
        <span role="alert" className="truncate text-xs font-medium text-rose-200" title={side.error}>
          Patterns: {side.error}
        </span>
      ) : (
        <span className="truncate text-xs font-medium text-slate-100" aria-live="polite">
          Patterns · {MONTHS_FULL[side.month - 1]} · {text}
        </span>
      )}
      <ResetView options={fitOptions} />
    </div>
  );
}

/** Loads the visible area for one compare year and draws it into its own pane. */
function CompareLayer({ query, pane, mobile }: { query: ApiQuery; pane: string; mobile: boolean }) {
  const { data, loading } = useViewportData(query);
  useHotspotLayer(data, loading && data !== null, mobile, pane);
  return null;
}

function CompareLabel({ year, total, loading }: CompareView["a"]) {
  return (
    <span className="font-medium text-slate-100">
      <span className="font-mono font-semibold">{year}</span>
      <span className="text-slate-400"> · {loading || total === null ? "…" : total.toLocaleString()}</span>
    </span>
  );
}

/** Loads the visible area, draws it, and shows the status pill (both need the map context). */
function ViewportLayer({
  query,
  mobile,
  ...status
}: {
  query: ApiQuery;
  mobile: boolean;
  label: string;
  total: number | null;
  totalLoading: boolean;
  fitOptions?: FitBoundsOptions;
}) {
  const { data, loading, error } = useViewportData(query);
  // Old view's data is drawn dimmed until the new view arrives; a failed request draws nothing.
  useHotspotLayer(data, loading && data !== null, mobile);
  return <MapStatus {...status} loading={loading} error={error} mobile={mobile} />;
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

export interface CompareView {
  a: { year: number; query: ApiQuery; total: number | null; loading: boolean };
  b: { year: number; query: ApiQuery; total: number | null; loading: boolean };
}

interface Props {
  /** Filters + area for the map; the map adds its own bbox (visible area). */
  query: ApiQuery;
  /** Hotspots for the whole selection (stats total), shown in the status pill. */
  total: number | null;
  totalLoading: boolean;
  /** Whole-selection dots for the selection card (only loaded while an area is selected). */
  selection: { features: readonly HotspotFeature[]; loading: boolean; error: string | null };
  label: string;
  sensors: Sensor[];
  area: Area | null;
  onAreaChange: (area: Area | null) => void;
  fileTag: string;
  downloading: boolean;
  onDownloadCsv: () => void;
  mobile?: boolean;
  /** Set: two years side by side with a draggable divider instead of one year. */
  compare?: CompareView | null;
  /** Px of the map's right edge covered by a panel: kept out of fits and overlays. */
  rightInset?: number;
  view?: MapView;
  onViewChange?: (view: MapView) => void;
  /** Pattern view data; used instead of hotspots when `view` is 'patterns'. */
  patterns?: PatternMapView | null;
  children?: ReactNode;
}

export function HotspotMap({
  query,
  total,
  totalLoading,
  selection,
  label,
  sensors,
  area,
  onAreaChange,
  fileTag,
  downloading,
  onDownloadCsv,
  mobile = false,
  compare = null,
  rightInset = 0,
  view = "spots",
  onViewChange,
  patterns = null,
  children,
}: Props) {
  const showPatterns = view === "patterns" && patterns !== null;
  const comparing = showPatterns ? patterns.b !== null : compare !== null;
  const [legendOpen, setLegendOpen] = useState(!mobile);
  const fitOptions: FitBoundsOptions | undefined = mobile
    ? { paddingTopLeft: [0, 48], paddingBottomRight: [0, 96] }
    : { paddingTopLeft: [24, 24], paddingBottomRight: [rightInset + 24, 24] };

  return (
    <section
      className={
        mobile
          ? `relative min-h-0 flex-1 ${comparing ? "compare-mode" : ""}`
          : "relative h-full w-full"
      }
      style={{ "--panel-inset": `${rightInset}px` } as CSSProperties}
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

        {showPatterns ? (
          patterns.b ? (
            <>
              <PatternLayer side={patterns.a} pane={HOTSPOT_PANE} mobile={mobile} />
              <PatternLayer side={patterns.b} pane={HOTSPOT_PANE_B} mobile={mobile} />
              <SwipeCompare
                leftPane={HOTSPOT_PANE}
                rightPane={HOTSPOT_PANE_B}
                left={<PatternLabel side={patterns.a} />}
                right={<PatternLabel side={patterns.b} />}
                leftColor={COMPARE_COLORS.a}
                rightColor={COMPARE_COLORS.b}
                rightInset={rightInset}
              />
            </>
          ) : (
            <>
              <PatternLayer side={patterns.a} pane={HOTSPOT_PANE} mobile={mobile} />
              <PatternStatus side={patterns.a} mobile={mobile} fitOptions={fitOptions} />
            </>
          )
        ) : compare ? (
          <>
            <CompareLayer query={compare.a.query} pane={HOTSPOT_PANE} mobile={mobile} />
            <CompareLayer query={compare.b.query} pane={HOTSPOT_PANE_B} mobile={mobile} />
            <SwipeCompare
              leftPane={HOTSPOT_PANE}
              rightPane={HOTSPOT_PANE_B}
              left={<CompareLabel {...compare.a} />}
              right={<CompareLabel {...compare.b} />}
              leftColor={COMPARE_COLORS.a}
              rightColor={COMPARE_COLORS.b}
              rightInset={rightInset}
            />
          </>
        ) : (
          <ViewportLayer
            query={query}
            mobile={mobile}
            label={label}
            total={total}
            totalLoading={totalLoading}
            fitOptions={fitOptions}
          />
        )}

        <DrawTools
          area={area}
          onAreaChange={onAreaChange}
          position={mobile ? "topright" : "topleft"}
        />

        <RegionOutline area={area} fitOptions={fitOptions} />
      </MapContainer>

      {mobile ? (
        <SideLegend
          open={legendOpen}
          onToggle={() => setLegendOpen((o) => !o)}
          sensors={sensors}
          patterns={showPatterns}
        />
      ) : (
        <MapLegend
          open={legendOpen}
          onToggle={() => setLegendOpen((o) => !o)}
          sensors={sensors}
          patterns={showPatterns}
        />
      )}

      {onViewChange && (
        <MapLayersButton
          view={view}
          onChange={onViewChange}
          className={mobile ? "top-14 left-3 flex-col items-start" : "bottom-8 right-[calc(var(--panel-inset,0px)+0.75rem)] flex-row-reverse"}
        />
      )}

      {area && !compare && !showPatterns && (
        <SelectionPanel
          area={area}
          features={selection.features}
          loading={selection.loading}
          error={selection.error}
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
