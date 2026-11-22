import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';
const require = createRequire(import.meta.url);

let StorageRegistry, dir;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrv-store-'));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.JWT_SECRET = 'test_secret_for_mrv_bookhub_1234567890';
  process.env.LOG_TO_FILE = 'false';
  for (const k of Object.keys(require.cache)) if (k.includes('/MRV-BookHub/backend/')) delete require.cache[k];
  const { initializeDatabase, db } = require('../../backend/config/database.js');
  initializeDatabase();
  db.prepare("INSERT INTO departments (department_name,department_code) VALUES ('CS','CSE')").run();
  ({ StorageRegistry } = require('../../backend/services/storageStrategy.js'));
});

describe('Storage strategy', () => {
  it('lists strategies', () => {
    const reg = new StorageRegistry();
    expect(reg.list()).toEqual(expect.arrayContaining(['sqlite','json','csv']));
  });

  it('exports json and csv with same table keys', () => {
    const reg = new StorageRegistry();
    const out = path.join(dir, 'out');
    const jsonData = reg.get('json').exportAll(out);
    const csvData = reg.get('csv').exportAll(out);
    expect(Object.keys(jsonData).sort()).toEqual(Object.keys(csvData).sort());
    expect(fs.existsSync(path.join(out, 'export.json'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'users.csv'))).toBe(true);
  });
});
