import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let app;
let adminToken;
let studentToken;
let csrfCookie;
let csrfToken;

function extractCsrf(res) {
  const cookies = res.headers['set-cookie'] || [];
  const c = cookies.find((x) => x.startsWith('csrf_token='));
  if (!c) return null;
  return c.split(';')[0].split('=')[1];
}

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrv-api-'));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.JWT_SECRET = 'test_secret_for_mrv_bookhub_1234567890';
  process.env.LOG_TO_FILE = 'false';
  process.env.LOOPBACK_ONLY = 'true';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  for (const k of Object.keys(require.cache)) if (k.includes('/MRV-BookHub/backend/')) delete require.cache[k];
  const { initializeDatabase } = require('../../backend/config/database.js');
  initializeDatabase();
  const bcrypt = require('bcryptjs');
  const { db } = require('../../backend/config/database.js');
  const hash = bcrypt.hashSync('Password@123', 10);
  db.prepare("INSERT INTO departments (department_name,department_code) VALUES ('Computer Science','CSE')").run();
  const adminId = db.prepare("INSERT INTO users (full_name,email,password_hash,role,account_status,email_verified,mobile_verified) VALUES ('Admin','admin@test.com',?,'admin','active',1,1)").run(hash).lastInsertRowid;
  const sid = db.prepare("INSERT INTO users (full_name,email,mobile_number,password_hash,role,account_status,email_verified,mobile_verified) VALUES ('Student','s@test.com','9999999999',?,'student','active',1,1)").run(hash).lastInsertRowid;
  db.prepare("INSERT INTO students (user_id,hall_ticket_number,department_id,academic_year,semester) VALUES (?,?,?,?,?)").run(sid, 'HT001', 1, '2024', '1');
  app = require('../../backend/server.js');

  const health = await request(app).get('/api/health');
  csrfToken = extractCsrf(health);
  csrfCookie = `csrf_token=${csrfToken}`;

  const adminLogin = await request(app).post('/api/auth/login/admin').set('Cookie', csrfCookie).set('X-CSRF-Token', csrfToken).send({ email: 'admin@test.com', password: 'Password@123' });
  adminToken = adminLogin.body.data?.token;
  const studentLogin = await request(app).post('/api/auth/login/student').set('Cookie', csrfCookie).set('X-CSRF-Token', csrfToken).send({ hall_ticket_number: 'HT001', password: 'Password@123' });
  studentToken = studentLogin.body.data?.token;
});

describe('API integration', () => {
  it('health returns 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects invalid login', async () => {
    const res = await request(app).post('/api/auth/login/admin').set('Cookie', csrfCookie).set('X-CSRF-Token', csrfToken).send({ email: 'admin@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('admin can list users', async () => {
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('student cannot access admin route', async () => {
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('CSRF blocks unsafe request without token when cookie-auth context used', async () => {
    // simulate cookie-only unsafe call: send cookie but no header and no bearer
    const res = await request(app).post('/api/books').set('Cookie', csrfCookie).send({ title: 'X', author: 'Y' });
    expect([401,403]).toContain(res.status);
  });
});
