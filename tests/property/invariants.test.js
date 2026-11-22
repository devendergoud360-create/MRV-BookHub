import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';
const require = createRequire(import.meta.url);

let db;
beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrv-prop-'));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.JWT_SECRET = 'test_secret_for_mrv_bookhub_1234567890';
  process.env.LOG_TO_FILE = 'false';
  for (const k of Object.keys(require.cache)) if (k.includes('/MRV-BookHub/backend/')) delete require.cache[k];
  const mod = require('../../backend/config/database.js');
  mod.initializeDatabase();
  db = mod.db;
  // seed minimal
  db.prepare("INSERT INTO departments (department_name,department_code) VALUES ('CS','CSE')").run();
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('Password@123', 10);
  db.prepare("INSERT INTO users (full_name,email,mobile_number,password_hash,role,account_status) VALUES ('A','a@a.com','9000000001',?,'admin','active')").run(hash);
  db.prepare("INSERT INTO users (full_name,email,mobile_number,password_hash,role,account_status) VALUES ('S','s@s.com','9000000002',?,'student','active')").run(hash);
  db.prepare("INSERT INTO students (user_id,hall_ticket_number,department_id,academic_year,semester) VALUES (2,'HT1',1,'2024','1')").run();
  db.prepare("INSERT INTO books (title,author,isbn,department_id) VALUES ('B1','A1','ISBN1',1)").run();
  db.prepare("INSERT INTO library_inventory (book_id,total_copies,available_copies,reserved_copies,issued_copies,max_issue_days) VALUES (1,5,5,0,0,14)").run();
});

describe('Inventory invariants', () => {
  it('total = available + reserved + issued for all rows', () => {
    const rows = db.prepare('SELECT * FROM library_inventory').all();
    for (const r of rows) {
      expect(r.total_copies).toBe(r.available_copies + r.reserved_copies + r.issued_copies);
      expect(r.available_copies).toBeGreaterThanOrEqual(0);
      expect(r.reserved_copies).toBeGreaterThanOrEqual(0);
      expect(r.issued_copies).toBeGreaterThanOrEqual(0);
    }
  });

  it('rejects invalid inventory states via CHECK/logic', () => {
    expect(() => {
      db.prepare('UPDATE library_inventory SET available_copies=-1 WHERE id=1').run();
    }).toThrow();
  });
});

describe('Role/status invariants', () => {
  it('users have valid roles and statuses', () => {
    const roles = new Set(['student','faculty','librarian','vendor','admin']);
    const statuses = new Set(['pending','active','suspended','rejected']);
    const users = db.prepare('SELECT role, account_status FROM users').all();
    for (const u of users) {
      expect(roles.has(u.role)).toBe(true);
      expect(statuses.has(u.account_status)).toBe(true);
    }
  });
});
