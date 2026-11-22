/**
 * Strategy pattern: interchangeable persistence backends behind one interface.
 * Default: SQLiteStrategy (production). JSONStrategy/CSVStrategy provided for
 * export/interchange and architecture compliance.
 */
const fs = require('fs');
const path = require('path');
const { db } = require('../config/database');

class StorageStrategy {
  name() { throw new Error('not implemented'); }
  readTable(table) { throw new Error('not implemented'); }
  exportAll(outDir) { throw new Error('not implemented'); }
}

class SQLiteStrategy extends StorageStrategy {
  name() { return 'sqlite'; }
  readTable(table) {
    const allowed = new Set(['users','students','faculty','librarians','vendors','books','book_listings','borrow_requests','borrow_transactions','library_inventory','library_reservations','library_issues','notifications','orders','departments','audit_logs']);
    if (!allowed.has(table)) throw new Error('Table not allowed');
    return db.prepare(`SELECT * FROM ${table}`).all();
  }
  exportAll(outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const tables = ['users','students','faculty','librarians','vendors','books','book_listings','borrow_requests','borrow_transactions','library_inventory','library_reservations','library_issues','notifications','orders','departments','audit_logs'];
    const result = {};
    for (const t of tables) result[t] = this.readTable(t);
    fs.writeFileSync(path.join(outDir, 'export.json'), JSON.stringify(result, null, 2));
    return result;
  }
}

class JSONStrategy extends StorageStrategy {
  constructor(filePath) { super(); this.filePath = filePath; }
  name() { return 'json'; }
  readTable(table) {
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, 'utf8');
    const data = JSON.parse(raw);
    return data[table] || [];
  }
  exportAll(outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const sqlite = new SQLiteStrategy();
    const data = sqlite.exportAll(outDir);
    fs.writeFileSync(path.join(outDir, 'export.json'), JSON.stringify(data, null, 2));
    return data;
  }
}

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(','));
  return lines.join('\n');
}

class CSVStrategy extends StorageStrategy {
  name() { return 'csv'; }
  readTable(table) { return new SQLiteStrategy().readTable(table); }
  exportAll(outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const data = new SQLiteStrategy().exportAll(outDir);
    for (const [table, rows] of Object.entries(data)) {
      fs.writeFileSync(path.join(outDir, `${table}.csv`), toCsv(rows));
    }
    return data;
  }
}

class StorageRegistry {
  constructor() {
    this.strategies = new Map();
    this.register(new SQLiteStrategy());
    this.register(new JSONStrategy(path.join(__dirname, '..', 'database', 'export.json')));
    this.register(new CSVStrategy());
  }
  register(strategy) { this.strategies.set(strategy.name(), strategy); }
  get(name) {
    const s = this.strategies.get(name);
    if (!s) throw new Error(`Unknown storage strategy: ${name}`);
    return s;
  }
  list() { return [...this.strategies.keys()]; }
}

module.exports = { StorageRegistry, SQLiteStrategy, JSONStrategy, CSVStrategy };
