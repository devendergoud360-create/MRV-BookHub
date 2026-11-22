const fs = require('fs');
const path = require('path');
const os = require('os');

function makeTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrv-test-'));
  return { dir, dbPath: path.join(dir, 'test.db') };
}

function setupTestEnv() {
  const { dir, dbPath } = makeTempDbPath();
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = dbPath;
  process.env.JWT_SECRET = 'test_secret_for_mrv_bookhub_1234567890';
  process.env.LOG_TO_FILE = 'false';
  process.env.LOOPBACK_ONLY = 'true';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  // clear require cache for backend modules
  for (const k of Object.keys(require.cache)) {
    if (k.includes('/MRV-BookHub/backend/')) delete require.cache[k];
  }
  const { initializeDatabase } = require('../backend/config/database');
  initializeDatabase();
  return { dir, dbPath };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

module.exports = { setupTestEnv, cleanup };
