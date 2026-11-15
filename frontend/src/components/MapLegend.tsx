import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Info, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { ALL_TYPES, FIRE_TYPES, SENSORS, UNCLASSIFIED } from '../constants/fire'
import type { Sensor } from '../types/api'
import { BUBBLE_HEAT_STEPS, bubbleHeatColor } from '../utils/clusters'
import { patternColor } from '../utils/patterns'
import { FLOAT_ICON_BUTTON, FLOAT_PANEL } from './floating'

function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
}

function PatternLegendList() {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="h-2.5 w-44 rounded-full" style={{ background: `linear-gradient(90deg, ${patternColor(0)}, ${patternColor(0.5)}, ${patternColor(1)})` }} />
      <div className="flex w-44 justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>12/14</span>
        <span>13/14</span>
        <span>14/14</span>
      </div>
      <p className="max-w-44 text-muted-foreground">Years this 0.1° cell burned in the month (S-NPP, 2012–2025). Only cells that burned in at least 12 years are shown.</p>
    </div>
  )
}

function HeatScale() {
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex h-2.5 w-44 overflow-hidden rounded-full" aria-hidden="true">
        {Array.from({ length: BUBBLE_HEAT_STEPS }, (_, i) => (
          <span key={i} className="flex-1" style={{ background: bubbleHeatColor(i / BUBBLE_HEAT_STEPS) }} />
        ))}
      </div>
      <span className="text-muted-foreground">fewer → more hotspots</span>
    </div>
  )
}

function LegendList({ sensors }: { sensors: Sensor[] }) {
  return (
    <div className="flex flex-col gap-2.5 text-xs">
      <ul className="flex flex-col gap-1.5">
        {ALL_TYPES.map((t) => (
          <li key={t} className="flex items-center gap-2">
            <Dot color={FIRE_TYPES[t].color} />
            <span className="text-foreground">
              <span className="font-mono text-muted-foreground tabular-nums">{t}</span> {FIRE_TYPES[t].label}
              {FIRE_TYPES[t].noise && <span className="text-muted-foreground"> · noise</span>}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <Dot color={UNCLASSIFIED.color} />
          <span className="text-foreground">
            <span className="font-mono text-muted-foreground">–</span> {UNCLASSIFIED.label}
            <span className="text-muted-foreground"> · NRT</span>
          </span>
        </li>
      </ul>
      <Separator />
      <HeatScale />
      <Separator />
      <ul className="flex flex-col gap-1.5">
        {sensors.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className="flex w-3 shrink-0 justify-center" aria-hidden="true">
              <span className="rounded-full border border-background bg-foreground/80" style={{ width: SENSORS[s].radius * 2, height: SENSORS[s].radius * 2 }} />
            </span>
            <span className="text-foreground">
              {s} <span className="text-muted-foreground">· {SENSORS[s].pixel} pixel</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const title = (patterns: boolean) => (patterns ? 'Recurring fire' : 'FIRMS hotspot types')

function LegendBody({ sensors, patterns }: { sensors: Sensor[]; patterns: boolean }): ReactNode {
  return patterns ? <PatternLegendList /> : <LegendList sensors={sensors} />
}

interface LegendProps {
  sensors: Sensor[]
  patterns?: boolean
  /** Opens the first-visit guide again. */
  onShowTips: () => void
}

function ShowTips({ onClick }: { onClick: () => void }) {
  return (
    <>
      <Separator className="my-2.5" />
      <Button type="button" variant="ghost" size="xs" onClick={onClick} className="-ml-1.5 text-muted-foreground max-lg:h-9">
        <Lightbulb data-icon="inline-start" aria-hidden="true" />
        Show tips
      </Button>
    </>
  )
}

/** Desktop: collapsible card, bottom left. */
export function MapLegend({ open, onToggle, sensors, patterns = false, onShowTips }: LegendProps & { open: boolean; onToggle: () => void }) {
  const Chevron = open ? ChevronDown : ChevronUp
  return (
    <div className={cn(FLOAT_PANEL, 'absolute bottom-[10px] left-[10px] z-20 max-w-[240px] overflow-hidden')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-3 py-2 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {title(patterns)}
        <Chevron className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </button>
      {open && (
        <div className="border-t border-border px-3 pt-2.5 pb-3">
          <LegendBody sensors={sensors} patterns={patterns} />
          <ShowTips onClick={onShowTips} />
        </div>
      )}
    </div>
  )
}

/** Phone: a button in the map's control column; the legend opens as a popover card, so nothing stays on the map while closed. */
export function MobileLegend({ sensors, patterns = false, onShowTips }: LegendProps) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" size="icon-lg" aria-label="Show legend" data-testid="legend-button" className={FLOAT_ICON_BUTTON}>
          <Info aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={8} collisionPadding={12} className="z-[1200] w-auto max-w-[calc(100vw-5.5rem)] p-3">
        <p className="text-xs font-medium text-foreground">{title(patterns)}</p>
        <LegendBody sensors={sensors} patterns={patterns} />
        <ShowTips
          onClick={() => {
            setOpen(false)
            onShowTips()
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
