import { patternColor } from '../utils/patterns'
import { ALL_TYPES, FIRE_TYPES, SENSORS, UNCLASSIFIED } from '../constants/fire'
import type { Sensor } from '../types/api'

function PatternLegendList() {
  return (
    <div className="space-y-2 text-[11px] text-slate-300">
      <div className="h-2.5 w-44 rounded-full" style={{ background: `linear-gradient(90deg, ${patternColor(0)}, ${patternColor(0.5)}, ${patternColor(1)})` }} />
      <div className="flex w-44 justify-between font-mono text-[10px] text-slate-400">
        <span>12/14</span>
        <span>13/14</span>
        <span>14/14</span>
      </div>
      <p className="max-w-44 text-slate-400">Years this 0.1° cell burned in the month (S-NPP, 2012–2025). Only cells that burned in at least 12 years are shown.</p>
    </div>
  )
}

function LegendList({ sensors }: { sensors: Sensor[] }) {
  return (
    <div className="space-y-2">
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
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: UNCLASSIFIED.color }} />
          <span className="text-slate-200">
            <strong className="font-mono text-slate-400">–</strong> {UNCLASSIFIED.label}
            <span className="text-slate-500"> · NRT</span>
          </span>
        </li>
      </ul>
      <ul className="space-y-1.5 border-t border-slate-800/80 pt-2 text-[11px]">
        {sensors.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className="flex w-3 shrink-0 justify-center">
              <span
                className="rounded-full border border-slate-950 bg-slate-300"
                style={{ width: SENSORS[s].radius * 2, height: SENSORS[s].radius * 2 }}
              />
            </span>
            <span className="text-slate-200">
              {s} <span className="text-slate-500">· {SENSORS[s].pixel} pixel</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface LegendProps {
  open: boolean
  onToggle: () => void
  sensors: Sensor[]
  patterns?: boolean
}

export function MapLegend({ open, onToggle, sensors, patterns = false }: LegendProps) {
  return (
    <div className="absolute bottom-5 left-3 z-20 max-w-[240px] overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/90 shadow-xl backdrop-blur-md">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800/60"
      >
        {patterns ? 'Recurring fire' : 'FIRMS hotspot types'}
        <span className="text-[10px] text-slate-400">{open ? '▼' : '▲'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-800/80 px-3 pt-1 pb-2.5">
          {patterns ? <PatternLegendList /> : <LegendList sensors={sensors} />}
        </div>
      )}
    </div>
  )
}

export function SideLegend({ open, onToggle, sensors, patterns = false }: LegendProps) {
  return (
    <div
      className={`absolute top-1/2 left-0 z-[1000] flex -translate-y-1/2 items-center transition-transform duration-200 ${
        open ? 'translate-x-0' : '-translate-x-[calc(100%-28px)]'
      }`}
    >
      <div className="rounded-r-xl border border-l-0 border-slate-700/80 bg-slate-900/90 px-3 py-2.5 shadow-xl backdrop-blur-md">
        <p className="mb-2 text-[11px] font-semibold text-slate-200">{patterns ? 'Recurring fire' : 'FIRMS hotspot types'}</p>
        {patterns ? <PatternLegendList /> : <LegendList sensors={sensors} />}
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
