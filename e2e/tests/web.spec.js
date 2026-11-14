'use strict';

const { test, expect } = require('@playwright/test');

// Mirrors docs/contracts.md [3] and the test.fixme tests in contract-api.spec.js.
// The frontend falls back to mock data while these return 404.
const PENDING_ENDPOINTS = ['/api/stats', '/api/calendar', '/api/hotspots', '/api/hotspots.csv'];

function collectErrors(page) {
  const errors = [];
  const pending404s = new Set();
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const { url } = msg.location();
    if (url.includes('favicon')) return;
    const pathname = url ? new URL(url).pathname : '';
    if (
      PENDING_ENDPOINTS.includes(pathname) &&
      /^Failed to load resource: .*status of 404\b/.test(msg.text())
    ) {
      pending404s.add(pathname);
      return;
    }
    errors.push(`console: ${msg.text()} @ ${url}`);
  });
  return { errors, pending404s };
}

// Self-expiring: a pending endpoint's 404 is allowed only while the api
// really returns 404 for it. Once it ships, the same console error fails.
async function checkPending404s(request, pending404s) {
  const unexpected = [];
  for (const pathname of pending404s) {
    const status = (await request.get(pathname)).status();
    if (status !== 404) {
      unexpected.push(`console: 404 from ${pathname}, but it now returns ${status}`);
      continue;
    }
    test.info().annotations.push({ type: 'pending-endpoint', description: pathname });
    console.log(`pending-endpoint: allowed 404 from ${pathname} (not shipped yet)`);
  }
  return unexpected;
}

test('home page loads without errors', async ({ page, request }) => {
  const { errors, pending404s } = collectErrors(page);

  const res = await page.goto('/');
  expect(res.status()).toBe(200);
  await expect(page).toHaveTitle(/\S/);

  await page.waitForLoadState('networkidle');
  errors.push(...(await checkPending404s(request, pending404s)));
  expect(errors).toEqual([]);
});

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('home page has no horizontal scroll', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });
});
