import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface BarSeries {
  label: string
  color: string
  values: number[]
}

interface Props {
  title: string
  categories: readonly string[]
  series: [BarSeries, BarSeries]
  loading?: boolean
  footer?: ReactNode
  format?: (v: number) => string
}

const AXIS = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

function niceMax(n: number): number {
  if (n <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(n))
  const steps = [1, 2, 2.5, 5, 10]
  return (steps.find((s) => s * p >= n) ?? 10) * p
}

/** Grouped bars: one group per category, one bar per series. Plain DOM, scales to its container. */
export function CompareBars({ title, categories, series, loading = false, footer, format = (v) => v.toLocaleString() }: Props) {
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)))
  const ticks = [max, max / 2, 0]

  return (
    <div
      className="flex flex-col gap-4 border-t border-border pt-4"
      aria-busy={loading}
      data-testid="compare-bars"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <ul className="flex items-center gap-3 text-xs text-foreground">
          {series.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-[2px]" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      </div>

      <div className={cn('flex gap-2 transition-opacity', loading && 'opacity-50')}>
        <div className="flex h-44 flex-col justify-between pb-5 text-right font-mono text-[10px] text-muted-foreground tabular-nums sm:h-56 lg:h-72">
          {ticks.map((t) => (
            <span key={t}>{AXIS.format(t)}</span>
          ))}
        </div>
        <div className="relative flex h-44 flex-1 flex-col sm:h-56 lg:h-72">
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between">
            {ticks.map((t) => (
              <div key={t} className="border-t border-border" />
            ))}
          </div>
          <div className="relative flex min-h-0 flex-1 items-end gap-1 sm:gap-1.5">
            {categories.map((c, i) => (
              <div key={c} className="flex h-full flex-1 items-end justify-center gap-px sm:gap-0.5">
                {series.map((s) => {
                  const v = s.values[i] ?? 0
                  return (
                    <div
                      key={s.label}
                      className="w-full max-w-4 rounded-t-sm transition-[height] duration-300"
                      style={{ height: `${(v / max) * 100}%`, background: s.color, minHeight: v > 0 ? 1 : 0 }}
                      title={`${c} ${s.label}: ${format(v)}`}
                      data-testid="compare-bar"
                    />
                  )
                })}
              </div>
            ))}
          </div>
          <div className="flex h-5 gap-1 pt-1 sm:gap-1.5">
            {categories.map((c) => (
              <span key={c} className="flex-1 text-center font-mono text-[10px] text-muted-foreground">
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>

      {footer}
    </div>
  )
}
