/** A non-2xx API answer: `message` is the body's `error` text, `status` the HTTP code. */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/** Start of the `GET /api/hotspots?bbox=` row-cap message (docs/contracts.md). */
export const TOO_MANY_IN_VIEW_PREFIX = 'Too many hotspots in view'

/** True for the 400 the API sends when a map view holds more points than `HOTSPOTS_BBOX_MAX_ROWS`. */
export function isTooManyInView(err: unknown): boolean {
  return err instanceof HttpError && err.status === 400 && err.message.startsWith(TOO_MANY_IN_VIEW_PREFIX)
}
