'use strict';

const { test, expect } = require('@playwright/test');

// docs/compare-mode.md. PR CI builds the frontend with VITE_USE_MOCKS=true.

test('compare mode splits the map, stacks the stats and charts both years', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto('/');
  await page.getByTestId('compare-toggle').click();

  const yearA = page.getByTestId('compare-year-a');
  const yearB = page.getByTestId('compare-year-b');
  await expect(yearA).toBeVisible();
  await expect(yearB).toBeVisible();
  await yearA.selectOption('2010');
  await yearB.selectOption('2020');

  await expect(page.getByTestId('compare-label-a')).toContainText('2010');
  await expect(page.getByTestId('compare-label-b')).toContainText('2020');
  await expect(page.getByTestId('compare-stats').getByTestId('stat-frp')).toHaveCount(2);
  await expect(page.getByTestId('compare-stats').getByTestId('stat-total')).toHaveCount(2);
  await expect(page.getByTestId('compare-bars').getByTestId('compare-bar')).toHaveCount(24);

  const divider = page.getByTestId('compare-divider');
  const start = Number(await divider.getAttribute('aria-valuenow'));
  expect(start).toBeGreaterThan(15);
  const map = await page.locator('.leaflet-container').boundingBox();
  const handle = await divider.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(map.x + map.width * 0.25, handle.y + handle.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await divider.getAttribute('aria-valuenow'))).toBeLessThan(Math.min(start, 35));

  await divider.focus();
  const before = Number(await divider.getAttribute('aria-valuenow'));
  await page.keyboard.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', String(before + 2));

  await page.getByTestId('compare-toggle').click();
  await expect(divider).toBeHidden();
  await expect(page.getByTestId('compare-bars')).toBeHidden();
  await expect(page.getByTestId('stat-total')).toHaveCount(1);

  expect(errors).toEqual([]);
});

test.describe('phone viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('compare mode fits the screen without scrolling', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Filters' }).click();
    await page.getByTestId('compare-toggle').click();
    await page.getByRole('button', { name: 'Filters' }).click();

    await expect(page.getByTestId('compare-divider')).toBeVisible();
    await expect(page.getByTestId('compare-stats').getByTestId('stat-total')).toHaveCount(2);

    await page.getByRole('button', { name: 'Show calendar' }).click();
    await expect(page.getByTestId('compare-bars')).toBeVisible();

    const size = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
    expect(size).toEqual([390, 844]);
  });
});
