import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import L, { type ControlPosition, type FitBoundsOptions } from "leaflet";
import { MapContainer, TileLayer, ZoomControl, useMap } from "react-leaflet";
import { COMPARE_COLORS } from "../constants/compare";
import { ITALY_BOUNDS, MONTHS_FULL } from "../constants/fire";
import { HOTSPOT_PANE, HOTSPOT_PANE_B, useGeoman } from "../hooks/useGeoman";
import { useHotspotLayer } from "../hooks/useHotspotLayer";
import { usePatternLayer } from "../hooks/usePatternLayer";
import { useViewportData } from "../hooks/useViewportData";
import type { ApiQuery, Area, MapView, PatternCell, SelectionSummaryResponse, Sensor } from "../types/api";
import { FLOAT_PANEL } from "./floating";
import { MapLayersButton } from "./MapLayersButton";
import { MapLegend, MobileLegend } from "./MapLegend";
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

function StatusChip({
  error,
  pulsing,
  mobile,
  fitOptions,
  testId,
  children,
}: {
  error: boolean;
  pulsing: boolean;
  mobile: boolean;
  fitOptions?: FitBoundsOptions;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        FLOAT_PANEL,
        "absolute top-3 z-[1000] flex h-11 items-center gap-2 pl-3 lg:top-[10px] lg:h-9",
        error && "border-destructive/60",
        // An error chip stops short of the selection card at the map's top right, so its button is never covered.
        mobile ? "left-3 max-w-[calc(100%-4.5rem)]" : error ? "left-[54px] max-w-[28rem]" : "left-[54px] max-w-[calc(100%-4rem)]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", error ? "bg-destructive" : "bg-primary", pulsing && "animate-pulse")}
      />
      {children}
      {mobile && <ResetView options={fitOptions} />}
    </div>
  );
}

/** Slim indeterminate bar along the top edge of the map while hotspots load. Static (full width, dimmed) under reduced motion. */
function MapProgress({ loading }: { loading: boolean }) {
  if (!loading) return null
  return (
    <div
      role="progressbar"
      aria-label="Loading map data"
      data-testid="map-progress"
      className="pointer-events-none absolute inset-x-0 top-0 z-[1000] h-0.5 overflow-hidden bg-primary/20"
    >
      <div className="h-full w-1/3 bg-primary motion-safe:animate-map-progress motion-reduce:w-full motion-reduce:opacity-60" />
    </div>
  );
}

function MapStatus({
  label,
  total,
  totalLoading,
  loading,
  error,
  onRetry,
  mobile,
  fitOptions,
}: {
  label: string;
  total: number | null;
  totalLoading: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  mobile: boolean;
  fitOptions?: FitBoundsOptions;
}) {
  // Desktop: the stats panel already shows the totals and loading, so the pill only appears for an error.
  if (!mobile && error === null) return null;
  return (
    <StatusChip error={error !== null} pulsing={loading || totalLoading} mobile={mobile} fitOptions={fitOptions}>
      {error ? (
        <>
          <span role="alert" data-testid="map-error" className="truncate text-xs font-medium text-destructive" title={error}>
            Map: {error}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry} className="shrink-0 max-lg:h-9 lg:mr-1 lg:h-7">
            Try again
          </Button>
        </>
      ) : (
        <span className="truncate text-xs text-muted-foreground" aria-live="polite">
          {label} ·{" "}
          {totalLoading || total === null ? (
            "loading…"
          ) : (
            <>
              <span className="font-mono font-medium text-foreground tabular-nums">{total.toLocaleString()}</span> hotspots
            </>
          )}
        </span>
      )}
    </StatusChip>
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
  return <MapProgress loading={side.loading} />;
}

function PatternLabel({ side }: { side: PatternSide }) {
  return (
    <span className="text-muted-foreground">
      <span className="font-medium text-foreground">{MONTHS_FULL[side.month - 1]}</span>
      {" · "}
      <span className="font-mono tabular-nums">{side.loading || side.cells === null ? "…" : `${side.cells.length.toLocaleString()} cells`}</span>
    </span>
  );
}

function PatternStatus({ side, mobile, fitOptions }: { side: PatternSide; mobile: boolean; fitOptions?: FitBoundsOptions }) {
  const text = side.loading || side.cells === null ? "loading…" : `${side.cells.length.toLocaleString()} cells burned ≥12 of 14 years`;
  return (
    <StatusChip error={side.error !== null} pulsing={side.loading} mobile={mobile} fitOptions={fitOptions} testId="pattern-status">
      {side.error ? (
        <span role="alert" className="truncate text-xs font-medium text-destructive" title={side.error}>
          Patterns: {side.error}
        </span>
      ) : (
        <span className="truncate text-xs text-muted-foreground" aria-live="polite">
          Patterns · {MONTHS_FULL[side.month - 1]} · {text}
        </span>
      )}
    </StatusChip>
  );
}

/** Loads the visible area for one compare year and draws it into its own pane. */
function CompareLayer({ query, pane, mobile }: { query: ApiQuery; pane: string; mobile: boolean }) {
  const { data, loading } = useViewportData(query);
  useHotspotLayer(data, loading && data !== null, mobile, pane);
  return <MapProgress loading={loading} />;
}

function CompareLabel({ year, total, loading }: CompareView["a"]) {
  return (
    <span className="text-muted-foreground">
      <span className="font-mono font-medium text-foreground tabular-nums">{year}</span>
      {" · "}
      <span className="font-mono tabular-nums">{loading || total === null ? "…" : total.toLocaleString()}</span>
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
  const { data, loading, error, reload } = useViewportData(query);
  // Old view's data is drawn dimmed until the new view arrives; a failed request draws nothing.
  useHotspotLayer(data, loading && data !== null, mobile);
  return (
    <>
      <MapProgress loading={loading} />
      <MapStatus {...status} loading={loading} error={error} onRetry={reload} mobile={mobile} />
    </>
  );
}

function ResetView({ options }: { options?: FitBoundsOptions }) {
  const map = useMap();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => map.fitBounds(ITALY_BOUNDS, options)}
      className="h-full shrink-0 rounded-l-none rounded-r-[7px] px-3 text-muted-foreground max-lg:w-11 max-lg:px-0 lg:mr-1 lg:h-7 lg:rounded-lg lg:px-2"
    >
      <RotateCcw data-icon="inline-start" aria-hidden="true" />
      <span className="max-lg:sr-only">Reset view</span>
    </Button>
  );
}

/** Desktop reset: an icon button stacked under the zoom +/- in Leaflet's top-left corner, so it stays aligned with it. */
function ResetControl({ options }: { options?: FitBoundsOptions }) {
  const map = useMap();
  const [bar] = useState(() => {
    const el = L.DomUtil.create("div", "leaflet-bar leaflet-control");
    L.DomEvent.disableClickPropagation(el);
    return el;
  });

  useEffect(() => {
    const control = new L.Control({ position: "topleft" });
    control.onAdd = () => bar;
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map, bar]);

  return createPortal(
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Reset view"
          onClick={() => map.fitBounds(ITALY_BOUNDS, options)}
          className="flex size-9 items-center justify-center rounded-[7px] text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">Reset view</TooltipContent>
    </Tooltip>,
    bar,
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
  /** Selection card numbers from `/api/selection-summary` (only loaded while the card is shown). */
  selection: { summary: SelectionSummaryResponse | null; loading: boolean; error: string | null; onRetry: () => void };
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
  const [legendOpen, setLegendOpen] = useState(false);
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
        zoomSnap={0.25}
        preferCanvas
        className="z-10 h-full w-full"
      >
        {!mobile && <ZoomControl position="topleft" />}
        {!mobile && <ResetControl options={fitOptions} />}
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
        <div className="absolute top-16 left-3 z-[1000] flex flex-col items-start gap-2">
          {onViewChange && <MapLayersButton view={view} onChange={onViewChange} menuSide="right" />}
          <MobileLegend sensors={sensors} patterns={showPatterns} />
        </div>
      ) : (
        <>
          <MapLegend open={legendOpen} onToggle={() => setLegendOpen((o) => !o)} sensors={sensors} patterns={showPatterns} />
          {onViewChange && (
            <div className="absolute right-[calc(var(--panel-inset,0px)+10px)] bottom-9 z-[1000]">
              <MapLayersButton view={view} onChange={onViewChange} menuSide="left" />
            </div>
          )}
        </>
      )}

      {area && !compare && !showPatterns && (
        <SelectionPanel
          area={area}
          summary={selection.summary}
          loading={selection.loading}
          error={selection.error}
          onRetry={selection.onRetry}
          query={query}
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
