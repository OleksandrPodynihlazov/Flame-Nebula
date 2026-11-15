import type { ReactNode } from 'react'
import { useId } from 'react'
import { ArrowLeftRight, Download, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { CompareSide, CompareYears } from '../constants/compare'
import { ALL_SENSORS, ALL_TYPES, FIRE_TYPES, MONTHS_FULL, SENSORS, YEARS } from '../constants/fire'

import type { Area, DayNight, FireType, Filters, Sensor } from '../types/api'
import { RegionSearch } from './RegionSearch'

import { defaultCompareYears } from '../utils/compare'
import { activeSensors, countChangedFilters, sensorAvailable, yearPatch } from '../utils/filters'

/** The map's own panes and controls use z-indexes up to 1100, so overlays portaled to <body> must sit above them. */
const OVERLAY_Z = 'z-[1200]'

const SIDE_DOT: Record<CompareSide, string> = { a: 'bg-compare-a', b: 'bg-compare-b' }

/** Focus ring for hand-rolled controls; shadcn components bring their own. */
const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

interface Props {
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  onDownload: () => void
  downloading: boolean
  isDemo: boolean
  compare: CompareYears | null
  onCompareChange: (compare: CompareYears | null) => void
  /** Set in the pattern view: only compare (two months) applies there. */
  patternMode?: PatternMode | null
}

export interface PatternMode {
  compare: CompareYears | null
  onCompareChange: (compare: CompareYears | null) => void
}

function CompareToggle({ on, onClick, title, className }: { on: boolean; onClick: () => void; title: string; className?: string }) {
  return (
    <Button
      type="button"
      role="switch"
      aria-checked={on}
      variant={on ? 'secondary' : 'outline'}
      size="lg"
      onClick={onClick}
      title={title}
      data-testid="compare-toggle"
      className={cn(on && 'border-primary/60 text-primary', className)}
    >
      <ArrowLeftRight data-icon="inline-start" aria-hidden="true" />
      Compare
    </Button>
  )
}

/**
 * A select with its label. In the top bar the label is the select's aria-label only; stacked (popover, phone)
 * it is shown on the left.
 */
function SelectField({
  label,
  side,
  stacked,
  children,
}: {
  label: string
  side?: CompareSide
  stacked: boolean
  children: ReactNode
}) {
  const dot = side && <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', SIDE_DOT[side])} />
  if (!stacked) return <span className="flex items-center gap-1.5">{dot}{children}</span>
  return (
    <label className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {dot}
        {label}
      </span>
      {children}
    </label>
  )
}

const selectSize = (stacked: boolean) => (stacked ? '[&_select]:h-11 lg:[&_select]:h-9' : '[&_select]:h-9')

function PatternControls({ mode, month, stacked }: { mode: PatternMode; month: number; stacked: boolean }) {
  const { compare, onCompareChange } = mode
  return (
    <div className={stacked ? 'flex flex-col items-stretch gap-3' : 'flex flex-nowrap items-center gap-2'}>
      <CompareToggle
        on={compare !== null}
        onClick={() => onCompareChange(compare ? null : { a: month === 1 ? 1 : month - 1, b: month === 1 ? 2 : month })}
        title="Compare two months side by side"
        className={stacked ? 'h-11 w-full lg:h-9' : undefined}
      />
      {compare &&
        (['a', 'b'] as CompareSide[]).map((side) => (
          <SelectField key={side} label={`Month ${side.toUpperCase()}`} side={side} stacked={stacked}>
            <NativeSelect
              value={compare[side]}
              onChange={(e) => onCompareChange({ ...compare, [side]: Number(e.target.value) })}
              aria-label={`Compare month ${side.toUpperCase()}`}
              data-testid={`compare-month-${side}`}
              className={cn(selectSize(stacked), stacked && 'w-full')}
            >
              {MONTHS_FULL.map((name, i) => (
                <NativeSelectOption key={name} value={i + 1}>
                  {name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </SelectField>
        ))}
      <span className={cn('text-xs text-muted-foreground', !stacked && 'hidden whitespace-nowrap xl:inline')}>
        Patterns · S-NPP 2012–2025 · area filter only
      </span>
    </div>
  )
}

export function Brand({
  year,
  sensors,
  isDemo,
  compare = null,
  scope,
}: {
  year: number
  sensors: Sensor[]
  isDemo: boolean
  compare?: CompareYears | null
  /** Overrides the year · sensors readout (pattern view). */
  scope?: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-heat-4 to-heat-3 text-primary-foreground shadow-md shadow-primary/20">
        <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 23c-4.97 0-9-3.58-9-8 0-3.19 2.13-6.48 4.46-8.77.45-.44 1.21-.15 1.25.48.13 2.02 1.21 3.29 2.29 3.29.41 0 .75-.34.75-.75 0-2.61 1.48-5.34 3.44-7.01.47-.4 1.19-.08 1.21.53.11 3.22 1.77 5.23 3.22 6.84C21.13 11.29 22 13.06 22 15c0 4.42-4.03 8-10 8z" />
        </svg>
      </div>
      <h1 className="text-sm font-semibold tracking-tight whitespace-nowrap text-foreground max-[359px]:hidden">Flame Nebula</h1>
      <span className="hidden font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums 2xl:inline">
        Italy · {scope ?? `${compare ? `${compare.a} vs ${compare.b}` : year} · ${sensors.join(' + ')}`}
      </span>
      {isDemo && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" tabIndex={0} className={cn('text-flare', FOCUS_RING)}>
              Demo data
            </Badge>
          </TooltipTrigger>
          <TooltipContent className={OVERLAY_Z}>Synthetic demo data — not real FIRMS detections</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

/** Region search bound to `filters.area`. */
export function SearchField({ area, onAreaChange }: { area: Area | null; onAreaChange: (area: Area | null) => void }) {
  return <RegionSearch area={area} onSelect={onAreaChange} />
}

/** Fire type, pass, hide noise and sensors: the filters that live in the desktop popover and the phone panel. */
export function FilterFields({ filters, onChange }: Pick<Props, 'filters' | 'onChange'>) {
  const noiseId = useId()
  const sensorsLabelId = useId()
  const typeValue = filters.types.length === ALL_TYPES.length ? 'all' : String(filters.types[0])
  const sensors = activeSensors(filters)

  const setType = (v: string) => {
    if (v === 'all') return onChange({ types: ALL_TYPES })
    const t = Number(v) as FireType
    onChange({ types: [t], hideNoise: FIRE_TYPES[t].noise ? false : filters.hideNoise })
  }

  const toggleSensor = (s: Sensor) => {
    const next = filters.sensors.includes(s) ? filters.sensors.filter((x) => x !== s) : [...filters.sensors, s]
    if (next.some((x) => sensorAvailable(x, filters.year))) onChange({ sensors: next })
  }

  const toggleNoise = () => {
    const hideNoise = !filters.hideNoise
    const onlyNoise = filters.types.every((t) => FIRE_TYPES[t].noise)
    onChange(hideNoise && onlyNoise ? { hideNoise, types: ALL_TYPES } : { hideNoise })
  }

  return (
    <div className="flex flex-col gap-3">
      <SelectField label="Fire type" stacked>
        <NativeSelect value={typeValue} onChange={(e) => setType(e.target.value)} className={cn(selectSize(true), 'w-full')}>
          <NativeSelectOption value="all">All types (0–3)</NativeSelectOption>
          {ALL_TYPES.map((t) => (
            <NativeSelectOption key={t} value={t}>
              {t} — {FIRE_TYPES[t].label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </SelectField>

      <SelectField label="Pass" stacked>
        <NativeSelect
          value={filters.daynight ?? 'all'}
          onChange={(e) => onChange({ daynight: e.target.value === 'all' ? null : (e.target.value as DayNight) })}
          className={cn(selectSize(true), 'w-full')}
        >
          <NativeSelectOption value="all">Day + night</NativeSelectOption>
          <NativeSelectOption value="D">Day only</NativeSelectOption>
          <NativeSelectOption value="N">Night only</NativeSelectOption>
        </NativeSelect>
      </SelectField>

      <label
        htmlFor={noiseId}
        title="Hide non-vegetation detections: volcanoes, industrial sites, offshore"
        className="flex min-h-11 items-center justify-between gap-3 text-sm lg:min-h-9"
      >
        <span className="flex flex-col">
          Hide noise
          <span className="text-xs text-muted-foreground">Volcanoes, industry, offshore</span>
        </span>
        <Switch id={noiseId} checked={filters.hideNoise} onCheckedChange={toggleNoise} />
      </label>

      <div role="group" aria-labelledby={sensorsLabelId} className="flex flex-col text-sm">
        <span id={sensorsLabelId} className="text-muted-foreground">
          Sensors
        </span>
        <div className="flex items-center gap-4">
          {ALL_SENSORS.map((s) => {
            const available = sensorAvailable(s, filters.year)
            const checked = available && filters.sensors.includes(s)
            const isLast = checked && sensors.length === 1
            const meta = SENSORS[s]
            const title = !available
              ? `${s} has data for ${meta.from}–${meta.to} only`
              : isLast
                ? 'At least one sensor must stay selected'
                : `${s} · ${meta.pixel} pixels`
            return (
              <label
                key={s}
                title={title}
                className={cn(
                  'flex min-h-11 items-center gap-2 font-mono lg:min-h-9',
                  available && !isLast ? 'cursor-pointer' : 'cursor-not-allowed',
                  !available && 'text-muted-foreground',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!available || isLast}
                  onChange={() => toggleSensor(s)}
                  className={cn('size-4 rounded-sm accent-primary', FOCUS_RING)}
                />
                {s}
                {!available && (
                  <Badge variant="secondary" className="font-mono">
                    {meta.from}+
                  </Badge>
                )}
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CsvButton({
  onDownload,
  downloading,
  compare,
  className,
}: Pick<Props, 'onDownload' | 'downloading' | 'compare'> & { className?: string }) {
  const button = (
    <Button type="button" size="lg" onClick={onDownload} disabled={downloading || compare !== null} className={className}>
      <Download data-icon="inline-start" aria-hidden="true" />
      {downloading ? 'Preparing…' : 'CSV'}
    </Button>
  )
  if (compare === null) return button
  // A disabled button fires no pointer events, so the tooltip hangs on a focusable wrapper.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn('inline-flex rounded-lg', FOCUS_RING, className?.includes('w-full') && 'w-full')}>
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent className={OVERLAY_Z}>CSV export works on one year — turn compare off first</TooltipContent>
    </Tooltip>
  )
}

/** Year select, or Year A / Year B in compare mode. */
function YearFields({
  filters,
  onChange,
  compare,
  onCompareChange,
  stacked,
}: Pick<Props, 'filters' | 'onChange' | 'compare' | 'onCompareChange'> & { stacked: boolean }) {
  const yearOptions = YEARS.map((y) => (
    <NativeSelectOption key={y} value={y}>
      {y}
    </NativeSelectOption>
  ))
  const className = cn('font-mono tabular-nums', selectSize(stacked), stacked && 'w-full')

  if (compare) {
    return (['a', 'b'] as CompareSide[]).map((side) => (
      <SelectField key={side} label={`Year ${side.toUpperCase()}`} side={side} stacked={stacked}>
        <NativeSelect
          value={compare[side]}
          onChange={(e) => onCompareChange({ ...compare, [side]: Number(e.target.value) })}
          aria-label={`Year ${side.toUpperCase()}`}
          data-testid={`compare-year-${side}`}
          className={className}
        >
          {yearOptions}
        </NativeSelect>
      </SelectField>
    ))
  }
  return (
    <SelectField label="Year" stacked={stacked}>
      <NativeSelect
        value={filters.year}
        onChange={(e) => onChange(yearPatch(filters, Number(e.target.value)))}
        aria-label="Year"
        className={className}
      >
        {yearOptions}
      </NativeSelect>
    </SelectField>
  )
}

/** Phone filters panel: everything stacked. Year is left to the sheet's year picker (`hideYear`). */
export function FilterControls({
  filters,
  onChange,
  onDownload,
  downloading,
  compare,
  onCompareChange,
  hideYear = false,
  patternMode = null,
  patternMonth = 8,
}: Omit<Props, 'isDemo'> & { hideYear?: boolean; patternMonth?: number }) {
  if (patternMode) return <PatternControls mode={patternMode} month={patternMonth} stacked />

  return (
    <div className="flex flex-col items-stretch gap-3">
      <CompareToggle
        on={compare !== null}
        onClick={() => onCompareChange(compare ? null : defaultCompareYears(filters.year))}
        title="Compare two years side by side"
        className="h-11 w-full lg:h-9"
      />
      {(compare || !hideYear) && (
        <YearFields filters={filters} onChange={onChange} compare={compare} onCompareChange={onCompareChange} stacked />
      )}
      <Separator />
      <FilterFields filters={filters} onChange={onChange} />
      <CsvButton onDownload={onDownload} downloading={downloading} compare={compare} className="h-11 w-full lg:h-9" />
    </div>
  )
}

/** Desktop bar controls: year, compare, filters popover, CSV. */
function BarControls({
  filters,
  onChange,
  onDownload,
  downloading,
  compare,
  onCompareChange,
  patternMode = null,
  patternMonth = 8,
}: Omit<Props, 'isDemo'> & { patternMonth?: number }) {
  if (patternMode) return <PatternControls mode={patternMode} month={patternMonth} stacked={false} />

  const changed = countChangedFilters(filters)
  return (
    <div className="flex flex-nowrap items-center gap-2">
      <YearFields filters={filters} onChange={onChange} compare={compare} onCompareChange={onCompareChange} stacked={false} />
      <CompareToggle
        on={compare !== null}
        onClick={() => onCompareChange(compare ? null : defaultCompareYears(filters.year))}
        title="Compare two years side by side"
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="lg">
            <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
            Filters
            {changed > 0 && (
              <Badge variant="secondary" className="font-mono tabular-nums">
                {changed}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className={cn('w-72 gap-3 p-3', OVERLAY_Z)}>
          <FilterFields filters={filters} onChange={onChange} />
        </PopoverContent>
      </Popover>
      <CsvButton onDownload={onDownload} downloading={downloading} compare={compare} />
    </div>
  )
}

export function TopBar({ isDemo, scope, patternMonth, ...rest }: Props & { scope?: string; patternMonth?: number }) {
  return (
    <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4">
      <div className="flex min-w-0 items-center gap-4">
        <Brand year={rest.filters.year} sensors={activeSensors(rest.filters)} isDemo={isDemo} compare={rest.compare} scope={scope} />
        <SearchField area={rest.filters.area} onAreaChange={(area) => rest.onChange({ area })} />
      </div>
      <BarControls {...rest} patternMonth={patternMonth} />
    </header>
  )
}
