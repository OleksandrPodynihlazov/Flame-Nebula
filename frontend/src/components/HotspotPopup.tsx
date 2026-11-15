import { SENSORS, typeMeta } from "../constants/fire";
import type { HotspotProperties } from "../types/api";

/** Body of the popup that opens when a single hotspot dot is clicked. The card chrome comes from the Leaflet popup CSS in index.css. */
export function HotspotPopup({ p }: { p: HotspotProperties }) {
  const meta = typeMeta(p.type);
  return (
    <div className="flex min-w-[210px] flex-col gap-2 pr-5 text-xs">
      <div className="flex items-center gap-2 border-b border-border pb-2 font-medium text-foreground">
        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: meta.color }} />
        {p.type === null ? meta.label : `Type ${p.type} · ${meta.label}`}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Date (UTC)</dt>
        <dd className="text-right font-mono text-foreground tabular-nums">
          {p.acq_date} {p.acq_time.slice(0, 2)}:{p.acq_time.slice(2)}
        </dd>
        <dt className="text-muted-foreground">Lat, lon</dt>
        <dd className="text-right font-mono text-foreground tabular-nums">
          {p.latitude}, {p.longitude}
        </dd>
        <dt className="text-muted-foreground">Sensor</dt>
        <dd className="text-right text-foreground">
          {p.sensor} ({p.satellite}) · {SENSORS[p.sensor].pixel}
        </dd>
        <dt className="text-muted-foreground">Pass</dt>
        <dd className="text-right text-foreground">{p.daynight === "D" ? "Day" : "Night"}</dd>
        <dt className="text-muted-foreground">FRP</dt>
        <dd className="text-right font-mono text-foreground tabular-nums">{p.frp ?? "—"} MW</dd>
        <dt className="text-muted-foreground">Confidence</dt>
        <dd className="text-right font-mono text-foreground tabular-nums">{p.confidence ?? "—"}%</dd>
      </dl>
    </div>
  );
}
