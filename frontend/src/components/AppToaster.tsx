import { Toaster } from '@/components/ui/sonner'
import { useIsDesktop } from '../hooks/useMediaQuery'


/**
 * Phone: bottom-centre, lifted above the bottom sheet's peek. Desktop: bottom-left, above the "Hotspot types"
 * button, so it never covers the right-hand stats panel or the map attribution.
 */
export function AppToaster() {
  const desktop = useIsDesktop()
  const aboveSheet = { bottom: 'calc(var(--sheet-peek-h) + 12px)', left: 16, right: 16 }
  return desktop ? (
    <Toaster position="bottom-left" offset={{ bottom: 56, left: 16 }} />
  ) : (
    <Toaster position="bottom-center" offset={aboveSheet} mobileOffset={aboveSheet} />
  )
}
