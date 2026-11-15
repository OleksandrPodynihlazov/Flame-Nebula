'use strict';

const { test, expect } = require('@playwright/test');

// docs/contracts.md [1b] / [3]: fire confidence and include_non_fire. PR CI builds
// the frontend with VITE_USE_MOCKS=true, so no /api request is made: this checks the
// UI against the mock API (which hides non_fire points unless include_non_fire=true).

const toNumber = (text) => Number(text.replace(/[^\d.]/g, ''));

async function statTotal(page) {
  return toNumber(await page.getByTestId('stat-total').innerText());
}

test('the legend explains fire confidence', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Hotspot types' }).click();
  const section = page.getByTestId('legend-confidence');
  await expect(section).toBeVisible();
  for (const label of ['Confirmed', 'Likely', 'Unverified', 'Doubtful', 'No score']) {
    await expect(section.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(section.getByText('Shown on single dots — zoom in.')).toBeVisible();
});

test('Show non-fire points adds the hidden points to the total', async ({ page }) => {
  await page.goto('/');
  const stats = page.locator('[aria-busy]').filter({ has: page.getByTestId('stat-total') });
  await expect(stats).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => statTotal(page)).toBeGreaterThan(0);
  const hiddenTotal = await statTotal(page);

  // The mock data has non_fire points; a DB without confidence rows (every point
  // unscored, by_class.non_fire = {}) hides none, so the line is absent there.
  const hiddenLine = page.getByTestId('hidden-non-fire');
  const hidesSome = (await hiddenLine.count()) > 0;
  if (hidesSome) await expect(hiddenLine).toContainText('non-fire');

  await page.getByRole('button', { name: 'Filters' }).click();
  const toggle = page.getByRole('switch', { name: /Show non-fire points/ });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();

  if (hidesSome) {
    await expect.poll(() => statTotal(page)).toBeGreaterThan(hiddenTotal);
  } else {
    await expect(stats).toHaveAttribute('aria-busy', 'false');
    expect(await statTotal(page)).toBe(hiddenTotal);
  }
  await expect(hiddenLine).toHaveCount(0);

  await toggle.click();
  await expect.poll(() => statTotal(page)).toBe(hiddenTotal);
});
