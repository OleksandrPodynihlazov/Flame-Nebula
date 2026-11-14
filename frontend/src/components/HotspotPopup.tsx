import { SENSORS, typeMeta } from "../constants/fire";
import type { HotspotProperties } from "../types/api";

/** Body of the popup that opens when a single hotspot dot is clicked. */
export function HotspotPopup({ p }: { p: HotspotProperties }) {
  const meta = typeMeta(p.type);
  return (
    <div className="min-w-[190px] space-y-1.5 text-xs">
      <div
        className="border-b border-slate-700/80 pb-1 font-semibold"
        style={{ color: meta.color }}
      >
        {p.type === null ? meta.label : `Type ${p.type}: ${meta.label}`}
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
          {p.sensor} ({p.satellite}) · {SENSORS[p.sensor].pixel}
        </dd>
        <dt className="text-slate-400">Pass · FRP</dt>
        <dd className="text-right font-mono">
          {p.daynight === "D" ? "Day" : "Night"} · {p.frp ?? "—"} MW
        </dd>
        <dt className="text-slate-400">Confidence</dt>
        <dd className="text-right font-mono">{p.confidence ?? "—"}%</dd>
      </dl>
    </div>
  );
}
