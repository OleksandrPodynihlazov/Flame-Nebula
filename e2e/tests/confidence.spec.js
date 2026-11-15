'use strict';

// docs/contracts.md [3]: fire confidence. non_fire points are hidden by default, include_non_fire=true brings
// them back, /api/stats has by_class. Real API; in PR CI the DB is empty (every point unscored), so the
// checks compare endpoints with each other instead of using fixed numbers.

const { test, expect } = require('@playwright/test');

const YEAR_2008 = { from: '2008-01-01', to: '2008-12-31', sensor: 'MODIS' };
const ALL = { include_non_fire: 'true' };
const ITALY_BBOX = '6.00,36.00,19.00,48.00';
const CONFIDENCE_FIELDS = ['confidence_score', 'confidence_class', 'confidence_reasons', 'worldview_url'];
const CLASSES = ['confirmed', 'likely', 'unverified', 'doubtful', 'unscored'];

async function getJson(request, path, params) {
  const res = await request.get(path, { params });
  expect(res.status(), `${path} ${JSON.stringify(params)}`).toBe(200);
  expect(res.headers()['content-type']).toContain('application/json');
  return res.json();
}

const sum = (values) => values.reduce((a, b) => a + b, 0);
const nonFireCount = (byClass) => sum(Object.values(byClass.non_fire));
const classCount = (byClass) => sum(CLASSES.map((c) => byClass[c] ?? 0)) + nonFireCount(byClass);

test('include_non_fire must be true or false -> else 400 JSON', async ({ request }) => {
  for (const value of ['yes', '1', '']) {
    const res = await request.get('/api/stats', { params: { ...YEAR_2008, include_non_fire: value } });
    expect(res.status(), `include_non_fire=${value}`).toBe(400);
    expect(typeof (await res.json()).error).toBe('string');
  }
});

test('stats by_class: known keys, non-negative integers, non_fire split by reason', async ({ request }) => {
  const { by_class: byClass } = await getJson(request, '/api/stats', YEAR_2008);
  expect(typeof byClass.non_fire).toBe('object');
  for (const [key, value] of Object.entries(byClass)) {
    if (key === 'non_fire') continue;
    expect(CLASSES).toContain(key);
    expect(Number.isInteger(value) && value > 0).toBe(true);
  }
  for (const value of Object.values(byClass.non_fire)) expect(Number.isInteger(value) && value > 0).toBe(true);
});

test('by default non_fire is left out of total; include_non_fire=true adds exactly those points', async ({ request }) => {
  const hidden = await getJson(request, '/api/stats', YEAR_2008);
  const all = await getJson(request, '/api/stats', { ...YEAR_2008, ...ALL });
  // by_class always counts every matching point, excluded ones included.
  expect(all.by_class).toEqual(hidden.by_class);
  expect(classCount(all.by_class)).toBe(all.total);
  expect(all.total - hidden.total).toBe(nonFireCount(hidden.by_class));
});

test('calendar, grid and CSV follow the same rule as stats', async ({ request }) => {
  for (const extra of [{}, ALL]) {
    const params = { ...YEAR_2008, ...extra };
    const stats = await getJson(request, '/api/stats', params);
    const { days } = await getJson(request, '/api/calendar', params);
    expect(sum(days.map((d) => d.count)), `calendar ${JSON.stringify(extra)}`).toBe(stats.total);

    const [west, south, east, north] = ITALY_BBOX.split(',').map(Number);
    const polygon = JSON.stringify([[west, south], [east, south], [east, north], [west, north]]);
    const boxStats = await getJson(request, '/api/stats', { ...params, polygon });
    const grid = await getJson(request, '/api/hotspots/grid', { ...params, bbox: ITALY_BBOX, cell: 1 });
    expect(sum(grid.cells.map((c) => c.count)), `grid ${JSON.stringify(extra)}`).toBe(boxStats.total);

    const csv = await request.get('/api/hotspots.csv', { params });
    expect(csv.status()).toBe(200);
    const lines = (await csv.text()).split(/\r?\n/).filter(Boolean);
    expect(lines.length - 1, `csv ${JSON.stringify(extra)}`).toBe(stats.total);
  }
});

test('hotspots carry the 4 confidence fields (null when unscored) and hide non_fire by default', async ({ request }) => {
  const params = { ...YEAR_2008, from: '2008-08-01', to: '2008-08-31', bbox: ITALY_BBOX };
  for (const extra of [{}, ALL]) {
    const { features } = await getJson(request, '/api/hotspots', { ...params, ...extra });
    for (const { properties: p } of features) {
      for (const field of CONFIDENCE_FIELDS) expect(p).toHaveProperty(field);
      if (p.confidence_class === null) {
        expect(p.confidence_score).toBeNull();
      } else {
        expect(Number.isInteger(p.confidence_score) && p.confidence_score >= 0 && p.confidence_score <= 100).toBe(true);
      }
      if (!extra.include_non_fire) expect(String(p.confidence_class)).not.toMatch(/^non_fire/);
    }
  }
});
