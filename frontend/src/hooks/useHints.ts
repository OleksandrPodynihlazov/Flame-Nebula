import { useCallback, useState } from 'react'
import { browserStorage, initialStep, markDismissed, nextStep } from '../utils/hints'

export interface Hints {
  /** Index of the step on screen, or null when the guide is closed. */
  step: number | null
  next: () => void
  /** Closes the guide and remembers it (Skip, Esc and Done all end here). */
  dismiss: () => void
  /** Opens the guide again from step 1, for the "Show tips" link. */
  restart: () => void
}

export function useHints(): Hints {
  const [step, setStep] = useState<number | null>(() =>
    initialStep({ webdriver: navigator.webdriver === true, search: window.location.search, storage: browserStorage() }),
  )

  const dismiss = useCallback(() => {
    // A failed write only means the guide returns next visit.
    markDismissed(browserStorage())
    setStep(null)
  }, [])

  const next = useCallback(() => {
    if (step === null) return
    const following = nextStep(step)
    if (following === null) dismiss()
    else setStep(following)
  }, [step, dismiss])

  const restart = useCallback(() => setStep(0), [])

  return { step, next, dismiss, restart }
}
