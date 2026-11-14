'use strict';

const { test, expect } = require('@playwright/test');

// docs/area-select.md. PR CI builds the frontend with VITE_USE_MOCKS=true, so
// this checks the UI only: mocks make no /api request.

const toNumber = (text) => Number(text.replace(/[^\d.]/g, ''));

async function statTotal(page) {
  return toNumber(await page.getByTestId('stat-total').innerText());
}

test('drawing a rectangle filters the dashboard and Clear restores it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  // Same-origin console errors only: map tiles come from a third-party CDN,
  // and web.spec.js already owns the page-wide console check.
  page.on('console', (msg) => {
    const { url } = msg.location();
    if (msg.type() !== 'error' || url.includes('favicon')) return;
    if (url && new URL(url).origin !== new URL(page.url()).origin) return;
    errors.push(`console: ${msg.text()} @ ${url}`);
  });

  await page.goto('/');
  const stats = page.locator('[aria-busy]').filter({ has: page.getByTestId('stat-total') });
  await expect(stats).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => statTotal(page)).toBeGreaterThan(0);
  const fullTotal = await statTotal(page);

  // Geoman rectangle: click one corner, move, click the opposite corner.
  // A box over the middle 30% of the map (centered on Italy) holds some mock
  // clusters but not all of them.
  const map = page.locator('.leaflet-container');
  const box = await map.boundingBox();
  // The stats panel covers the map's right side on desktop: draw in the visible part.
  const statsPanel = await page.getByRole('complementary', { name: 'Statistics' }).boundingBox();
  const visibleWidth = statsPanel ? statsPanel.x - box.x : box.width;
  const cx = box.x + visibleWidth / 2;
  const cy = box.y + box.height / 2;
  const dx = visibleWidth * 0.15;
  const dy = box.height * 0.15;

  await page.locator('[title="Draw Rectangle"]').click();
  await page.mouse.click(cx - dx, cy - dy);
  await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
  await page.mouse.click(cx + dx, cy + dy);

  const panel = page.getByTestId('selection-panel');
  await expect(panel).toBeVisible();
  await expect.poll(async () => toNumber(await page.getByTestId('selection-area').innerText())).toBeGreaterThan(0);

  await expect(stats).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => statTotal(page)).toBeLessThan(fullTotal);
  const areaTotal = await statTotal(page);
  expect(areaTotal).toBeGreaterThan(0);
  await expect(page.getByTestId('selection-count')).toHaveText(areaTotal.toLocaleString('en-US'));

  await page.getByTestId('selection-clear').click();
  await expect(panel).toBeHidden();
  await expect.poll(() => statTotal(page)).toBe(fullTotal);

  expect(errors).toEqual([]);
});

test.describe('phone viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('collapsed selection card has a clear button that does not expand it', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => statTotal(page)).toBeGreaterThan(0);

    // Upper band of the map: clear of the legend (bottom-left) and the toolbar (right).
    const box = await page.locator('.leaflet-container').boundingBox();
    await page.locator('[title="Draw Rectangle"]').click();
    await page.mouse.click(box.x + box.width * 0.35, box.y + 60);
    await page.mouse.move(box.x + box.width * 0.65, box.y + 110, { steps: 5 });
    await page.mouse.click(box.x + box.width * 0.65, box.y + 110);

    const panel = page.getByTestId('selection-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('selection-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('selection-clear')).toBeHidden();

    const clear = page.getByRole('button', { name: 'Clear selection' });
    await expect(clear).toHaveAttribute('data-testid', 'selection-clear-compact');
    const target = await clear.boundingBox();
    expect(target.width).toBeGreaterThanOrEqual(32);
    expect(target.height).toBeGreaterThanOrEqual(32);

    await clear.click();
    await expect(panel).toBeHidden();
  });
});
