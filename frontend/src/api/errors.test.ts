import { describe, expect, it } from 'vitest'
import { HttpError, isTooManyInView } from './errors'

describe('isTooManyInView', () => {
  it('is true for the 400 row-cap message of the contract', () => {
    expect(isTooManyInView(new HttpError(400, 'Too many hotspots in view (more than 20000). Zoom in.'))).toBe(true)
  })

  it('is false for other 400s, other statuses and the whole-request cap', () => {
    expect(isTooManyInView(new HttpError(400, 'Too many hotspots (more than 500000). Narrow the date range or area.'))).toBe(false)
    expect(isTooManyInView(new HttpError(400, 'Too many cells, zoom in or use a bigger cell'))).toBe(false)
    expect(isTooManyInView(new HttpError(503, 'Too many hotspots in view (more than 20000). Zoom in.'))).toBe(false)
  })

  it('is false for plain errors and non-errors', () => {
    expect(isTooManyInView(new Error('Too many hotspots in view'))).toBe(false)
    expect(isTooManyInView('Too many hotspots in view')).toBe(false)
    expect(isTooManyInView(null)).toBe(false)
  })
})
