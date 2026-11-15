'use strict';

const { test, expect } = require('@playwright/test');

// Pattern view: docs/patterns-view.md. PR CI builds the frontend with VITE_USE_MOCKS=true.

async function openPatterns(page) {
  await page.getByTestId('layers-button').click();
  await page.getByTestId('layer-patterns').click();
  await expect(page.getByTestId('pattern-status')).toContainText('Patterns');
}

test('layers switch to patterns, months change the map, compare splits two months', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto('/');
  await openPatterns(page);

  const months = page.getByTestId('pattern-months').getByRole('radio');
  await expect(months).toHaveCount(12);
  await months.filter({ hasText: 'Jul' }).click();
  await expect(page.getByTestId('pattern-status')).toContainText('July');
  await expect(page.getByTestId('pattern-stats').getByTestId('pattern-likely')).toHaveCount(1);

  await page.getByTestId('compare-toggle').click();
  await expect(page.getByTestId('compare-month-a')).toBeVisible();
  await page.getByTestId('compare-month-b').selectOption('8');
  await expect(page.getByTestId('compare-divider')).toBeVisible();
  await expect(page.getByTestId('compare-label-b')).toContainText('August');
  await expect(page.getByTestId('pattern-stats').getByTestId('pattern-likely')).toHaveCount(2);
  await expect(page.getByTestId('compare-bars').getByTestId('compare-bar')).toHaveCount(6);

  await page.getByTestId('compare-toggle').click();
  await page.getByTestId('layers-button').click();
  await page.getByTestId('layer-spots').click();
  await expect(page.getByTestId('pattern-status')).toBeHidden();
  await expect(page.getByTestId('stat-total')).toHaveCount(1);

  expect(errors).toEqual([]);
});

test.describe('phone viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('pattern view months fit the sheet without scrolling', async ({ page }) => {
    await page.goto('/');
    await openPatterns(page);
    await page.getByRole('button', { name: 'Show calendar' }).click();
    await expect(page.getByTestId('pattern-months').getByRole('radio')).toHaveCount(12);
    const size = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
    expect(size).toEqual([390, 844]);
  });
});
