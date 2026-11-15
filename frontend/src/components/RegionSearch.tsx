import { useEffect, useId, useRef, useState } from 'react'
import { fetchRegion, searchRegions } from '../api/client'
import type { Area, Region } from '../types/api'
import { italyFirst } from '../utils/regions'

const MIN_CHARS = 2
const DEBOUNCE_MS = 250

type RegionArea = Extract<Area, { kind: 'region' }>

interface Props {
  area: Area | null
  onSelect: (area: RegionArea | null) => void
}

type Status = 'idle' | 'loading' | 'done' | 'error'

/** Search bar: type a region name, pick one, and it becomes the selected area (`region=<id>`). */
export function RegionSearch({ area, onSelect }: Props) {
  const selected = area?.kind === 'region' ? area : null
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [results, setResults] = useState<Region[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [picking, setPicking] = useState(false)
  const listId = useId()
  const pickCtrl = useRef<AbortController | null>(null)

  const query = text.trim()
  const open = editing && query.length >= MIN_CHARS

  // Debounced search; stale requests are cancelled.
  useEffect(() => {
    if (!open) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      setStatus('loading')
      searchRegions(query, ctrl.signal)
        .then((regions) => {
          setResults(italyFirst(regions))
          setActive(0)
          setStatus('done')
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return
          setError(err instanceof Error ? err.message : String(err))
          setStatus('error')
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [open, query])

  useEffect(() => () => pickCtrl.current?.abort(), [])

  const pick = (r: Region) => {
    pickCtrl.current?.abort()
    const ctrl = new AbortController()
    pickCtrl.current = ctrl
    setPicking(true)
    setError(null)
    fetchRegion(r.id, ctrl.signal)
      .then((f) => {
        onSelect({ kind: 'region', id: r.id, name: r.name, path: r.path, geometry: f.geometry })
        setEditing(false)
        setText('')
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setPicking(false)
      })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setEditing(false)
      setText('')
      e.currentTarget.blur()
      return
    }
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(results[active])
    }
  }

  const value = editing ? text : (selected?.name ?? '')
  const showList = open && (status === 'done' || status === 'error' || results.length > 0)

  return (
    <div className="relative min-w-0 flex-1 lg:w-56 lg:flex-none xl:w-64">
      <label className="relative block">
        <span className="sr-only">Search region</span>
        <svg
          className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${results[active].id}` : undefined}
          placeholder="Search region… (e.g. Sicilia)"
          value={value}
          data-testid="region-search"
          onFocus={() => {
            setEditing(true)
            setText('')
          }}
          onBlur={() => {
            // Let a click on a result land before the list closes.
            setTimeout(() => setEditing(false), 150)
          }}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          onKeyDown={onKeyDown}
          className={`w-full rounded-lg border bg-slate-800/80 py-1.5 pl-8 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 [&::-webkit-search-cancel-button]:hidden ${
            selected && !editing ? 'border-orange-500/60 pr-7 font-medium' : 'border-slate-700 pr-2.5'
          }`}
        />
      </label>

      {selected && !editing && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-label={`Clear region ${selected.name}`}
          data-testid="region-clear"
          className="absolute top-1/2 right-1 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-sm leading-none text-slate-400 hover:bg-slate-700 hover:text-white"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}

      {(showList || picking || (error && !open)) && (
        <div className="absolute top-full right-0 left-0 z-[1100] mt-1 overflow-hidden rounded-lg border border-slate-700 bg-slate-900/95 text-xs shadow-xl backdrop-blur-md lg:right-auto lg:min-w-72">
          {picking && <p className="px-3 py-2 text-slate-400">Loading outline…</p>}
          {error && <p role="alert" className="px-3 py-2 text-rose-300">{error}</p>}
          {!picking && showList && status === 'done' && results.length === 0 && (
            <p className="px-3 py-2 text-slate-400">No region matches “{query}”. Names use local spelling (Sicilia, Toscana).</p>
          )}
          {!picking && showList && results.length > 0 && (
            <ul id={listId} role="listbox" aria-label="Regions" className={`max-h-72 overflow-y-auto py-1 ${status === 'loading' ? 'opacity-60' : ''}`}>
              {results.map((r, i) => (
                <li
                  key={r.id}
                  id={`${listId}-${r.id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(r)}
                  className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 ${i === active ? 'bg-slate-800 text-white' : 'text-slate-200'}`}
                >
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="shrink-0 truncate text-[11px] text-slate-500">{r.path || 'Country'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
