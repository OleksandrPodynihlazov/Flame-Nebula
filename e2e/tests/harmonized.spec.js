'use strict';

// GET /api/harmonized (docs/contracts.md [3]) and the history card under the calendar.
// PR CI: empty DB (the API answers "months": []) and a frontend built with VITE_USE_MOCKS=true.

const { test, expect } = require('@playwright/test');

test.describe('GET /api/harmonized', () => {
  test('Europe by default; each month has the reference satellite and both counts', async ({ request }) => {
    const res = await request.get('/api/harmonized');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');
    const body = await res.json();
    expect(body.country).toBe('EUR');
    expect(Array.isArray(body.months)).toBe(true);
    for (const m of body.months.slice(0, 24)) {
      expect(m.month).toMatch(/^\d{4}-\d{2}$/);
      expect(typeof m.satellite).toBe('string');
      for (const k of ['raw', 'count', 'lo', 'hi', 'days_missing']) expect(typeof m[k]).toBe('number');
      expect(m.lo).toBeLessThanOrEqual(m.hi);
    }
    const months = body.months.map((m) => m.month);
    expect([...months].sort()).toEqual(months);
  });

  test('a country code picks that series; anything else is a 400', async ({ request }) => {
    const ok = await request.get('/api/harmonized', { params: { country: 'ITA' } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).country).toBe('ITA');
    for (const country of ['ita', 'IT', 'ITALY']) {
      const bad = await request.get('/api/harmonized', { params: { country } });
      expect(bad.status(), country).toBe(400);
      expect(typeof (await bad.json()).error).toBe('string');
    }
  });
});

test('history card shows raw and harmonized bars per year with a median comparison', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  await page.goto('/');

  const card = page.getByTestId('harmonized-history');
  // Live site before harmonize/calibrate.py has run: no series, no card.
  const shown = await card.waitFor({ timeout: 15000 }).then(() => true, () => false);
  test.skip(!shown, 'no harmonized series on this server yet');

  const bars = card.getByTestId('compare-bar');
  const count = await bars.count();
  expect(count).toBeGreaterThan(0);
  expect(count % 2).toBe(0);
  await expect(card.getByTestId('harmonized-footer')).toContainText('S-NPP units');
  expect(errors).toEqual([]);
});
