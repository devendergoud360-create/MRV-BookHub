const commandBus = require('./commandBus');
const { db } = require('../config/database');
const { logAudit } = require('../controllers/authController');
const bus = require('./eventBus');

// Register core domain commands (Command pattern)
commandBus.register('user.approve', async (ctx, { userId }) => {
  db.prepare("UPDATE users SET account_status='active', updated_at=datetime('now') WHERE id=?").run(userId);
  logAudit(ctx.user?.id, 'user_approve', 'user', userId, null);
  bus.publish('user.approved', { userId, actor: ctx.user?.id });
  return { userId, status: 'active' };
}, { roles: ['admin'], description: 'Approve user account' });

commandBus.register('inventory.adjust', async (ctx, { inventoryId, totalCopies }) => {
  const inv = db.prepare('SELECT * FROM library_inventory WHERE id=?').get(inventoryId);
  if (!inv) throw Object.assign(new Error('Inventory not found'), { statusCode: 404 });
  const min = inv.reserved_copies + inv.issued_copies;
  if (totalCopies < min) throw Object.assign(new Error('Total below reserved+issued'), { statusCode: 400 });
  db.prepare("UPDATE library_inventory SET total_copies=?, available_copies=?, updated_at=datetime('now') WHERE id=?")
    .run(totalCopies, totalCopies - min, inventoryId);
  bus.publish('inventory.adjusted', { inventoryId, totalCopies, actor: ctx.user?.id });
  return { inventoryId, totalCopies };
}, { roles: ['librarian', 'admin'], description: 'Adjust library inventory totals' });

commandBus.register('export.data', async (ctx, { format = 'json' }) => {
  const { StorageRegistry } = require('./storageStrategy');
  const reg = new StorageRegistry();
  const outDir = require('path').join(__dirname, '..', 'exports');
  const data = reg.get(format).exportAll(outDir);
  bus.publish('data.exported', { format, actor: ctx.user?.id });
  return { format, outDir, tables: Object.keys(data) };
}, { roles: ['admin'], description: 'Export data in json/csv/sqlite strategy' });

module.exports = commandBus;
