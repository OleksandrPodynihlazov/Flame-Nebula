import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { ALL_TYPES, FIRE_TYPES, SENSORS, UNCLASSIFIED } from '../constants/fire'
import type { FireType, Sensor } from '../types/api'
import { BUBBLE_HEAT_STEPS, bubbleHeatColor } from '../utils/clusters'
import { patternColor } from '../utils/patterns'
import { FLOAT_ICON_BUTTON, FLOAT_PANEL } from './floating'

function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
}

/** Legend names, plain: the FIRMS jargon and numeric codes stay in the filters and data. */
const LEGEND_LABELS: Record<FireType, string> = {
  0: 'Vegetation fire',
  1: 'Volcano',
  2: 'Industry / static',
  3: 'Offshore',
}

function ScaleBar({ background, from, to }: { background: string; from: string; to: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex h-2.5 w-44 overflow-hidden rounded-full" aria-hidden="true" style={{ background }} />
      <div className="flex w-44 justify-between text-muted-foreground">
        <span>{from}</span>
        <span>{to}</span>
      </div>
    </div>
  )
}

function PatternLegendList() {
  return <ScaleBar background={`linear-gradient(90deg, ${patternColor(0)}, ${patternColor(0.5)}, ${patternColor(1)})`} from="12 of 14 years" to="Every year" />
}

const HEAT_GRADIENT = `linear-gradient(90deg, ${Array.from({ length: BUBBLE_HEAT_STEPS }, (_, i) => bubbleHeatColor(i / BUBBLE_HEAT_STEPS)).join(', ')})`

function LegendList({ sensors }: { sensors: Sensor[] }) {
  return (
    <div className="flex flex-col gap-3 text-xs">
      <ul className="flex flex-col gap-1.5">
        {ALL_TYPES.map((t) => (
          <li key={t} className="flex items-center gap-2 text-foreground">
            <Dot color={FIRE_TYPES[t].color} />
            {LEGEND_LABELS[t]}
          </li>
        ))}
        <li className="flex items-center gap-2 text-foreground">
          <Dot color={UNCLASSIFIED.color} />
          {UNCLASSIFIED.label}
        </li>
      </ul>
      <ScaleBar background={HEAT_GRADIENT} from="Fewer" to="More" />
      {sensors.length > 1 && (
        <ul className="flex flex-col gap-1.5">
          {sensors.map((s) => (
            <li key={s} className="flex items-center gap-2 text-foreground">
              <span className="flex w-3 shrink-0 justify-center" aria-hidden="true">
                <span className="rounded-full border border-background bg-foreground/80" style={{ width: SENSORS[s].radius * 2, height: SENSORS[s].radius * 2 }} />
              </span>
              {s}
            </li>
          ))}
        </ul>
      )}
      <p className="max-w-44 text-muted-foreground">Volcano, industry and offshore can be hidden in Filters.</p>
    </div>
  )
}

const title = (patterns: boolean) => (patterns ? 'Recurring fire' : 'Hotspot types')

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
    <button
      type="button"
      onClick={onClick}
      className="mt-3 -mb-1 text-xs text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-lg:min-h-9"
    >
      Show tips
    </button>
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
