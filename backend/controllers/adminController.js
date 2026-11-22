const { db } = require('../config/database');
const { logAudit } = require('./authController');
const { createNotification } = require('../services/notificationService');

async function listUsers(req, res, next) {
  try {
    const { role, status, q } = req.query;
    const where = ['1=1'];
    const params = [];
    if (role) { where.push('u.role = ?'); params.push(role); }
    if (status) { where.push('u.account_status = ?'); params.push(status); }
    if (q) { where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.mobile_number LIKE ?)'); const like = `%${q}%`; params.push(like, like, like); }
    const rows = db.prepare(`
      SELECT u.id, u.full_name, u.email, u.mobile_number, u.role, u.account_status, u.email_verified, u.mobile_verified, u.created_at,
             s.hall_ticket_number, f.faculty_id, l.librarian_id, v.business_name, v.approval_status as vendor_approval_status
      FROM users u
      LEFT JOIN students s ON s.user_id = u.id
      LEFT JOIN faculty f ON f.user_id = u.id
      LEFT JOIN librarians l ON l.user_id = u.id
      LEFT JOIN vendors v ON v.user_id = u.id
      WHERE ${where.join(' AND ')}
      ORDER BY u.created_at DESC
    `).all(...params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

async function approveUser(req, res, next) {
  try {
    const id = req.params.id;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const tx = db.transaction(() => {
      db.prepare("UPDATE users SET account_status = 'active', updated_at = datetime('now') WHERE id = ?").run(id);
      if (user.role === 'vendor') {
        db.prepare("UPDATE vendors SET approval_status = 'approved' WHERE user_id = ?").run(id);
      }
    });
    tx();
    logAudit(req.user.id, 'user_approve', 'user', id, { role: user.role });
    createNotification({ userId: id, title: 'Account approved', message: 'Your MRV BookHub account has been approved.', type: 'system_alert', email: true });
    res.json({ success: true, message: 'User approved' });
  } catch (err) { next(err); }
}

async function suspendUser(req, res, next) {
  try {
    const id = req.params.id;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot suspend admin accounts via this endpoint' });
    db.prepare("UPDATE users SET account_status = 'suspended', updated_at = datetime('now') WHERE id = ?").run(id);
    if (user.role === 'vendor') db.prepare("UPDATE vendors SET approval_status = 'suspended' WHERE user_id = ?").run(id);
    logAudit(req.user.id, 'user_suspend', 'user', id, null);
    createNotification({ userId: id, title: 'Account suspended', message: 'Your MRV BookHub account has been suspended. Contact administrator.', type: 'system_alert' });
    res.json({ success: true, message: 'User suspended' });
  } catch (err) { next(err); }
}

async function rejectUser(req, res, next) {
  try {
    const id = req.params.id;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    db.prepare("UPDATE users SET account_status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(id);
    if (user.role === 'vendor') db.prepare("UPDATE vendors SET approval_status = 'rejected' WHERE user_id = ?").run(id);
    logAudit(req.user.id, 'user_reject', 'user', id, null);
    res.json({ success: true, message: 'User rejected' });
  } catch (err) { next(err); }
}

async function listAllBooks(req, res, next) {
  try {
    const rows = db.prepare(`
      SELECT bl.*, b.title, b.author, b.isbn, b.category, u.full_name as owner_name, u.role as owner_role
      FROM book_listings bl JOIN books b ON b.id = bl.book_id JOIN users u ON u.id = bl.owner_user_id
      ORDER BY bl.created_at DESC
    `).all();
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

async function deleteBook(req, res, next) {
  try {
    const id = req.params.id;
    const listing = db.prepare('SELECT * FROM book_listings WHERE id = ?').get(id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    const active = db.prepare("SELECT 1 FROM borrow_requests WHERE listing_id = ? AND status IN ('pending','approved')").get(id);
    if (active) return res.status(409).json({ success: false, message: 'Cannot remove listing with active borrow requests/transactions' });
    db.prepare("UPDATE book_listings SET available = 0, updated_at = datetime('now') WHERE id = ?").run(id);
    logAudit(req.user.id, 'admin_listing_remove', 'book_listing', id, null);
    createNotification({ userId: listing.owner_user_id, title: 'Listing removed', message: 'Your book listing was removed by an administrator.', type: 'system_alert' });
    res.json({ success: true, message: 'Book listing removed' });
  } catch (err) { next(err); }
}

async function reports(req, res, next) {
  try {
    const usersByRole = db.prepare(`SELECT role, account_status, COUNT(*) as count FROM users GROUP BY role, account_status`).all();
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const totalListings = db.prepare('SELECT COUNT(*) as c FROM book_listings').get().c;
    const activeBorrows = db.prepare("SELECT COUNT(*) as c FROM borrow_requests WHERE status = 'approved'").get().c;
    const borrowStats = db.prepare(`
      SELECT status, COUNT(*) as count FROM borrow_requests GROUP BY status
    `).all();
    const library = db.prepare(`
      SELECT COALESCE(SUM(total_copies),0) as total_copies, COALESCE(SUM(available_copies),0) as available_copies,
             COALESCE(SUM(reserved_copies),0) as reserved_copies, COALESCE(SUM(issued_copies),0) as issued_copies,
             COUNT(*) as inventory_items FROM library_inventory
    `).get();
    const overdue = db.prepare(`
      SELECT 'borrow' as type, bt.id, b.title, u.full_name as user_name, bt.due_date
      FROM borrow_transactions bt
      JOIN borrow_requests br ON br.id = bt.borrow_request_id
      JOIN book_listings bl ON bl.id = br.listing_id
      JOIN books b ON b.id = bl.book_id
      JOIN users u ON u.id = br.borrower_user_id
      WHERE bt.transaction_status IN ('active','overdue') AND bt.due_date < datetime('now')
      UNION ALL
      SELECT 'library' as type, li.id, b.title, u.full_name as user_name, li.due_date
      FROM library_issues li
      JOIN library_inventory inv ON inv.id = li.inventory_id
      JOIN books b ON b.id = inv.book_id
      JOIN users u ON u.id = li.student_user_id
      WHERE li.issue_status IN ('issued','overdue') AND li.due_date < datetime('now')
      ORDER BY due_date ASC
    `).all();
    const orders = db.prepare(`SELECT order_status, COUNT(*) as count, COALESCE(SUM(total_amount),0) as total FROM orders GROUP BY order_status`).all();
    res.json({
      success: true,
      data: {
        users: { total: totalUsers, by_role_status: usersByRole },
        listings: { total: totalListings },
        borrowing: { active: activeBorrows, by_status: borrowStats },
        library,
        overdue_records: overdue,
        orders,
      }
    });
  } catch (err) { next(err); }
}

async function auditLogs(req, res, next) {
  try {
    const limit = Math.min(500, parseInt(req.query.limit, 10) || 100);
    const rows = db.prepare(`
      SELECT a.*, u.full_name as actor_name, u.role as actor_role
      FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
      ORDER BY a.created_at DESC LIMIT ?
    `).all(limit);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

async function manageDepartment(req, res, next) {
  try {
    if (req.method === 'GET') {
      const rows = db.prepare('SELECT * FROM departments ORDER BY department_name').all();
      return res.json({ success: true, data: rows });
    }
    if (req.method === 'POST') {
      const { department_name, department_code } = req.body;
      if (!department_name || !department_code) return res.status(422).json({ success: false, message: 'department_name and department_code required' });
      const info = db.prepare('INSERT INTO departments (department_name, department_code) VALUES (?,?)').run(department_name.trim(), department_code.trim().toUpperCase());
      logAudit(req.user.id, 'department_create', 'department', info.lastInsertRowid, { department_name });
      return res.status(201).json({ success: true, message: 'Department created', data: { id: info.lastInsertRowid, department_name, department_code } });
    }
    if (req.method === 'DELETE') {
      db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
      logAudit(req.user.id, 'department_delete', 'department', req.params.id, null);
      return res.json({ success: true, message: 'Department deleted' });
    }
    res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (err) { next(err); }
}

module.exports = { listUsers, approveUser, suspendUser, rejectUser, listAllBooks, deleteBook, reports, auditLogs, manageDepartment };
