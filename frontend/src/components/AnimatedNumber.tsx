import NumberFlow, { type Format } from '@number-flow/react'
import { cn } from '@/lib/utils'

interface Props {
  value: number
  format?: Format
  className?: string
  testId?: string
}

const LOCALE = 'en-US'

/**
 * A number that rolls its digits when `value` changes (NumberFlow).
 * The animated copy is hidden from assistive tech and from `innerText`; an `sr-only` span carries the final formatted
 * string so readers and text assertions never see a half-rolled number.
 */
export function AnimatedNumber({ value, format, className, testId }: Props) {
  return (
    <span className={cn('tabular-nums', className)} data-testid={testId}>
      <span className="sr-only">{value.toLocaleString(LOCALE, format)}</span>
      <NumberFlow aria-hidden="true" value={value} locales={LOCALE} format={format} />
    </span>
  )
}
