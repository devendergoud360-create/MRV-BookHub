import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('critical API flows + UI smoke with zero console errors', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror:${e.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console:${msg.text()}`); });

  // UI smoke
  const res = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(res?.status()).toBe(200);
  await expect(page.locator('body')).toContainText(/MRV BookHub|BookHub|Library|Borrow/i);
  await page.screenshot({ path: 'test-results/home.png', fullPage: true });

  // Health
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);

  // Student login
  const login = await request.post('/api/auth/login/student', { data: { hall_ticket_number: '22CSE001', password: 'Password@123' } });
  expect(login.status()).toBe(200);
  const loginBody = await login.json();
  expect(loginBody.success).toBe(true);
  const token = loginBody.data.token;
  const auth = { Authorization: `Bearer ${token}` };

  // Books search/list
  const books = await request.get('/api/books?limit=5');
  expect(books.status()).toBe(200);
  const booksBody = await books.json();
  expect(booksBody.success).toBe(true);

  // Library books
  const lib = await request.get('/api/library/books?limit=5');
  expect(lib.status()).toBe(200);

  // Notifications endpoint auth
  const notes = await request.get('/api/notifications', { headers: auth });
  expect([200,401,403]).toContain(notes.status());

  // RBAC: student should not access admin users
  const adminUsers = await request.get('/api/admin/users', { headers: auth });
  expect([401,403]).toContain(adminUsers.status());

  const bad = errors.filter(e => !/favicon|Failed to load resource|ERR_NAME_NOT_RESOLVED|fonts\.gstatic|fonts\.googleapis/i.test(e));
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(path.join('test-results','console-errors.json'), JSON.stringify(bad, null, 2));
  expect(bad).toEqual([]);
});
