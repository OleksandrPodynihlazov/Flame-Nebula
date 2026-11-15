import L from 'leaflet'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronsLeftRight } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useMap } from 'react-leaflet'
import { cn } from '@/lib/utils'
import { FLOAT_PANEL } from '../floating'

const MIN = 0.02
const MAX = 0.98
const KEY_STEP = 0.02

const clamp = (n: number) => Math.min(MAX, Math.max(MIN, n))

interface Props {
  /** Leaflet pane shown left of the divider. */
  leftPane: string
  /** Leaflet pane shown right of the divider. */
  rightPane: string
  left: ReactNode
  right: ReactNode
  leftColor: string
  rightColor: string
  /** Px covered on the right (e.g. by a side panel): the divider stays left of it. */
  rightInset?: number
}

/**
 * One map, two panes: each pane is clipped to its side of a draggable vertical divider.
 * Works with any layers drawn into `leftPane` / `rightPane`, so other map views can reuse it.
 */
export function SwipeCompare({ leftPane, rightPane, left, right, leftColor, rightColor, rightInset = 0 }: Props) {
  const map = useMap()
  const width = map.getSize().x || 1
  const maxRatio = Math.max(MIN + 0.1, Math.min(MAX, 1 - rightInset / width - 0.02))
  const [raw, setRatio] = useState(() => (1 - rightInset / width) / 2)
  const ratio = Math.min(raw, maxRatio)
  const handleRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const panes = [leftPane, rightPane].map((name) => map.getPane(name) ?? map.createPane(name))
    const apply = () => {
      const size = map.getSize()
      const nw = map.containerPointToLayerPoint([0, 0])
      const se = map.containerPointToLayerPoint(size)
      const clipX = nw.x + size.x * ratio
      panes[0].style.clip = `rect(${nw.y}px, ${clipX}px, ${se.y}px, ${nw.x}px)`
      panes[1].style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${clipX}px)`
    }
    apply()
    map.on('move zoom resize', apply)
    return () => {
      map.off('move zoom resize', apply)
      for (const pane of panes) pane.style.clip = ''
    }
  }, [map, ratio, leftPane, rightPane])

  useEffect(() => {
    const el = handleRef.current
    if (!el) return
    L.DomEvent.disableClickPropagation(el)
    L.DomEvent.disableScrollPropagation(el)
    const container = map.getContainer()
    let dragging = false
    const move = (e: PointerEvent) => {
      if (!dragging) return
      const rect = container.getBoundingClientRect()
      setRatio(clamp((e.clientX - rect.left) / rect.width))
    }
    const down = (e: PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      dragging = true
      el.setPointerCapture(e.pointerId)
      map.dragging.disable()
    }
    const up = (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      map.dragging.enable()
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      map.dragging.enable()
    }
  }, [map])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setRatio((r) => clamp(Math.min(r, maxRatio) - KEY_STEP))
    else if (e.key === 'ArrowRight') setRatio((r) => Math.min(maxRatio, clamp(Math.min(r, maxRatio) + KEY_STEP)))
    else if (e.key === 'Home') setRatio(MIN)
    else if (e.key === 'End') setRatio(maxRatio)
    else return
    e.preventDefault()
  }

  const pct = `${ratio * 100}%`

  return createPortal(
    <>
      <div
        className="pointer-events-none absolute top-3 z-[1000] flex justify-end lg:top-[10px]"
        style={{ right: `calc(${100 - ratio * 100}% + 12px)` }}
      >
        <div
          className={cn(FLOAT_PANEL, 'flex h-9 items-center gap-2 px-3 text-xs whitespace-nowrap')}
          style={{ borderColor: leftColor }}
          data-testid="compare-label-a"
        >
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: leftColor }} />
          {left}
        </div>
      </div>
      <div className="pointer-events-none absolute top-3 z-[1000] lg:top-[10px]" style={{ left: `calc(${pct} + 12px)` }}>
        <div
          className={cn(FLOAT_PANEL, 'flex h-9 items-center gap-2 px-3 text-xs whitespace-nowrap')}
          style={{ borderColor: rightColor }}
          data-testid="compare-label-b"
        >
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: rightColor }} />
          {right}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-y-0 z-[999] w-0.5 -translate-x-1/2 bg-foreground/80 shadow-[0_0_8px_var(--background)]" style={{ left: pct }} />

      <div
        ref={handleRef}
        role="slider"
        tabIndex={0}
        aria-label="Compare divider"
        aria-valuemin={Math.round(MIN * 100)}
        aria-valuemax={Math.round(MAX * 100)}
        aria-valuenow={Math.round(ratio * 100)}
        onKeyDown={onKeyDown}
        data-testid="compare-divider"
        className={cn(FLOAT_PANEL, 'absolute top-1/2 z-[1000] flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring')}
        style={{ left: pct }}
      >
        <ChevronsLeftRight className="size-4" aria-hidden="true" />
      </div>
    </>,
    map.getContainer(),
  )
}
