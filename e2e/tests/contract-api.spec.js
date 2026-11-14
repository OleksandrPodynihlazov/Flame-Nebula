'use strict';

// Tests for the future endpoints in docs/contracts.md section [3].
// Unfix each test when api/ ships the endpoint.

const { test, expect } = require('@playwright/test');

const CSV_COLUMNS = [
  'id', 'latitude', 'longitude', 'acq_date', 'acq_time', 'sensor',
  'satellite', 'daynight', 'frp', 'confidence', 'type',
];
const YEAR_2008 = { from: '2008-01-01', to: '2008-12-31' };
const ROME_CIRCLE = { lat: 41.9, lon: 12.5, radius_km: 300 };
// Same Earth radius as the API's haversine filter (api/lib/query.js).
const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

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
  test('total, by_type and by_daynight are consistent', async ({ request }) => {
    const body = await getJson(request, '/api/stats');
    expect(Number.isInteger(body.total)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(0);
    for (const key of Object.keys(body.by_type)) {
      expect(['0', '1', '2', '3']).toContain(key);
    }
    const { D = 0, N = 0 } = body.by_daynight;
    expect(Object.keys(body.by_daynight).every((k) => k === 'D' || k === 'N')).toBe(true);
    expect(D + N).toBe(body.total);
    expect(typeof body.frp_sum).toBe('number');
    expect(body.frp_sum).toBeGreaterThanOrEqual(0);
  });
});

test.describe('GET /api/calendar', () => {
  test('days are sorted, in range, and sum to stats total', async ({ request }) => {
    const { days } = await getJson(request, '/api/calendar', YEAR_2008);
    expect(Array.isArray(days)).toBe(true);
    const dates = days.map((d) => d.date);
    expect(dates).toEqual([...dates].sort());
    for (const { date, count, frp } of days) {
      expect(typeof frp).toBe('number');
      expect(frp).toBeGreaterThanOrEqual(0);
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(date >= YEAR_2008.from && date <= YEAR_2008.to).toBe(true);
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(0);
    }
    const sum = days.reduce((acc, d) => acc + d.count, 0);
    const stats = await getJson(request, '/api/stats', YEAR_2008);
    expect(sum).toBe(stats.total);
    const frpSum = days.reduce((acc, d) => acc + d.frp, 0);
    expect(Math.abs(frpSum - stats.frp_sum)).toBeLessThan(days.length * 0.05 + 0.1);
  });
});

test.describe('GET /api/hotspots', () => {
  test('returns a GeoJSON FeatureCollection of points inside the requested circle', async ({ request }) => {
    const body = await getJson(request, '/api/hotspots', { ...YEAR_2008, ...ROME_CIRCLE });
    expect(body.type).toBe('FeatureCollection');
    expect(Array.isArray(body.features)).toBe(true);
    for (const feature of body.features) {
      expect(feature.type).toBe('Feature');
      expect(feature.geometry.type).toBe('Point');
      const [lon, lat] = feature.geometry.coordinates;
      // Small tolerance for float rounding of the returned coordinates.
      expect(haversineKm(ROME_CIRCLE.lat, ROME_CIRCLE.lon, lat, lon))
        .toBeLessThanOrEqual(ROME_CIRCLE.radius_km * 1.001);
    }
  });

  test('hotspots.csv is text/csv with the contract [1] header', async ({ request }) => {
    const res = await request.get('/api/hotspots.csv', { params: YEAR_2008 });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/csv');
    const [header] = (await res.text()).split(/\r?\n/, 1);
    expect(header.split(',')).toEqual(CSV_COLUMNS);
  });
});

// The selection card's numbers as the browser used to compute them from every dot of the area
// (frontend/src/utils/selectionSummary.ts before /api/selection-summary), in the endpoint's shape.
function summaryFromDots(features) {
  const out = {
    total: features.length, frp: null, peak_month: null, peak_day: null, first: null, last: null,
    by_type: {}, by_daynight: {},
  };
  const days = new Map();
  let sum = 0;
  let n = 0;
  let max = -Infinity;
  for (const { properties: p } of features) {
    if (p.type !== null) out.by_type[p.type] = (out.by_type[p.type] ?? 0) + 1;
    out.by_daynight[p.daynight] = (out.by_daynight[p.daynight] ?? 0) + 1;
    if (p.frp !== null) {
      sum += p.frp;
      n += 1;
      max = Math.max(max, p.frp);
    }
    days.set(p.acq_date, (days.get(p.acq_date) ?? 0) + 1);
  }
  if (n) out.frp = { sum, mean: sum / n, max };
  const months = new Map();
  const sorted = [...days.keys()].sort();
  for (const date of sorted) {
    const count = days.get(date);
    months.set(date.slice(0, 7), (months.get(date.slice(0, 7)) ?? 0) + count);
    if (!out.peak_day || count > out.peak_day.count) out.peak_day = { date, count };
  }
  for (const [month, count] of months) {
    if (!out.peak_month || count > out.peak_month.count) out.peak_month = { month, count };
  }
  out.first = sorted[0] ?? null;
  out.last = sorted[sorted.length - 1] ?? null;
  return out;
}

test.describe('GET /api/selection-summary', () => {
  const SICILY_2020 = {
    from: '2020-01-01', to: '2020-12-31', sensor: 'MODIS,VIIRS',
    polygon: '[[12.3,36.6],[15.7,36.6],[15.7,38.3],[12.3,38.3]]',
  };

  for (const [name, params] of [['Rome circle 2008', { ...YEAR_2008, ...ROME_CIRCLE }], ['Sicily box 2020', SICILY_2020]]) {
    test(`${name}: equals the summary of the same area's /api/hotspots dots`, async ({ request }) => {
      const [summary, dots] = await Promise.all([
        getJson(request, '/api/selection-summary', params),
        getJson(request, '/api/hotspots', params),
      ]);
      const expected = summaryFromDots(dots.features);
      const { frp, ...rest } = summary;
      const { frp: expectedFrp, ...expectedRest } = expected;
      expect(rest).toEqual(expectedRest);
      if (expectedFrp === null) {
        expect(frp).toBeNull();
      } else {
        // SQL and JS add the FRP values in a different order: last-bit differences only.
        expect(Math.abs(frp.sum - expectedFrp.sum)).toBeLessThan(1e-6 * Math.max(1, expectedFrp.sum));
        expect(Math.abs(frp.mean - expectedFrp.mean)).toBeLessThan(1e-9 * Math.max(1, expectedFrp.mean));
        expect(frp.max).toBe(expectedFrp.max);
      }
      const stats = await getJson(request, '/api/stats', params);
      expect(summary.total).toBe(stats.total);
      expect(summary.by_type).toEqual(stats.by_type);
    });
  }

  test('no match -> 200 with zeros and nulls', async ({ request }) => {
    const body = await getJson(request, '/api/selection-summary', { from: '1990-01-01', to: '1990-12-31' });
    expect(body).toEqual({
      total: 0, frp: null, peak_month: null, peak_day: null, first: null, last: null, by_type: {}, by_daynight: {},
    });
  });

  test('shared params are validated like /api/stats', async ({ request }) => {
    await expectBadRequest(request, '/api/selection-summary', { polygon: '[[12.1,41.8],[12.9,41.8]]' });
    await expectBadRequest(request, '/api/selection-summary', { region: 1, lat: 41.9, lon: 12.5, radius_km: 50 });
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
    ['type=7', { type: '7' }],
    ['sensor=GOES', { sensor: 'GOES' }],
    ['polygon with 201 points', {
      // 5 decimals, as the frontend sends them: full-precision floats would hit nginx's 8 KB URL limit (HTML 414)
      polygon: JSON.stringify(Array.from({ length: 201 }, (_, i) => [
        Math.round((12 + Math.cos(i) / 10) * 1e5) / 1e5, Math.round((41 + Math.sin(i) / 10) * 1e5) / 1e5,
      ])),
    }],
    ['region and polygon together', { region: 1, polygon: '[[12.1,41.8],[12.9,41.8],[12.5,42.2]]' }],
    ['region and circle together', { region: 1, lat: 41.9, lon: 12.5, radius_km: 50 }],
    ['unknown region', { region: 2147483647 }],
    ['region not an id', { region: 'sicily' }],
  ];

  for (const [name, params] of badParams) {
    test(`${name} -> 400 JSON error`, async ({ request }) => {
      await expectBadRequest(request, '/api/stats', params);
    });
  }

  test('area far outside Italy -> 200 with total 0', async ({ request }) => {
    const body = await getJson(request, '/api/stats', { lat: 0, lon: 0, radius_km: 10 });
    expect(body.total).toBe(0);
  });

  test('region filter count is within the unfiltered total', async ({ request }) => {
    const { regions } = await getJson(request, '/api/regions', { q: 'sicil' });
    const sicilia = regions.find((r) => r.name === 'Sicilia' && r.country === 'ITA');
    test.skip(!sicilia, 'regions not loaded in this DB');
    const all = await getJson(request, '/api/stats');
    const one = await getJson(request, '/api/stats', { region: sicilia.id });
    expect(one.total).toBeGreaterThan(0);
    expect(one.total).toBeLessThanOrEqual(all.total);
  });

  test('date range outside data -> 200 with total 0', async ({ request }) => {
    const body = await getJson(request, '/api/stats', { from: '1990-01-01', to: '1990-12-31' });
    expect(body.total).toBe(0);
  });

  test('SQL-injection-looking type -> 400, stats still works', async ({ request }) => {
    await expectBadRequest(request, '/api/stats', { type: '0;DROP TABLE hotspots' });
    await getJson(request, '/api/stats');
  });
});
