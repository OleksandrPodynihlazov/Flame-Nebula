'use strict';

const { test, expect } = require('@playwright/test');

// Calendar keyboard navigation, tooltip and phone month tiles (docs/plans/ui-overhaul.md, Phase 4).
// PR CI builds the frontend with VITE_USE_MOCKS=true, so the 2008 calendar comes from the mocks.

const toNumber = (text) => Number(text.replace(/[^\d.]/g, ''));

async function waitForCalendar(page) {
  const stats = page.locator('[aria-busy]').filter({ has: page.getByTestId('stat-total') });
  await expect(stats).toHaveAttribute('aria-busy', 'false');
  await expect.poll(async () => toNumber(await page.getByTestId('stat-total').innerText())).toBeGreaterThan(0);
}

test.describe('desktop calendar', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('exactly one grid cell is tabbable; arrows move focus, Enter selects, Escape clears', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);

    const cells = page.getByRole('gridcell');
    const tabbable = page.locator('[role="gridcell"][tabindex="0"]');
    await expect(tabbable).toHaveCount(1);

    await tabbable.focus();
    const startName = await tabbable.getAttribute('aria-label');
    await page.keyboard.press('ArrowRight');
    await expect(tabbable).toHaveCount(1);
    await expect(tabbable).toBeFocused();
    await expect(tabbable).not.toHaveAttribute('aria-label', startName);
    const nextName = await tabbable.getAttribute('aria-label');

    await page.keyboard.press('ArrowLeft');
    await expect(tabbable).toHaveAttribute('aria-label', startName);
    await page.keyboard.press('ArrowRight');
    await expect(tabbable).toHaveAttribute('aria-label', nextName);

    const before = toNumber(await page.getByTestId('stat-total').innerText());
    await page.keyboard.press('Enter');
    await expect(page.getByRole('gridcell', { name: nextName, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => toNumber(await page.getByTestId('stat-total').innerText())).not.toBe(before);

    await page.keyboard.press('Escape');
    await expect(cells.and(page.locator('[aria-selected="true"]'))).toHaveCount(0);
    await expect.poll(async () => toNumber(await page.getByTestId('stat-total').innerText())).toBe(before);
  });

  test('Down moves to the same day one month later, Home goes to the first of the month', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    const tabbable = page.locator('[role="gridcell"][tabindex="0"]');
    await tabbable.focus();
    await page.keyboard.press('Home');
    await expect(tabbable).toHaveAttribute('aria-label', /^1 \w+:/);
    const month = (await tabbable.getAttribute('aria-label')).split(':')[0].replace(/^1 /, '');
    await page.keyboard.press('ArrowDown');
    await expect(tabbable).toBeFocused();
    await expect(tabbable).toHaveAttribute('aria-label', /^1 \w+:/);
    await expect(tabbable).not.toHaveAttribute('aria-label', new RegExp(`^1 ${month}:`));
  });

  test('hovering a day shows a tooltip with its hotspot count', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    const day = page.getByRole('gridcell', { name: /^15 August: \d+ hotspots?$/ });
    const count = Number((await day.getAttribute('aria-label')).match(/: (\d+)/)[1]);
    await day.hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Fri 15 Aug 2008');
    await expect(tip).toContainText(`${count.toLocaleString('en-US')} hotspot`);
    await expect(tip).toContainText('Click to filter the map');
    await page.mouse.move(5, 5);
    await expect(tip).toBeHidden();
  });

  test('the keyboard-focused day describes itself with the tooltip', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await page.locator('[role="gridcell"][tabindex="0"]').focus();
    await page.keyboard.press('ArrowRight');
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    const id = await tip.getAttribute('id');
    await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveAttribute('aria-describedby', id);
  });
});

test.describe('phone calendar', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a month tile is a button that opens its days', async ({ page }) => {
    await page.goto('/');
    const show = page.getByRole('button', { name: 'Show calendar' });
    if (await show.isVisible()) await show.click();
    const august = page.getByRole('button', { name: /^August: \d+ hotspots$/ });
    await expect(august).toBeVisible();
    await august.click();
    await expect(page.getByTestId('calendar-month')).toHaveText('August');
    await expect(page.getByRole('gridcell', { name: /^15 August: \d+ hotspots$/ })).toBeVisible();
  });
});

test.describe('empty state', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('an area without hotspots shows the empty state and Clear area brings the data back', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    const fullTotal = toNumber(await page.getByTestId('stat-total').innerText());

    // Mock hotspots sit on land; the far south-west corner of the map (open sea) holds none.
    const box = await page.locator('.leaflet-container').boundingBox();
    const cx = box.x + box.width * 0.12;
    const cy = box.y + box.height * 0.88;
    await page.locator('[title="Draw Rectangle"]').click();
    await page.mouse.click(cx - 20, cy - 20);
    await page.mouse.move(cx + 20, cy + 20, { steps: 8 });
    await page.mouse.click(cx + 20, cy + 20);

    const empty = page.getByTestId('empty-state');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('No hotspots');
    await empty.getByRole('button', { name: 'Clear area' }).click();
    await expect(empty).toBeHidden();
    await expect.poll(async () => toNumber(await page.getByTestId('stat-total').innerText())).toBe(fullTotal);
  });
});
