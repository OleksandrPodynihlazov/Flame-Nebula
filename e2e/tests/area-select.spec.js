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
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = box.width * 0.15;
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
