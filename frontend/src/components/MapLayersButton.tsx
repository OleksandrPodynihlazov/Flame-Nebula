import { useState } from 'react'
import type { MapView } from '../types/api'

const OPTIONS: { view: MapView; label: string; hint: string }[] = [
  { view: 'spots', label: 'Hotspots', hint: 'Every detection' },
  { view: 'patterns', label: 'Patterns', hint: 'Where fire recurs' },
]

function Thumb({ view }: { view: MapView }) {
  if (view === 'spots') {
    return (
      <svg viewBox="0 0 48 36" className="h-full w-full" aria-hidden="true">
        <rect width="48" height="36" fill="#1e293b" />
        {[
          [10, 9, 3],
          [20, 14, 4],
          [33, 8, 2.5],
          [28, 24, 3.5],
          [14, 26, 2.5],
          [39, 20, 3],
        ].map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#F07A2E" stroke="#020617" strokeWidth="0.8" />
        ))}
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 48 36" className="h-full w-full" aria-hidden="true">
      <rect width="48" height="36" fill="#1e293b" />
      {[
        [8, 8, '#FDE68A'],
        [16, 8, '#F97316'],
        [16, 16, '#B91C1C'],
        [24, 16, '#F97316'],
        [24, 24, '#FDBA74'],
        [32, 16, '#FDE68A'],
        [8, 16, '#FDBA74'],
        [32, 24, '#F97316'],
      ].map(([x, y, c]) => (
        <rect key={`${x}-${y}`} x={x as number} y={y as number} width="7" height="7" fill={c as string} opacity="0.85" />
      ))}
    </svg>
  )
}

/** Google Maps-style layer switch: a thumbnail of the other view, a menu of both on click. */
export function MapLayersButton({ view, onChange, className = '' }: { view: MapView; onChange: (v: MapView) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  const other = view === 'spots' ? 'patterns' : 'spots'

  return (
    <div className={`absolute z-[1000] flex items-end gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Map layers"
        data-testid="layers-button"
        className="group relative h-14 w-14 overflow-hidden rounded-xl border-2 border-white/90 shadow-xl transition-transform hover:scale-105"
      >
        <Thumb view={other} />
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-slate-950/80 py-0.5 text-[9px] font-semibold text-white">
          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" />
          </svg>
          Layers
        </span>
      </button>
      {open && (
        <div role="menu" className="flex gap-2 rounded-xl border border-slate-700/80 bg-slate-900/95 p-2 shadow-xl backdrop-blur-md">
          {OPTIONS.map((o) => (
            <button
              key={o.view}
              type="button"
              role="menuitemradio"
              aria-checked={view === o.view}
              data-testid={`layer-${o.view}`}
              onClick={() => {
                onChange(o.view)
                setOpen(false)
              }}
              className="flex w-20 flex-col items-center gap-1 text-center"
            >
              <span
                className={`block h-12 w-16 overflow-hidden rounded-lg border-2 ${
                  view === o.view ? 'border-orange-400' : 'border-transparent hover:border-slate-500'
                }`}
              >
                <Thumb view={o.view} />
              </span>
              <span className={`text-[11px] font-semibold ${view === o.view ? 'text-orange-300' : 'text-slate-200'}`}>{o.label}</span>
              <span className="text-[9px] leading-tight text-slate-500">{o.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
