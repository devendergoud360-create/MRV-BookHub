import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs'; import path from 'path'; import os from 'os';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let app;
beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrv-sec-'));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.JWT_SECRET = 'test_secret_for_mrv_bookhub_1234567890';
  process.env.LOG_TO_FILE = 'false';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  for (const k of Object.keys(require.cache)) if (k.includes('/MRV-BookHub/backend/')) delete require.cache[k];
  require('../../backend/config/database.js').initializeDatabase();
  app = require('../../backend/server.js');
});

describe('Security middleware', () => {
  it('sets security headers on health', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('rejects disallowed origin on unsafe method', async () => {
    const res = await request(app).post('/api/auth/login/admin').set('Origin', 'http://evil.com').send({ email: 'x', password: 'y' });
    expect([403,401]).toContain(res.status);
  });
});
