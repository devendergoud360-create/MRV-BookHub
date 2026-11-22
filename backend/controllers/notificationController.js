const { db } = require('../config/database');

async function listNotifications(req, res, next) {
  try {
    const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 200').all(req.user.id);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

async function markRead(req, res, next) {
  try {
    const id = req.params.id;
    const n = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!n) return res.status(404).json({ success: false, message: 'Notification not found' });
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) { next(err); }
}

async function markAllRead(req, res, next) {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) { next(err); }
}

async function deleteNotification(req, res, next) {
  try {
    const id = req.params.id;
    const info = db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, req.user.id);
    if (info.changes === 0) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) { next(err); }
}

module.exports = { listNotifications, markRead, markAllRead, deleteNotification };
