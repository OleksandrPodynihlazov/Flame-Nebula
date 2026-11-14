'use strict';

const { test, expect } = require('@playwright/test');

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (msg.location().url.includes('favicon')) return;
    errors.push(`console: ${msg.text()} @ ${msg.location().url}`);
  });
  return errors;
}

test('home page loads without errors', async ({ page }) => {
  const errors = collectErrors(page);

  const res = await page.goto('/');
  expect(res.status()).toBe(200);
  await expect(page).toHaveTitle(/\S/);

  await page.waitForLoadState('networkidle');
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
