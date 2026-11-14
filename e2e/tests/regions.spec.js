'use strict';

// GET /api/regions and /api/regions/:id (docs/contracts.md [3]).
// The CI stack starts with an empty DB: regions are then an empty list, and the
// data-dependent checks skip. Locally / on the VPS run ingest/load_regions.py first.

const { test, expect } = require('@playwright/test');

async function getJson(request, path, params, status = 200) {
  const res = await request.get(path, { params });
  expect(res.status(), `${path} ${JSON.stringify(params)}`).toBe(status);
  expect(res.headers()['content-type']).toContain('application/json');
  return res.json();
}

test.describe('GET /api/regions', () => {
  test('no params lists countries (level 0)', async ({ request }) => {
    const body = await getJson(request, '/api/regions');
    expect(Array.isArray(body.regions)).toBe(true);
    for (const r of body.regions) {
      expect(r.level).toBe(0);
      expect(Number.isInteger(r.id)).toBe(true);
      expect(typeof r.name).toBe('string');
      expect(r.country).toMatch(/^[A-Z0-9]{3}$/);
      expect(r.path).toBe('');
    }
  });

  test('q=sicil finds Sicilia (ADM2 of Italy) and its outline', async ({ request }) => {
    const countries = (await getJson(request, '/api/regions')).regions;
    test.skip(countries.length === 0, 'regions not loaded in this DB');

    const { regions } = await getJson(request, '/api/regions', { q: 'sicil' });
    const sicilia = regions.find((r) => r.name === 'Sicilia' && r.country === 'ITA');
    expect(sicilia).toMatchObject({ level: 2, path: 'Italy › Isole' });

    const feature = await getJson(request, `/api/regions/${sicilia.id}`);
    expect(feature.type).toBe('Feature');
    expect(['Polygon', 'MultiPolygon']).toContain(feature.geometry.type);
    expect(feature.properties).toMatchObject({ id: sicilia.id, name: 'Sicilia', level: 2, country: 'ITA' });

    const children = (await getJson(request, '/api/regions', { parent: String(sicilia.parent_id) })).regions;
    expect(children.map((r) => r.name)).toContain('Sicilia');
  });

  for (const [params, why] of [
    [{ q: 'a' }, 'q too short'],
    [{ q: 'si', parent: '1' }, 'q and parent together'],
    [{ parent: 'abc' }, 'parent not an id'],
  ]) {
    test(`400 when ${why}`, async ({ request }) => {
      const body = await getJson(request, '/api/regions', params, 400);
      expect(typeof body.error).toBe('string');
    });
  }

  test('unknown region outline is 404 JSON', async ({ request }) => {
    const body = await getJson(request, '/api/regions/2147483647', undefined, 404);
    expect(body.error).toContain('2147483647');
  });
});
