const { db } = require('../config/database');

// All inventory mutations must maintain: total = available + reserved + issued
// Callers should use transactions for multi-step operations.

function getInventory(id) {
  return db.prepare('SELECT * FROM library_inventory WHERE id = ?').get(id);
}

function reserveCopyTx(inventoryId) {
  const inv = db.prepare('SELECT * FROM library_inventory WHERE id = ?').get(inventoryId);
  if (!inv) throw Object.assign(new Error('Inventory item not found'), { statusCode: 404 });
  if (inv.available_copies <= 0) throw Object.assign(new Error('Book is not available'), { statusCode: 409 });
  const res = db.prepare(`
    UPDATE library_inventory
    SET available_copies = available_copies - 1,
        reserved_copies = reserved_copies + 1,
        updated_at = datetime('now')
    WHERE id = ? AND available_copies > 0
  `).run(inventoryId);
  if (res.changes === 0) throw Object.assign(new Error('Book is not available'), { statusCode: 409 });
}

function releaseReservedCopyTx(inventoryId) {
  const res = db.prepare(`
    UPDATE library_inventory
    SET available_copies = available_copies + 1,
        reserved_copies = reserved_copies - 1,
        updated_at = datetime('now')
    WHERE id = ? AND reserved_copies > 0
  `).run(inventoryId);
  if (res.changes === 0) throw Object.assign(new Error('No reserved copy to release'), { statusCode: 409 });
}

function issueReservedCopyTx(inventoryId) {
  const res = db.prepare(`
    UPDATE library_inventory
    SET reserved_copies = reserved_copies - 1,
        issued_copies = issued_copies + 1,
        updated_at = datetime('now')
    WHERE id = ? AND reserved_copies > 0
  `).run(inventoryId);
  if (res.changes === 0) throw Object.assign(new Error('No reserved copy to issue'), { statusCode: 409 });
}

function returnIssuedCopyTx(inventoryId) {
  const res = db.prepare(`
    UPDATE library_inventory
    SET issued_copies = issued_copies - 1,
        available_copies = available_copies + 1,
        updated_at = datetime('now')
    WHERE id = ? AND issued_copies > 0
  `).run(inventoryId);
  if (res.changes === 0) throw Object.assign(new Error('No issued copy to return'), { statusCode: 409 });
}

function adjustTotalCopiesTx(inventoryId, newTotal) {
  const inv = getInventory(inventoryId);
  if (!inv) throw Object.assign(new Error('Inventory item not found'), { statusCode: 404 });
  const minTotal = inv.reserved_copies + inv.issued_copies;
  if (newTotal < minTotal) {
    throw Object.assign(new Error('Total copies cannot be less than reserved plus issued copies'), { statusCode: 400 });
  }
  const newAvailable = newTotal - inv.reserved_copies - inv.issued_copies;
  db.prepare(`
    UPDATE library_inventory
    SET total_copies = ?, available_copies = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(newTotal, newAvailable, inventoryId);
}

module.exports = {
  getInventory,
  reserveCopyTx,
  releaseReservedCopyTx,
  issueReservedCopyTx,
  returnIssuedCopyTx,
  adjustTotalCopiesTx,
};
