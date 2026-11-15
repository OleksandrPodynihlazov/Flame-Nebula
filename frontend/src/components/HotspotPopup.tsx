import { SENSORS, typeMeta } from "../constants/fire";
import type { HotspotProperties } from "../types/api";
import { confidenceSummary, reasonPhrases, sensorConfidence } from "../utils/confidence";

/** Body of the popup that opens when a single hotspot dot is clicked. The card chrome comes from the Leaflet popup CSS in index.css. */
export function HotspotPopup({ p }: { p: HotspotProperties }) {
  const meta = typeMeta(p.type);
  const summary = confidenceSummary(p);
  const reasons = reasonPhrases(p.confidence_reasons);
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
        <dd className="text-right font-mono text-foreground tabular-nums">{sensorConfidence(p)}</dd>
        <dt className="text-muted-foreground">Fire confidence</dt>
        <dd className="text-right text-foreground" data-testid="popup-confidence">
          {summary.kind === "unscored" && "No score yet"}
          {summary.kind === "non_fire" && `Not a fire · ${summary.noun}`}
          {summary.kind === "scored" && (
            <>
              {summary.label}
              {summary.score !== null && (
                <>
                  {" · "}
                  <span className="font-mono tabular-nums">{summary.score}</span>
                </>
              )}
            </>
          )}
        </dd>
      </dl>
      {reasons.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-muted-foreground" data-testid="popup-reasons">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {p.worldview_url && (
        <a
          href={p.worldview_url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit !text-muted-foreground underline underline-offset-2 outline-none hover:!text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          View in NASA Worldview
        </a>
      )}
    </div>
  );
}
