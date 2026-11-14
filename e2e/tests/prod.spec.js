'use strict';

const { test, expect } = require('@playwright/test');

// Host-nginx behaviour (TLS, redirect, security headers); the local stack has none of it.
test.describe('production edge', { tag: '@prod' }, () => {
  test.skip(({ baseURL }) => !baseURL.startsWith('https://'), 'needs an https BASE_URL');

  test('http redirects to https with 301', async ({ request, baseURL }) => {
    const { host } = new URL(baseURL);
    const res = await request.get(`http://${host}/`, { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers().location).toBe(`https://${host}/`);
  });

  for (const path of ['/', '/api/health']) {
    test(`https ${path} sends security headers`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.ok()).toBe(true);
      const headers = res.headers();
      expect(headers['strict-transport-security']).toMatch(/max-age=\d+/);
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBeTruthy();
    });
  }
});
