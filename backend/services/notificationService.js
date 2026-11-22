const { db } = require('../config/database');
const { sendEmail } = require('./emailService');

const insertStmt = () => db.prepare(`
  INSERT INTO notifications (user_id, title, message, notification_type)
  VALUES (?, ?, ?, ?)
`);

function createNotification({ userId, title, message, type, email = false }) {
  const info = insertStmt().run(userId, title, message, type);
  if (email) {
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    if (user && user.email) {
      sendEmail({ to: user.email, subject: `MRV BookHub: ${title}`, text: message }).catch(() => {});
    }
  }
  return { id: info.lastInsertRowid };
}

function notifyMany(userIds, payload) {
  const stmt = insertStmt();
  const tx = db.transaction((ids) => {
    for (const id of ids) stmt.run(id, payload.title, payload.message, payload.type);
  });
  tx(userIds);
}

module.exports = { createNotification, notifyMany };
