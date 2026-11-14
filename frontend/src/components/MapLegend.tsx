import { ALL_TYPES, FIRE_TYPES } from '../constants/fire'

export function MapLegend({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="absolute bottom-5 left-3 z-20 max-w-[240px] overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/90 shadow-xl backdrop-blur-md">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800/60"
      >
        FIRMS hotspot types
        <span className="text-[10px] text-slate-400">{open ? '▼' : '▲'}</span>
      </button>
      {open && (
        <ul className="space-y-1.5 border-t border-slate-800/80 px-3 pt-1 pb-2.5 text-[11px]">
          {ALL_TYPES.map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: FIRE_TYPES[t].color }} />
              <span className="text-slate-200">
                <strong className="font-mono text-slate-400">{t}</strong> {FIRE_TYPES[t].label}
                {FIRE_TYPES[t].noise && <span className="text-slate-500"> · noise</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
