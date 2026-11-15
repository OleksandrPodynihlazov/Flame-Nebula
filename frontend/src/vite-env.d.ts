interface ImportMetaEnv {
  readonly VITE_USE_MOCKS?: string
  /** Fake latency for mock responses, in ms. Unset → no delay. */
  readonly VITE_MOCK_DELAY_MS?: string
  /** Number of generated mock hotspots (dev server only). Unset → 6689. */
  readonly VITE_MOCK_SIZE?: string
  /**
   * Mock endpoints that reject with HTTP 503 (dev server only), comma list:
   * hotspots, grid, stats, calendar, selection-summary, patterns, pattern-summary.
   */
  readonly VITE_MOCK_FAIL?: string
}
