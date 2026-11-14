import { useEffect, useState } from 'react'

/** Wait this long after a filter change before asking the API, so quick clicks load once. */
export const FILTER_DEBOUNCE_MS = 300

/** `value` once it has stayed the same for `ms`. The first value is returned at once. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}
