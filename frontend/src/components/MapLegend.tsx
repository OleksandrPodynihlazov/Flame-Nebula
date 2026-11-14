import { ALL_TYPES, FIRE_TYPES } from '../constants/fire'

function LegendList() {
  return (
    <ul className="space-y-1.5 text-[11px]">
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
  )
}

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
        <div className="border-t border-slate-800/80 px-3 pt-1 pb-2.5">
          <LegendList />
        </div>
      )}
    </div>
  )
}

export function SideLegend({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div
      className={`absolute top-1/2 left-0 z-[1000] flex -translate-y-1/2 items-center transition-transform duration-200 ${
        open ? 'translate-x-0' : '-translate-x-[calc(100%-28px)]'
      }`}
    >
      <div className="rounded-r-xl border border-l-0 border-slate-700/80 bg-slate-900/90 px-3 py-2.5 shadow-xl backdrop-blur-md">
        <p className="mb-2 text-[11px] font-semibold text-slate-200">FIRMS hotspot types</p>
        <LegendList />
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? 'Hide legend' : 'Show legend'}
        className="-ml-px flex h-24 w-7 items-center justify-center rounded-r-lg border border-l-0 border-slate-700/80 bg-slate-900/90 text-[10px] font-semibold tracking-widest text-slate-300 uppercase shadow-xl backdrop-blur-md [writing-mode:vertical-rl]"
      >
        Legend
      </button>
    </div>
  )
}
