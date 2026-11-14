'use strict';

const { test, expect } = require('@playwright/test');

test('unknown api path returns 404 JSON error', async ({ request }) => {
  const res = await request.get('/api/does-not-exist');
  expect(res.status()).toBe(404);
  expect(res.headers()['content-type']).toContain('application/json');
  const body = await res.json();
  expect(typeof body.error).toBe('string');
});

test('unicode and encoded chars in path return 4xx JSON, never 5xx', async ({ request }) => {
  const res = await request.get('/api/%E2%9C%93?x=%00');
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
  expect(res.headers()['content-type']).toContain('application/json');
  const body = await res.json();
  expect(typeof body.error).toBe('string');
});

test('very long path does not cause a 5xx', async ({ request }) => {
  const res = await request.get(`/api/${'a'.repeat(5000)}`);
  expect(res.status()).toBeLessThan(500);
  expect([404, 414]).toContain(res.status());
});
