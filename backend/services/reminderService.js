const cron = require('node-cron');
const config = require('../config/environment');
const { db } = require('../config/database');
const { createNotification } = require('./notificationService');
const { addDays, startOfDay, endOfDay } = require('../utils/dateUtils');

function logReminder(entityType, entityId, reminderType, reminderDate) {
  try {
    db.prepare(`
      INSERT INTO reminder_logs (entity_type, entity_id, reminder_type, reminder_date)
      VALUES (?, ?, ?, ?)
    `).run(entityType, entityId, reminderType, reminderDate);
    return true;
  } catch (e) {
    // unique constraint -> already logged
    return false;
  }
}

function runReminders() {
  const today = startOfDay(new Date());
  const todayStr = today.toISOString().slice(0, 10);

  // Borrow transactions approaching due date
  for (const daysBefore of config.reminders.daysBefore) {
    const target = addDays(today, daysBefore);
    const start = startOfDay(target).toISOString();
    const end = endOfDay(target).toISOString();
    const rows = db.prepare(`
      SELECT bt.*, br.borrower_user_id, b.title
      FROM borrow_transactions bt
      JOIN borrow_requests br ON br.id = bt.borrow_request_id
      JOIN book_listings bl ON bl.id = br.listing_id
      JOIN books b ON b.id = bl.book_id
      WHERE bt.transaction_status = 'active' AND bt.due_date BETWEEN ? AND ?
    `).all(start, end);
    for (const row of rows) {
      const type = `due_in_${daysBefore}`;
      if (logReminder('borrow_transaction', row.id, type, todayStr)) {
        createNotification({
          userId: row.borrower_user_id,
          title: 'Return reminder',
          message: `"${row.title}" is due in ${daysBefore} day(s). Due: ${row.due_date.slice(0, 10)}.`,
          type: 'return_reminder',
          email: true,
        });
      }
    }
  }

  // Overdue borrow transactions
  const overdueBorrows = db.prepare(`
    SELECT bt.*, br.borrower_user_id, b.title
    FROM borrow_transactions bt
    JOIN borrow_requests br ON br.id = bt.borrow_request_id
    JOIN book_listings bl ON bl.id = br.listing_id
    JOIN books b ON b.id = bl.book_id
    WHERE bt.transaction_status IN ('active','overdue') AND bt.due_date < ?
  `).all(new Date().toISOString());
  const markOverdue = db.prepare("UPDATE borrow_transactions SET transaction_status = 'overdue' WHERE id = ?");
  for (const row of overdueBorrows) {
    if (row.transaction_status !== 'overdue') markOverdue.run(row.id);
    if (logReminder('borrow_transaction', row.id, 'overdue', todayStr)) {
      createNotification({
        userId: row.borrower_user_id,
        title: 'Overdue book',
        message: `"${row.title}" is overdue. Due date was ${row.due_date.slice(0, 10)}.`,
        type: 'overdue',
        email: true,
      });
    }
  }

  // Library issues reminders and overdue
  for (const daysBefore of config.reminders.daysBefore) {
    const target = addDays(today, daysBefore);
    const start = startOfDay(target).toISOString();
    const end = endOfDay(target).toISOString();
    const rows = db.prepare(`
      SELECT li.*, b.title
      FROM library_issues li
      JOIN library_inventory inv ON inv.id = li.inventory_id
      JOIN books b ON b.id = inv.book_id
      WHERE li.issue_status = 'issued' AND li.due_date BETWEEN ? AND ?
    `).all(start, end);
    for (const row of rows) {
      const type = `due_in_${daysBefore}`;
      if (logReminder('library_issue', row.id, type, todayStr)) {
        createNotification({
          userId: row.student_user_id,
          title: 'Library return reminder',
          message: `Library book "${row.title}" is due in ${daysBefore} day(s). Due: ${row.due_date.slice(0, 10)}.`,
          type: 'return_reminder',
          email: true,
        });
      }
    }
  }

  const overdueIssues = db.prepare(`
    SELECT li.*, b.title
    FROM library_issues li
    JOIN library_inventory inv ON inv.id = li.inventory_id
    JOIN books b ON b.id = inv.book_id
    WHERE li.issue_status IN ('issued','overdue') AND li.due_date < ?
  `).all(new Date().toISOString());
  const markIssueOverdue = db.prepare("UPDATE library_issues SET issue_status = 'overdue' WHERE id = ?");
  for (const row of overdueIssues) {
    if (row.issue_status !== 'overdue') markIssueOverdue.run(row.id);
    if (logReminder('library_issue', row.id, 'overdue', todayStr)) {
      createNotification({
        userId: row.student_user_id,
        title: 'Library book overdue',
        message: `Library book "${row.title}" is overdue. Due date was ${row.due_date.slice(0, 10)}.`,
        type: 'overdue',
        email: true,
      });
    }
  }

  // Expire library reservations
  const nowIso = new Date().toISOString();
  const expiring = db.prepare(`
    SELECT * FROM library_reservations
    WHERE reservation_status IN ('pending','confirmed') AND expiry_date IS NOT NULL AND expiry_date < ?
  `).all(nowIso);
  const expireTx = db.transaction((rows) => {
    const invService = require('./inventoryService');
    for (const r of rows) {
      db.prepare("UPDATE library_reservations SET reservation_status = 'expired' WHERE id = ?").run(r.id);
      invService.releaseReservedCopyTx(r.inventory_id);
      if (logReminder('library_reservation', r.id, 'expired', todayStr)) {
        createNotification({
          userId: r.student_user_id,
          title: 'Reservation expired',
          message: `Your library reservation ${r.reservation_code} has expired.`,
          type: 'reservation_expired',
          email: true,
        });
      }
    }
  });
  if (expiring.length) expireTx(expiring);
}

function startReminderScheduler() {
  // Run once on startup (non-blocking) and then on schedule
  try { runReminders(); } catch (e) { console.error('Reminder run error:', e.message); }
  if (cron.validate(config.reminders.cron)) {
    cron.schedule(config.reminders.cron, () => {
      try { runReminders(); } catch (e) { console.error('Reminder cron error:', e.message); }
    });
  } else {
    console.warn('Invalid REMINDER_CRON, scheduler not started');
  }
}

module.exports = { startReminderScheduler, runReminders };
