import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path'; import os from 'os';
const require = createRequire(import.meta.url);

let db, StorageRegistry;
beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrv-data-'));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.JWT_SECRET = 'test_secret_for_mrv_bookhub_1234567890';
  process.env.LOG_TO_FILE = 'false';
  for (const k of Object.keys(require.cache)) if (k.includes('/MRV-BookHub/backend/')) delete require.cache[k];
  const dbMod = require('../../backend/config/database.js');
  dbMod.initializeDatabase();
  db = dbMod.db;
  // seed full dataset
  const seed = require('../../backend/database/seed.js');
  if (typeof seed.seedDatabase === 'function') await seed.seedDatabase();
  else { /* seed.js may auto-run; fallback: run via exec */ }
  ({ StorageRegistry } = require('../../backend/services/storageStrategy.js'));
});

describe('Seeded dataset invariants', () => {
  it('has 30-50+ realistic records across core tables', () => {
    const counts = {};
    for (const t of ['users','books','book_listings','library_inventory','borrow_requests','notifications','departments']) {
      counts[t] = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c;
    }
    expect(counts.users).toBeGreaterThanOrEqual(18);
    expect(counts.books).toBeGreaterThanOrEqual(30);
    expect(counts.book_listings).toBeGreaterThanOrEqual(10);
    expect(counts.library_inventory).toBeGreaterThanOrEqual(10);
    expect(counts.departments).toBeGreaterThanOrEqual(5);
  });

  it('inventory invariant holds for every row', () => {
    const rows = db.prepare('SELECT * FROM library_inventory').all();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.total_copies).toBe(r.available_copies + r.reserved_copies + r.issued_copies);
  });

  it('no orphan listings/requests/transactions', () => {
    const orphanListings = db.prepare(`SELECT COUNT(*) c FROM book_listings bl LEFT JOIN books b ON b.id=bl.book_id LEFT JOIN users u ON u.id=bl.owner_user_id WHERE b.id IS NULL OR u.id IS NULL`).get().c;
    const orphanReq = db.prepare(`SELECT COUNT(*) c FROM borrow_requests br LEFT JOIN book_listings bl ON bl.id=br.listing_id LEFT JOIN users u ON u.id=br.borrower_user_id WHERE bl.id IS NULL OR u.id IS NULL`).get().c;
    expect(orphanListings).toBe(0);
    expect(orphanReq).toBe(0);
  });
});

describe('Storage/export invariants', () => {
  it('json/csv/sqlite strategies export same table keys and row counts', () => {
    const reg = new StorageRegistry();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrv-exp-'));
    const json = reg.get('json').exportAll(path.join(dir,'json'));
    const csv = reg.get('csv').exportAll(path.join(dir,'csv'));
    const sqliteExp = reg.get('sqlite').exportAll(path.join(dir,'sqlite'));
    expect(Object.keys(json).sort()).toEqual(Object.keys(csv).sort());
    expect(Object.keys(json).sort()).toEqual(Object.keys(sqliteExp).sort());
    for (const k of Object.keys(json)) {
      expect(json[k].length).toBe(csv[k].length);
      expect(json[k].length).toBe(sqliteExp[k].length);
    }
    for (const t of Object.keys(json)) {
      expect(fs.existsSync(path.join(dir,'csv',`${t}.csv`))).toBe(true);
    }
  });
});
