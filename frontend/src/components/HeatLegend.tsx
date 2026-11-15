import { Skeleton } from '@/components/ui/skeleton'
import { RAMP, heatVar } from '../utils/calendar'

/** The heat scale with its ends named: "0" (its own swatch, outlined: no detections) to "N / unit" (log scale in between). */
export function HeatLegend({ max, unit, loading = false }: { max: number; unit: 'day' | 'month'; loading?: boolean }) {
  const [zero, ...steps] = RAMP.map((_, i) => i)
  return (
    <div
      className="flex items-center gap-2 text-xs text-muted-foreground"
      role="img"
      aria-label={`Colour scale, logarithmic: 0 detections to ${max.toLocaleString('en-US')} per ${unit}`}
      data-testid="heat-legend"
    >
      <span className="size-2.5 shrink-0 rounded-[2px] ring-1 ring-border" style={{ background: heatVar(zero) }} />
      <span className="font-mono tabular-nums">0</span>
      <span className="flex items-center gap-px">
        {steps.map((i) => (
          <span key={i} className="h-2.5 w-5 rounded-[2px]" style={{ background: heatVar(i) }} />
        ))}
      </span>
      {loading ? <Skeleton className="h-3 w-14" /> : <span className="font-mono tabular-nums">{max.toLocaleString('en-US')} / {unit}</span>}
      <span>log scale</span>
    </div>
  )
}
