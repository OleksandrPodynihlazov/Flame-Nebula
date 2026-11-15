import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { TAP_SLOP_PX, sheetOffset, shouldOpen } from '../utils/sheet'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  peek: ReactNode
  children: ReactNode
}

/** Pointer samples older than this are ignored when computing the release velocity. */
const VELOCITY_WINDOW_MS = 100

interface Gesture {
  pointerId: number
  startY: number
  dragging: boolean
  samples: { t: number; y: number }[]
}

/** Release speed in px/ms (down positive) over the last `VELOCITY_WINDOW_MS`. */
function releaseVelocity(samples: Gesture['samples']): number {
  const last = samples[samples.length - 1]
  const first = samples.find((s) => last.t - s.t <= VELOCITY_WINDOW_MS) ?? last
  return last.t === first.t ? 0 : (last.y - first.y) / (last.t - first.t)
}

export function MobileSheet({ open, onOpenChange, peek, children }: Props) {
  const contentRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const suppressClick = useRef(false)
  // px the sheet slides down to leave only the handle and peek visible.
  const [travel, setTravel] = useState(0)
  // Finger offset since pointerdown while dragging; null at rest.
  const [drag, setDrag] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    const measure = () => setTravel(el.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    gesture.current = { pointerId: e.pointerId, startY: e.clientY, dragging: false, samples: [{ t: e.timeStamp, y: e.clientY }] }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    const dy = e.clientY - g.startY
    if (!g.dragging) {
      if (Math.abs(dy) <= TAP_SLOP_PX) return
      // Capture only once it is a drag, so a plain tap still clicks the handle or a control in the peek.
      g.dragging = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    g.samples.push({ t: e.timeStamp, y: e.clientY })
    setDrag(dy)
  }

  const endGesture = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    gesture.current = null
    if (!g.dragging) return
    suppressClick.current = true
    setTimeout(() => (suppressClick.current = false), 0)
    setDrag(null)
    if (commit) {
      const next = shouldOpen({ drag: e.clientY - g.startY, velocity: releaseVelocity(g.samples), travel, wasOpen: open })
      if (next !== open) onOpenChange(next)
    }
  }

  // A drag ends with a click on the captured element; it must not also toggle the sheet.
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    e.stopPropagation()
    e.preventDefault()
  }, [])

  const dragging = drag !== null
  const offset = sheetOffset(open, travel, drag ?? 0)

  return (
    <div
      style={{ transform: `translateY(${offset}px)` }}
      className={`absolute inset-x-0 bottom-0 z-[1000] rounded-t-xl border-t border-border bg-card text-card-foreground shadow-[0_-8px_24px_-6px_rgb(0_0_0/0.6)] ${
        dragging ? '' : 'motion-safe:transition-transform motion-safe:duration-300'
      }`}
    >
      <div
        className="touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endGesture(e, true)}
        onPointerCancel={(e) => endGesture(e, false)}
        onClickCapture={onClickCapture}
      >
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-label={open ? 'Hide calendar' : 'Show calendar'}
          className="flex h-11 w-full items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <span className="h-1 w-10 rounded-full bg-muted-foreground/50" aria-hidden="true" />
        </button>

        <div className="px-3 pb-3">{peek}</div>
      </div>

      <div ref={contentRef} inert={!open} className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  )
}
