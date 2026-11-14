'use strict';

const { test, expect } = require('@playwright/test');

test('GET /api/health reports ok with a version', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/json');

  const body = await res.json();
  expect(body.status).toBe('ok');
  expect(body.db).toBe('ok');
  expect(typeof body.version).toBe('string');
  expect(body.version.length).toBeGreaterThan(0);

  if (process.env.EXPECTED_VERSION) {
    expect(body.version).toBe(process.env.EXPECTED_VERSION);
  }
});
