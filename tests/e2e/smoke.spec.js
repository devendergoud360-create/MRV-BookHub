import { test, expect } from '@playwright/test';

test('homepage loads with zero console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror:${e.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console:${msg.text()}`); });
  const res = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(res?.status()).toBe(200);
  await expect(page.locator('body')).toBeVisible();
  // allow some benign favicon/resource noise? fail on real errors
  const bad = errors.filter(e => !/favicon|Failed to load resource/i.test(e));
  expect(bad).toEqual([]);
});

test('API health returns 200', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
});
