import { useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  peek: ReactNode
  children: ReactNode
}

const SWIPE_PX = 30

export function MobileSheet({ open, onOpenChange, peek, children }: Props) {
  const startY = useRef<number | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (startY.current === null) return
    const dy = e.clientY - startY.current
    startY.current = null
    if (dy < -SWIPE_PX) onOpenChange(true)
    else if (dy > SWIPE_PX) onOpenChange(false)
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-[1000] rounded-t-xl border-t border-border bg-card text-card-foreground shadow-[0_-8px_24px_-6px_rgb(0_0_0/0.6)]">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        aria-expanded={open}
        aria-label={open ? 'Hide calendar' : 'Show calendar'}
        className="flex h-11 w-full touch-none items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="h-1 w-10 rounded-full bg-muted-foreground/50" aria-hidden="true" />
      </button>

      <div className="px-3 pb-3">{peek}</div>

      <div className={`grid transition-[grid-template-rows] duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{children}</div>
        </div>
      </div>
    </div>
  )
}
