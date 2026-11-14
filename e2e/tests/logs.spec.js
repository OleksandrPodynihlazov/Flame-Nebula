'use strict';

const { test, expect } = require('@playwright/test');

// Only the unauthenticated case: CI traces are public, so the logs password never appears in tests.
test('/logs/ requires basic auth', async ({ request }) => {
  const res = await request.get('/logs/', { maxRedirects: 0 });
  expect(res.status()).toBe(401);
  expect(res.headers()['www-authenticate']).toMatch(/^Basic /);
});
