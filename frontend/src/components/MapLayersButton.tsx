import { useState } from 'react'
import { Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MapView } from '../types/api'
import { FLOAT_ICON_BUTTON, FLOAT_PANEL } from './floating'

const OPTIONS: { view: MapView; label: string; hint: string }[] = [
  { view: 'spots', label: 'Hotspots', hint: 'Every detection' },
  { view: 'patterns', label: 'Patterns', hint: 'Where fire recurs' },
]

/** Mini previews of the two views, drawn with the heat tokens. */
function Thumb({ view }: { view: MapView }) {
  if (view === 'spots') {
    return (
      <svg viewBox="0 0 48 36" className="size-full" aria-hidden="true">
        <rect width="48" height="36" className="fill-muted" />
        {[
          [10, 9, 3, 'fill-heat-4'],
          [20, 14, 5, 'fill-heat-5'],
          [33, 8, 2.5, 'fill-heat-4'],
          [28, 24, 4, 'fill-heat-6'],
          [14, 26, 2.5, 'fill-heat-4'],
          [39, 20, 3, 'fill-heat-4'],
        ].map(([x, y, r, fill]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} className={`${fill} stroke-background`} strokeWidth="0.8" />
        ))}
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 48 36" className="size-full" aria-hidden="true">
      <rect width="48" height="36" className="fill-muted" />
      {[
        [8, 8, 'fill-heat-6'],
        [16, 8, 'fill-heat-4'],
        [16, 16, 'fill-heat-2'],
        [24, 16, 'fill-heat-4'],
        [24, 24, 'fill-heat-5'],
        [32, 16, 'fill-heat-6'],
        [8, 16, 'fill-heat-5'],
        [32, 24, 'fill-heat-4'],
      ].map(([x, y, fill]) => (
        <rect key={`${x}-${y}`} x={x as number} y={y as number} width="7" height="7" className={fill as string} opacity="0.9" />
      ))}
    </svg>
  )
}

/** Layer switch: an icon button in the map's control column that opens a card menu with a preview of each view. */
export function MapLayersButton({
  view,
  onChange,
  menuSide,
}: {
  view: MapView
  onChange: (v: MapView) => void
  /** Which side of the button the menu opens on. */
  menuSide: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={cn('relative flex items-start gap-2', menuSide === 'left' && 'flex-row-reverse')}>
      <Button
        type="button"
        variant="secondary"
        size="icon-lg"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Map layers"
        data-testid="layers-button"
        className={FLOAT_ICON_BUTTON}
      >
        <Layers aria-hidden="true" />
      </Button>
      {open && (
        <div role="menu" className={cn(FLOAT_PANEL, 'flex gap-1 p-1.5')}>
          {OPTIONS.map((o) => {
            const active = view === o.view
            return (
              <button
                key={o.view}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                data-testid={`layer-${o.view}`}
                onClick={() => {
                  onChange(o.view)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-[5.5rem] flex-col items-center gap-1 rounded-md p-1.5 text-center outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                  active && 'bg-accent',
                )}
              >
                <span className={cn('block h-11 w-16 overflow-hidden rounded-md border-2', active ? 'border-primary' : 'border-border')}>
                  <Thumb view={o.view} />
                </span>
                <span className={cn('text-xs font-medium', active ? 'text-primary' : 'text-foreground')}>{o.label}</span>
                <span className="text-[11px] leading-tight text-muted-foreground">{o.hint}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
