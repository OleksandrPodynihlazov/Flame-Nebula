import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/** A failed request: the server's message and a button that asks again. */
export function ErrorAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive" className="border-destructive/40" data-testid="load-error">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Could not load data</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      <div className="col-start-2 mt-1.5">
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </Alert>
  )
}
