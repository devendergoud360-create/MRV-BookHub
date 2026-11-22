const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./environment');

const dbPath = path.isAbsolute(config.databasePath)
  ? config.databasePath
  : path.join(__dirname, '..', config.databasePath);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const rawDb = new DatabaseSync(dbPath);

// Compatibility helpers to mirror better-sqlite3 API used in this project
rawDb.pragma = (str) => rawDb.exec(`PRAGMA ${str}`);
rawDb.transaction = (fn) => {
  return (...args) => {
    rawDb.exec('BEGIN');
    try {
      const result = fn(...args);
      rawDb.exec('COMMIT');
      return result;
    } catch (err) {
      try { rawDb.exec('ROLLBACK'); } catch (_) {}
      throw err;
    }
  };
};

const db = rawDb;
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  return db;
}

module.exports = { db, initializeDatabase };
