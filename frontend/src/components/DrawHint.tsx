import { useTargetRect } from '../hooks/useTargetRect'
import type { DrawShape } from '../hooks/useGeoman'
import { FLOAT_PANEL } from './floating'
import { cn } from '@/lib/utils'

/** Geoman draws by clicking, not dragging; dragging pans the map, so say so while a tool is on. */
const DRAW_HINT: Record<DrawShape, string> = {
  Rectangle: 'Click two opposite corners',
  Polygon: 'Click to add points. Click the first point to finish.',
  Circle: 'Click the centre, then click again to set the radius.',
}

/** The last toolbar block (edit, drag, remove): geoman opens its "Cancel / Finish" strip beside the active draw button, so the hint sits below everything. */
const TOOLBAR_END = ['.leaflet-pm-toolbar.leaflet-pm-edit'] as const
const WIDTH = 208
const GAP = 8
const MARGIN = 12

export function DrawHint({ shape }: { shape: DrawShape | null }) {
  const rect = useTargetRect(TOOLBAR_END, shape !== null)
  if (shape === null || rect === null) return null
  // Aligned to the screen edge the toolbar hugs: left on desktop, right on phone.
  const onRightEdge = rect.left > window.innerWidth / 2
  const left = Math.max(MARGIN, Math.min(onRightEdge ? rect.left + rect.width - WIDTH : rect.left, window.innerWidth - MARGIN - WIDTH))
  return (
    <p
      role="status"
      data-testid="draw-hint"
      className={cn(FLOAT_PANEL, 'pointer-events-none fixed z-[1050] flex flex-col gap-0.5 px-3 py-2 text-xs text-foreground')}
      style={{ left, top: rect.top + rect.height + GAP, width: WIDTH }}
    >
      {DRAW_HINT[shape]}
      <span className="text-muted-foreground max-lg:hidden">Esc to cancel</span>
    </p>
  )
}
