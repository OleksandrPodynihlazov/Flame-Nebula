import { useEffect, useState } from 'react'
import type { Box } from '../utils/placement'

/** How often a moving target (map controls, sliding panel, sheet) is re-measured. */
const POLL_MS = 250

function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

/** Viewport rect of the first selector that matches an element that is on screen, else null. */
export function visibleRect(selectors: readonly string[]): Box | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (!el) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight) continue
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  }
  return null
}

/** Live viewport rect of a target while `active`: follows resizes, panel slides and late-mounted map controls. */
export function useTargetRect(selectors: readonly string[], active: boolean): Box | null {
  const [rect, setRect] = useState<Box | null>(null)

  useEffect(() => {
    if (!active) return
    const update = () => setRect((prev) => {
      const next = visibleRect(selectors)
      return sameBox(prev, next) ? prev : next
    })
    const frame = requestAnimationFrame(update)
    const timer = setInterval(update, POLL_MS)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      clearInterval(timer)
      window.removeEventListener('resize', update)
    }
  }, [selectors, active])

  return active ? rect : null
}
