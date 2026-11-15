import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { MONTHS_FULL } from '../constants/fire'
import type { Month } from '../types/api'
import { formatUtcDate, peakDay, placeTip, type CalendarGrid, type Placement } from '../utils/calendar'

/** Cells and month buttons mark themselves with these attributes; the tooltip reads them by event delegation. */
export const CAL_ATTR = 'data-cal'

type Target = { kind: 'day'; el: HTMLElement; month: Month; day: number } | { kind: 'month'; el: HTMLElement; month: Month }

function targetOf(node: EventTarget | null, root: HTMLElement): Target | null {
  const el = node instanceof Element ? node.closest<HTMLElement>(`[${CAL_ATTR}]`) : null
  if (!el || !root.contains(el)) return null
  const month = Number(el.dataset.month) as Month
  return el.getAttribute(CAL_ATTR) === 'day' ? { kind: 'day', el, month, day: Number(el.dataset.day) } : { kind: 'month', el, month }
}

const num = (n: number, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits })

/**
 * One floating tooltip for the whole calendar grid: ~366 Radix tooltips would cost more than they are worth.
 * Mouse hover and keyboard focus (`:focus-visible`) show it; touch never does. The focused cell gets `aria-describedby`.
 */
export function CalendarTooltip({ gridRef, grid, year, selectedDate }: { gridRef: RefObject<HTMLElement | null>; grid: CalendarGrid | null; year: number; selectedDate: string | null }) {
  const id = useId()
  const tipRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<Target | null>(null)
  const [focus, setFocus] = useState<Target | null>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const shown = hover ?? focus

  useEffect(() => {
    const root = gridRef.current
    if (!root) return
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') setHover(targetOf(e.target, root))
    }
    const onLeave = () => setHover(null)
    const onFocusIn = (e: FocusEvent) => {
      const t = targetOf(e.target, root)
      setFocus(t && t.el.matches(':focus-visible') ? t : null)
    }
    const onFocusOut = () => setFocus(null)
    const hide = () => {
      setHover(null)
      setFocus(null)
    }
    root.addEventListener('pointerover', onOver)
    root.addEventListener('pointerleave', onLeave)
    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('focusout', onFocusOut)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      root.removeEventListener('pointerover', onOver)
      root.removeEventListener('pointerleave', onLeave)
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [gridRef])

  useEffect(() => {
    const el = focus?.el
    el?.setAttribute('aria-describedby', id)
    return () => el?.removeAttribute('aria-describedby')
  }, [focus, id])

  useLayoutEffect(() => {
    const tip = tipRef.current
    if (!shown || !tip) {
      setPlacement(null)
      return
    }
    setPlacement(placeTip(shown.el.getBoundingClientRect(), { width: tip.offsetWidth, height: tip.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }))
  }, [shown, grid])

  if (!shown || !grid) return null
  return createPortal(
    <div
      ref={tipRef}
      id={id}
      role="tooltip"
      data-testid="calendar-tooltip"
      data-side={placement?.side}
      style={{ left: placement?.left ?? 0, top: placement?.top ?? 0, visibility: placement ? 'visible' : 'hidden' }}
      className="pointer-events-none fixed z-[1200] flex w-max max-w-64 flex-col gap-1 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
    >
      {shown.kind === 'day' ? <DayTip grid={grid} year={year} month={shown.month} day={shown.day} selectedDate={selectedDate} /> : <MonthTip grid={grid} year={year} month={shown.month} />}
    </div>,
    document.body,
  )
}

const HINT = 'text-muted-foreground'
const FIG = 'font-mono font-semibold tabular-nums'

function DayTip({ grid, year, month, day, selectedDate }: { grid: CalendarGrid; year: number; month: Month; day: number; selectedDate: string | null }) {
  const count = grid.counts[month][day - 1] ?? 0
  const frp = grid.dayFrp[month][day - 1] ?? 0
  const date = formatUtcDate(year, month, day)
  const selected = selectedDate === `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return (
    <>
      <span className="font-medium">{date}</span>
      {count === 0 ? (
        <span>No detections</span>
      ) : (
        <>
          <span>
            <span className={FIG}>{num(count)}</span> hotspot{count === 1 ? '' : 's'}
          </span>
          <span>
            FRP <span className={FIG}>{num(frp, 1)}</span> MW
          </span>
        </>
      )}
      <span className={HINT}>{selected ? 'Click to unselect' : 'Click to filter the map'}</span>
    </>
  )
}

function MonthTip({ grid, year, month }: { grid: CalendarGrid; year: number; month: Month }) {
  const total = grid.monthTotals[month]
  const peak = peakDay(grid, month)
  return (
    <>
      <span className="font-medium">
        {MONTHS_FULL[month]} {year}
      </span>
      {total === 0 ? (
        <span>No detections</span>
      ) : (
        <>
          <span>
            <span className={FIG}>{num(total)}</span> hotspot{total === 1 ? '' : 's'}
          </span>
          <span>
            FRP <span className={FIG}>{num(grid.monthFrp[month], 1)}</span> MW
          </span>
          {peak && (
            <span>
              Peak day <span className={FIG}>{peak.day}</span> <span className={HINT}>({num(peak.count)})</span>
            </span>
          )}
        </>
      )}
      <span className={HINT}>Click to show the whole month</span>
    </>
  )
}
