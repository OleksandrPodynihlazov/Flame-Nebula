import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTargetRect } from '../hooks/useTargetRect'
import { HINT_STEPS } from '../utils/hints'
import { placeCard } from '../utils/placement'
import { FLOAT_PANEL } from './floating'

const CARD_MAX_WIDTH = 280
const SCREEN_MARGIN = 12
/** Above every map control and overlay (the highest is the 1200 portal layer). */
const Z_CARD = 'z-[1300]'

function useViewport() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

interface Props {
  step: number
  mobile: boolean
  onNext: () => void
  onDismiss: () => void
}

/** First-visit guide: one small card next to the element it explains, with a ring on that element. The map stays visible and usable. */
export function CoachMarks({ step, mobile, onNext, onDismiss }: Props) {
  const current = HINT_STEPS[step]
  const total = HINT_STEPS.length
  const isLast = step === total - 1
  const titleId = useId()
  const bodyId = useId()
  const primaryRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(150)
  const [returnTo] = useState(() => document.activeElement)
  const viewport = useViewport()
  const rect = useTargetRect(mobile ? current.targets.mobile : current.targets.desktop, true)

  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true })
  }, [step])

  useEffect(
    () => () => {
      if (returnTo instanceof HTMLElement && returnTo !== document.body && returnTo.isConnected) returnTo.focus({ preventScroll: true })
    },
    [returnTo],
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setCardHeight(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const width = Math.min(CARD_MAX_WIDTH, viewport.width - SCREEN_MARGIN * 2)
  const position = rect
    ? placeCard(rect, { width, height: cardHeight }, viewport, current.sides, { margin: SCREEN_MARGIN })
    : { left: (viewport.width - width) / 2, top: viewport.height - cardHeight - 120 }
  const ring = rect && {
    left: Math.max(rect.left - 4, 2),
    top: Math.max(rect.top - 4, 2),
    width: Math.min(rect.width + 8, viewport.width - 4),
    height: Math.min(rect.height + 8, viewport.height - 4),
  }

  return (
    <>
      {ring && (
        <div
          aria-hidden="true"
          className={cn('pointer-events-none fixed rounded-lg ring-2 ring-primary motion-safe:animate-pulse', Z_CARD)}
          style={ring}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-testid="coach-card"
        className={cn(FLOAT_PANEL, 'fixed flex flex-col gap-3 p-3', Z_CARD)}
        style={{ ...position, width }}
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-sm font-medium text-foreground">
            {current.title}
          </h2>
          <p id={bodyId} className="text-xs text-muted-foreground">
            {current.body}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="flex gap-1">
              {HINT_STEPS.map((s, i) => (
                <span key={s.id} className={cn('size-1.5 rounded-full', i === step ? 'bg-primary' : 'bg-muted-foreground/40')} />
              ))}
            </span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {step + 1} of {total}
            </span>
          </span>
          <span className="flex items-center gap-1">
            {!isLast && (
              <Button type="button" variant="ghost" size="sm" onClick={onDismiss} className="max-lg:h-11 max-lg:px-3">
                Skip
              </Button>
            )}
            <Button ref={primaryRef} type="button" size="sm" onClick={onNext} className="max-lg:h-11 max-lg:px-4">
              {isLast ? 'Done' : 'Next'}
            </Button>
          </span>
        </div>
      </div>
    </>
  )
}
