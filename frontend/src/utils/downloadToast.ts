import { toast } from 'sonner'

/** Loading → success / error toast around one download. `rows` (if known once it finishes) is added to the success text. */
export function downloadToast(kind: 'CSV' | 'GeoJSON', run: Promise<void>, rows?: () => number | null): void {
  toast.promise(run, {
    loading: `Preparing ${kind}…`,
    success: () => {
      const n = rows?.() ?? null
      return n === null ? `${kind} downloaded` : `${kind} downloaded · ${n.toLocaleString('en-US')} rows`
    },
    error: (err: unknown) => `Could not download ${kind}: ${err instanceof Error ? err.message : String(err)}`,
  })
}
