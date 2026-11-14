'use strict';

// docs/viewport.md: bbox filter, GET /api/hotspots/grid, gateway cache. Real API (also in PR CI, where
// the DB is empty: then the answers are empty but still valid).

const { test, expect } = require('@playwright/test');

const YEAR_2008 = { from: '2008-01-01', to: '2008-12-31', sensor: 'MODIS' };
const ITALY_BBOX = '6.00,36.00,19.00,48.00';
const ROME_BBOX = { west: 12.2, south: 41.6, east: 12.8, north: 42.2 };

async function getJson(request, path, params) {
  const res = await request.get(path, { params });
  expect(res.status(), `${path} ${JSON.stringify(params)}`).toBe(200);
  expect(res.headers()['content-type']).toContain('application/json');
  return res.json();
}

async function expectBadRequest(request, path, params) {
  const res = await request.get(path, { params });
  expect(res.status(), `${path} ${JSON.stringify(params)}`).toBe(400);
  expect(res.headers()['content-type']).toContain('application/json');
  expect(typeof (await res.json()).error).toBe('string');
}

test.describe('GET /api/hotspots/grid', () => {
  test('returns { cell, cells } with one valid entry per cell', async ({ request }) => {
    const body = await getJson(request, '/api/hotspots/grid', { ...YEAR_2008, bbox: ITALY_BBOX, cell: 0.5 });
    expect(body.cell).toBe(0.5);
    expect(Array.isArray(body.cells)).toBe(true);
    const keys = new Set();
    for (const c of body.cells) {
      expect(c.lat).toBeGreaterThanOrEqual(36);
      expect(c.lat).toBeLessThanOrEqual(48);
      expect(c.lon).toBeGreaterThanOrEqual(6);
      expect(c.lon).toBeLessThanOrEqual(19);
      expect(Number.isInteger(c.count) && c.count > 0).toBe(true);
      expect([0, 1, 2, 3, null]).toContain(c.type);
      keys.add(`${Math.floor(c.lat / 0.5)}|${Math.floor(c.lon / 0.5)}`);
    }
    // The average position stays inside its own cell, so the cells are distinct.
    expect(keys.size).toBe(body.cells.length);
  });

  test('cell counts add up to the stats total for the same box', async ({ request }) => {
    const [west, south, east, north] = ITALY_BBOX.split(',').map(Number);
    const polygon = JSON.stringify([[west, south], [east, south], [east, north], [west, north]]);
    const grid = await getJson(request, '/api/hotspots/grid', { ...YEAR_2008, bbox: ITALY_BBOX, cell: 1 });
    const stats = await getJson(request, '/api/stats', { ...YEAR_2008, polygon });
    expect(grid.cells.reduce((sum, c) => sum + c.count, 0)).toBe(stats.total);
  });

  test('empty area -> 200 with no cells', async ({ request }) => {
    const body = await getJson(request, '/api/hotspots/grid', { ...YEAR_2008, bbox: '-40.00,-40.00,-39.00,-39.00', cell: 1 });
    expect(body).toEqual({ cell: 1, cells: [] });
  });

  const bad = [
    ['missing bbox', { cell: 1 }],
    ['missing cell', { bbox: ITALY_BBOX }],
    ['cell too small', { bbox: ITALY_BBOX, cell: 0.001 }],
    ['cell too big', { bbox: ITALY_BBOX, cell: 11 }],
    ['cell not a number', { bbox: ITALY_BBOX, cell: 'big' }],
    ['bbox with 3 numbers', { bbox: '6,36,19', cell: 1 }],
    ['bbox west >= east', { bbox: '19,36,6,48', cell: 1 }],
    ['bbox south >= north', { bbox: '6,48,19,36', cell: 1 }],
    ['bbox out of range', { bbox: '6,36,181,48', cell: 1 }],
  ];
  for (const [name, params] of bad) {
    test(`${name} -> 400 JSON error`, async ({ request }) => {
      await expectBadRequest(request, '/api/hotspots/grid', params);
    });
  }

  test('more than 20,000 cells -> 400', async ({ request }) => {
    const res = await request.get('/api/hotspots/grid', { params: { bbox: '-180,-90,180,90', cell: 0.01 } });
    // An empty DB has no cells at all, so the cap can only trigger with data loaded.
    if (res.status() === 200) {
      expect((await res.json()).cells.length).toBeLessThanOrEqual(20000);
      return;
    }
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('Too many cells, zoom in or use a bigger cell');
  });
});

test.describe('bbox on /api/hotspots', () => {
  test('every point is inside the box', async ({ request }) => {
    const { west, south, east, north } = ROME_BBOX;
    const body = await getJson(request, '/api/hotspots', { ...YEAR_2008, bbox: `${west},${south},${east},${north}` });
    expect(body.type).toBe('FeatureCollection');
    for (const f of body.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon >= west && lon <= east && lat >= south && lat <= north, `${lon},${lat}`).toBe(true);
    }
  });

  test('bad bbox -> 400', async ({ request }) => {
    await expectBadRequest(request, '/api/hotspots', { bbox: '12.8,41.6,12.2,42.2' });
  });
});

test.describe('gateway cache', () => {
  test('a repeated API request is served from the cache, health never is', async ({ request }) => {
    // Unique query so the first request is a guaranteed miss, even on a warm cache.
    const params = { ...YEAR_2008, bbox: ITALY_BBOX, cell: 2, daynight: 'N', type: `0,1,2,3` };
    params.from = `2008-01-0${1 + (Date.now() % 9)}`;
    const first = await request.get('/api/hotspots/grid', { params });
    expect(first.status()).toBe(200);
    expect(['MISS', 'HIT', 'EXPIRED', 'UPDATING']).toContain(first.headers()['x-cache-status']);
    const second = await request.get('/api/hotspots/grid', { params });
    expect(second.headers()['x-cache-status']).toBe('HIT');
    expect(await second.json()).toEqual(await first.json());

    const health = await request.get('/api/health');
    expect(health.headers()['x-cache-status']).toBeUndefined();
  });
});
