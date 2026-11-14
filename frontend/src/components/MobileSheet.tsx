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
    <div className="absolute inset-x-0 bottom-0 z-[1000] rounded-t-2xl border-t border-slate-700/80 bg-slate-950/80 shadow-[0_-8px_24px_rgba(0,0,0,0.4)] backdrop-blur-md">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        aria-expanded={open}
        aria-label={open ? 'Hide calendar' : 'Show calendar'}
        className="flex w-full touch-none flex-col items-center pt-1.5 pb-1"
      >
        <span className="h-1 w-10 rounded-full bg-slate-600" />
        <svg
          className={`mt-0.5 h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 15 6-6 6 6" />
        </svg>
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
