import { useMemo } from 'react'
import { COMPARE_COLORS } from '../constants/compare'
import type { HarmonizedMonth } from '../types/api'
import { satelliteName, yearlySeries, yearVsMedian } from '../utils/harmonized'
import { CompareBars } from './compare/CompareBars'

interface Props {
  /** "Italy" or "Europe". */
  label: string
  months: readonly HarmonizedMonth[] | null
  loading: boolean
  /** Year picked in the calendar: compared with the median of the other years. */
  year: number
}

const NUMBER = new Intl.NumberFormat('en')
const PERCENT = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' })

/**
 * Detections per year, raw (each month's reference satellite: Terra → Aqua → S-NPP → NOAA-20) next to the
 * same months in S-NPP-equivalent units (harmonize/calibrate.py). The raw bars jump where VIIRS takes over;
 * the harmonized ones do not.
 */
export function HarmonizedHistory({ label, months, loading, year }: Props) {
  const points = useMemo(() => yearlySeries(months ?? []), [months])
  const picked = useMemo(() => yearVsMedian(points, year), [points, year])

  // No card until there is a series: an empty card while loading would flash, then vanish on servers without data.
  if (points.length === 0) return null

  const footer = (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground" data-testid="harmonized-footer">
      {picked && (
        <p className="text-foreground">
          <span className="font-semibold">{picked.point.year}</span>: {NUMBER.format(picked.point.count)} detections in S-NPP units,{' '}
          <span className="font-semibold">{PERCENT.format(picked.change)}</span> against the median year (
          {NUMBER.format(Math.round(picked.median))}). Reference satellite: {picked.point.satellites.map(satelliteName).join(' → ')}.
        </p>
      )}
      <p>
        Raw = detections of each month&apos;s reference satellite (Terra → Aqua → S-NPP → NOAA-20). Harmonized = the same
        months converted to S-NPP units with per-country monthly factors, so the satellite no longer matters.
      </p>
    </div>
  )

  return (
    <div data-testid="harmonized-history">
      <CompareBars
        title={`${label}: detections per year, one scale`}
        categories={points.map((p) => String(p.year).slice(2))}
        loading={loading}
        format={(v) => NUMBER.format(Math.round(v))}
        series={[
          { label: 'Raw', color: 'var(--muted-foreground)', values: points.map((p) => p.raw) },
          { label: 'Harmonized (S-NPP units)', color: COMPARE_COLORS.b, values: points.map((p) => p.count) },
        ]}
        footer={footer}
      />
    </div>
  )
}
