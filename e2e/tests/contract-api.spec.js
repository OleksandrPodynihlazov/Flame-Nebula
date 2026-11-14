'use strict';

// Tests for the future endpoints in docs/contracts.md section [3].
// Unfix each test when api/ ships the endpoint.

const { test, expect } = require('@playwright/test');

const CSV_COLUMNS = [
  'id', 'latitude', 'longitude', 'acq_date', 'acq_time', 'sensor',
  'satellite', 'daynight', 'frp', 'confidence', 'type',
];
const ITALY_BBOX = { lonMin: 6, lonMax: 19, latMin: 35, latMax: 48 };
const YEAR_2008 = { from: '2008-01-01', to: '2008-12-31' };

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
  const body = await res.json();
  expect(typeof body.error).toBe('string');
}

test.describe('GET /api/stats', () => {
  test.fixme('total, by_type and by_daynight are consistent', async ({ request }) => {
    const body = await getJson(request, '/api/stats');
    expect(Number.isInteger(body.total)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(0);
    for (const key of Object.keys(body.by_type)) {
      expect(['0', '1', '2', '3']).toContain(key);
    }
    const { D = 0, N = 0 } = body.by_daynight;
    expect(Object.keys(body.by_daynight).every((k) => k === 'D' || k === 'N')).toBe(true);
    expect(D + N).toBe(body.total);
  });
});

test.describe('GET /api/calendar', () => {
  test.fixme('days are sorted, in range, and sum to stats total', async ({ request }) => {
    const { days } = await getJson(request, '/api/calendar', YEAR_2008);
    expect(Array.isArray(days)).toBe(true);
    const dates = days.map((d) => d.date);
    expect(dates).toEqual([...dates].sort());
    for (const { date, count } of days) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(date >= YEAR_2008.from && date <= YEAR_2008.to).toBe(true);
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(0);
    }
    const sum = days.reduce((acc, d) => acc + d.count, 0);
    const stats = await getJson(request, '/api/stats', YEAR_2008);
    expect(sum).toBe(stats.total);
  });
});

test.describe('GET /api/hotspots', () => {
  test.fixme('returns a GeoJSON FeatureCollection of points in Italy', async ({ request }) => {
    const body = await getJson(request, '/api/hotspots', YEAR_2008);
    expect(body.type).toBe('FeatureCollection');
    expect(Array.isArray(body.features)).toBe(true);
    for (const feature of body.features) {
      expect(feature.type).toBe('Feature');
      expect(feature.geometry.type).toBe('Point');
      const [lon, lat] = feature.geometry.coordinates;
      expect(lon).toBeGreaterThanOrEqual(ITALY_BBOX.lonMin);
      expect(lon).toBeLessThanOrEqual(ITALY_BBOX.lonMax);
      expect(lat).toBeGreaterThanOrEqual(ITALY_BBOX.latMin);
      expect(lat).toBeLessThanOrEqual(ITALY_BBOX.latMax);
    }
  });

  test.fixme('hotspots.csv is text/csv with the contract [1] header', async ({ request }) => {
    const res = await request.get('/api/hotspots.csv', { params: YEAR_2008 });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/csv');
    const [header] = (await res.text()).split(/\r?\n/, 1);
    expect(header.split(',')).toEqual(CSV_COLUMNS);
  });
});

test.describe('query validation', () => {
  const badParams = [
    ['radius_km=0', { lat: 41.9, lon: 12.5, radius_km: 0 }],
    ['radius_km=-5', { lat: 41.9, lon: 12.5, radius_km: -5 }],
    ['radius_km=abc', { lat: 41.9, lon: 12.5, radius_km: 'abc' }],
    ['lat=91', { lat: 91, lon: 12.5, radius_km: 50 }],
    ['lon=181', { lat: 41.9, lon: 181, radius_km: 50 }],
    ['from after to', { from: '2008-12-31', to: '2008-01-01' }],
    ['from=not-a-date', { from: 'not-a-date', to: '2008-12-31' }],
    ['malformed polygon JSON', { polygon: '[[12.1,41.8],[12.9,41.8' }],
    ['polygon with < 3 points', { polygon: '[[12.1,41.8],[12.9,41.8]]' }],
  ];

  for (const [name, params] of badParams) {
    test.fixme(`${name} -> 400 JSON error`, async ({ request }) => {
      await expectBadRequest(request, '/api/stats', params);
    });
  }

  test.fixme('area far outside Italy -> 200 with total 0', async ({ request }) => {
    const body = await getJson(request, '/api/stats', { lat: 0, lon: 0, radius_km: 10 });
    expect(body.total).toBe(0);
  });

  test.fixme('date range outside data -> 200 with total 0', async ({ request }) => {
    const body = await getJson(request, '/api/stats', { from: '1990-01-01', to: '1990-12-31' });
    expect(body.total).toBe(0);
  });

  test.fixme('SQL-injection-looking type -> 400, stats still works', async ({ request }) => {
    await expectBadRequest(request, '/api/stats', { type: '0;DROP TABLE hotspots' });
    await getJson(request, '/api/stats');
  });
});
