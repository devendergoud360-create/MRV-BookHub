const { db } = require('../config/database');
const { createNotification } = require('../services/notificationService');
const { logAudit } = require('./authController');
const generateReservationId = require('../utils/generateReservationId');
const { addDays, toISODate } = require('../utils/dateUtils');
const inventoryService = require('../services/inventoryService');
const config = require('../config/environment');

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

async function addInventory(req, res, next) {
  try {
    const { title, author, edition, isbn, department_id, course_code, category, description, total_copies, shelf_number, rack_number, max_issue_days } = req.body;
    if (!title || !author) return res.status(422).json({ success: false, message: 'Title and author are required' });
    const total = parseInt(total_copies, 10);
    if (isNaN(total) || total < 0) return res.status(422).json({ success: false, message: 'total_copies must be a non-negative integer' });
    const maxDays = max_issue_days ? parseInt(max_issue_days, 10) : 14;
    const tx = db.transaction(() => {
      let bookId;
      if (isbn) {
        const existing = db.prepare('SELECT id FROM books WHERE isbn = ?').get(isbn.trim());
        if (existing) bookId = existing.id;
      }
      if (!bookId) {
        const info = db.prepare(`INSERT INTO books (title, author, edition, isbn, course_code, department_id, category, description) VALUES (?,?,?,?,?,?,?,?)`)
          .run(title.trim(), author.trim(), edition || null, isbn ? isbn.trim() : null, course_code || null, department_id || null, category || null, description || null);
        bookId = info.lastInsertRowid;
      }
      const invInfo = db.prepare(`
        INSERT INTO library_inventory (book_id, total_copies, available_copies, reserved_copies, issued_copies, shelf_number, rack_number, max_issue_days)
        VALUES (?,?,?,?,0,0,?,?,?)
      `).run(bookId, total, total, shelf_number || null, rack_number || null, maxDays);
      return invInfo.lastInsertRowid;
    });
    const invId = tx();
    logAudit(req.user.id, 'library_inventory_add', 'library_inventory', invId, { total_copies: total });
    const inventory = db.prepare(`
      SELECT li.*, b.title, b.author, b.edition, b.isbn, b.course_code, b.department_id, b.category, d.department_name
      FROM library_inventory li JOIN books b ON b.id = li.book_id LEFT JOIN departments d ON d.id = b.department_id WHERE li.id = ?
    `).get(invId);
    res.status(201).json({ success: true, message: 'Library inventory added', data: inventory });
  } catch (err) { next(err); }
}

async function updateInventory(req, res, next) {
  try {
    const id = req.params.id;
    const inv = inventoryService.getInventory(id);
    if (!inv) return res.status(404).json({ success: false, message: 'Inventory item not found' });
    const { total_copies, shelf_number, rack_number, max_issue_days } = req.body;
    const tx = db.transaction(() => {
      if (total_copies !== undefined) {
        inventoryService.adjustTotalCopiesTx(id, parseInt(total_copies, 10));
      }
      db.prepare(`
        UPDATE library_inventory SET
          shelf_number = COALESCE(?, shelf_number),
          rack_number = COALESCE(?, rack_number),
          max_issue_days = COALESCE(?, max_issue_days),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(shelf_number !== undefined ? shelf_number : null, rack_number !== undefined ? rack_number : null, max_issue_days !== undefined ? parseInt(max_issue_days, 10) : null, id);
    });
    tx();
    logAudit(req.user.id, 'library_inventory_update', 'library_inventory', id, req.body);
    const updated = db.prepare(`SELECT li.*, b.title, b.author FROM library_inventory li JOIN books b ON b.id = li.book_id WHERE li.id = ?`).get(id);
    res.json({ success: true, message: 'Inventory updated', data: updated });
  } catch (err) { next(err); }
}

async function searchLibraryBooks(req, res, next) {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const where = ['1=1'];
    const params = [];
    const like = (v) => `%${v}%`;
    if (req.query.title) { where.push('b.title LIKE ?'); params.push(like(req.query.title)); }
    if (req.query.author) { where.push('b.author LIKE ?'); params.push(like(req.query.author)); }
    if (req.query.isbn) { where.push('b.isbn LIKE ?'); params.push(like(req.query.isbn)); }
    if (req.query.course_code) { where.push('b.course_code LIKE ?'); params.push(like(req.query.course_code)); }
    if (req.query.department_id) { where.push('b.department_id = ?'); params.push(req.query.department_id); }
    if (req.query.department) { where.push('(d.department_name LIKE ? OR d.department_code LIKE ?)'); params.push(like(req.query.department), like(req.query.department)); }
    if (req.query.availability === 'available') where.push('li.available_copies > 0');
    if (req.query.availability === 'unavailable') where.push('li.available_copies = 0');
    const whereSql = 'WHERE ' + where.join(' AND ');
    const base = `
      FROM library_inventory li
      JOIN books b ON b.id = li.book_id
      LEFT JOIN departments d ON d.id = b.department_id
    `;
    const count = db.prepare(`SELECT COUNT(*) as c ${base} ${whereSql}`).get(...params).c;
    const rows = db.prepare(`
      SELECT li.*, b.title, b.author, b.edition, b.isbn, b.course_code, b.category, b.description, b.image_path,
             b.department_id, d.department_name, d.department_code
      ${base} ${whereSql}
      ORDER BY b.title ASC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    res.json({ success: true, data: rows, pagination: { page, limit, total: count } });
  } catch (err) { next(err); }
}

async function createReservation(req, res, next) {
  try {
    const { inventory_id } = req.body;
    if (!inventory_id) return res.status(422).json({ success: false, message: 'inventory_id is required' });
    const result = db.transaction(() => {
      const inv = db.prepare('SELECT * FROM library_inventory WHERE id = ?').get(inventory_id);
      if (!inv) throw Object.assign(new Error('Library book not found'), { statusCode: 404 });
      const dup = db.prepare(`
        SELECT id FROM library_reservations
        WHERE student_user_id = ? AND inventory_id = ? AND reservation_status IN ('pending','confirmed')
      `).get(req.user.id, inventory_id);
      if (dup) throw Object.assign(new Error('You already have an active reservation for this book'), { statusCode: 409 });
      inventoryService.reserveCopyTx(inventory_id);
      const code = generateReservationId();
      const expiry = addDays(new Date(), config.reservationExpiryDays);
      const info = db.prepare(`
        INSERT INTO library_reservations (reservation_code, student_user_id, inventory_id, reservation_status, expiry_date)
        VALUES (?,?,?,?,?)
      `).run(code, req.user.id, inventory_id, 'confirmed', toISODate(expiry));
      return { id: info.lastInsertRowid, code };
    })();
    logAudit(req.user.id, 'library_reservation_create', 'library_reservation', result.id, { inventory_id });
    createNotification({ userId: req.user.id, title: 'Library reservation confirmed', message: `Reservation ${result.code} confirmed. Collect before expiry.`, type: 'library_reserved', email: true });
    const reservation = db.prepare(`
      SELECT lr.*, b.title, b.author FROM library_reservations lr
      JOIN library_inventory li ON li.id = lr.inventory_id JOIN books b ON b.id = li.book_id
      WHERE lr.id = ?
    `).get(result.id);
    res.status(201).json({ success: true, message: 'Book reserved successfully', data: reservation });
  } catch (err) { next(err); }
}

async function myReservations(req, res, next) {
  try {
    const rows = db.prepare(`
      SELECT lr.*, b.title, b.author, b.isbn, li.shelf_number, li.rack_number
      FROM library_reservations lr
      JOIN library_inventory li ON li.id = lr.inventory_id
      JOIN books b ON b.id = li.book_id
      WHERE lr.student_user_id = ?
      ORDER BY lr.created_at DESC
    `).all(req.user.id);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

async function listReservations(req, res, next) {
  try {
    const { status } = req.query;
    const where = [];
    const params = [];
    if (status) { where.push('lr.reservation_status = ?'); params.push(status); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const rows = db.prepare(`
      SELECT lr.*, b.title, b.author, u.full_name as student_name, s.hall_ticket_number
      FROM library_reservations lr
      JOIN library_inventory li ON li.id = lr.inventory_id
      JOIN books b ON b.id = li.book_id
      JOIN users u ON u.id = lr.student_user_id
      LEFT JOIN students s ON s.user_id = u.id
      ${whereSql}
      ORDER BY lr.created_at DESC
    `).all(...params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

async function approveReservation(req, res, next) {
  try {
    const id = req.params.id;
    const resv = db.prepare('SELECT * FROM library_reservations WHERE id = ?').get(id);
    if (!resv) return res.status(404).json({ success: false, message: 'Reservation not found' });
    if (resv.reservation_status !== 'pending') return res.status(409).json({ success: false, message: 'Reservation is not pending' });
    const expiry = addDays(new Date(), config.reservationExpiryDays);
    db.prepare("UPDATE library_reservations SET reservation_status = 'confirmed', expiry_date = ? WHERE id = ?").run(toISODate(expiry), id);
    logAudit(req.user.id, 'library_reservation_approve', 'library_reservation', id, null);
    createNotification({ userId: resv.student_user_id, title: 'Reservation approved', message: `Your reservation ${resv.reservation_code} has been approved.`, type: 'library_reserved' });
    res.json({ success: true, message: 'Reservation approved' });
  } catch (err) { next(err); }
}

async function cancelReservation(req, res, next) {
  try {
    const id = req.params.id;
    const tx = db.transaction(() => {
      const resv = db.prepare('SELECT * FROM library_reservations WHERE id = ?').get(id);
      if (!resv) throw Object.assign(new Error('Reservation not found'), { statusCode: 404 });
      const isOwner = resv.student_user_id === req.user.id;
      const isLibrarian = req.user.role === 'librarian' || req.user.role === 'admin';
      if (!isOwner && !isLibrarian) throw Object.assign(new Error('Permission denied'), { statusCode: 403 });
      if (!['pending', 'confirmed'].includes(resv.reservation_status)) throw Object.assign(new Error('Reservation cannot be cancelled'), { statusCode: 409 });
      db.prepare("UPDATE library_reservations SET reservation_status = 'cancelled' WHERE id = ?").run(id);
      inventoryService.releaseReservedCopyTx(resv.inventory_id);
      return resv;
    });
    const resv = tx();
    logAudit(req.user.id, 'library_reservation_cancel', 'library_reservation', id, null);
    createNotification({ userId: resv.student_user_id, title: 'Reservation cancelled', message: `Reservation ${resv.reservation_code} was cancelled.`, type: 'reservation_expired' });
    res.json({ success: true, message: 'Reservation cancelled' });
  } catch (err) { next(err); }
}

async function issueBook(req, res, next) {
  try {
    const { reservation_id, student_identifier } = req.body; // hall ticket number or student user id
    if (!reservation_id || !student_identifier) return res.status(422).json({ success: false, message: 'reservation_id and student_identifier required' });
    const result = db.transaction(() => {
      const resv = db.prepare(`
        SELECT lr.*, li.max_issue_days, li.book_id
        FROM library_reservations lr JOIN library_inventory li ON li.id = lr.inventory_id
        WHERE lr.id = ?
      `).get(reservation_id);
      if (!resv) throw Object.assign(new Error('Reservation not found'), { statusCode: 404 });
      if (!['pending', 'confirmed'].includes(resv.reservation_status)) throw Object.assign(new Error('Reservation is not valid for issue'), { statusCode: 409 });
      if (resv.expiry_date && new Date(resv.expiry_date).getTime() < Date.now()) throw Object.assign(new Error('Reservation has expired'), { statusCode: 409 });
      // verify student
      const student = db.prepare(`
        SELECT s.*, u.id as uid FROM students s JOIN users u ON u.id = s.user_id
        WHERE s.hall_ticket_number = ? OR s.user_id = ?
      `).get(String(student_identifier).trim().toUpperCase(), parseInt(student_identifier, 10) || -1);
      if (!student || student.uid !== resv.student_user_id) throw Object.assign(new Error('Student identity verification failed'), { statusCode: 403 });
      const issueDate = new Date();
      const dueDate = addDays(issueDate, resv.max_issue_days || 14);
      const info = db.prepare(`
        INSERT INTO library_issues (reservation_id, inventory_id, student_user_id, issued_by_librarian_id, issue_date, due_date, issue_status)
        VALUES (?,?,?,?,?,?, 'issued')
      `).run(resv.id, resv.inventory_id, resv.student_user_id, req.user.id, toISODate(issueDate), toISODate(dueDate));
      inventoryService.issueReservedCopyTx(resv.inventory_id);
      db.prepare("UPDATE library_reservations SET reservation_status = 'collected' WHERE id = ?").run(resv.id);
      return { issueId: info.lastInsertRowid, studentUserId: resv.student_user_id, dueDate };
    })();
    logAudit(req.user.id, 'library_issue', 'library_issue', result.issueId, { reservation_id });
    createNotification({ userId: result.studentUserId, title: 'Library book issued', message: `Book issued. Due date: ${toISODate(result.dueDate).slice(0,10)}.`, type: 'library_issued', email: true });
    const issue = db.prepare(`
      SELECT li.*, b.title, b.author, u.full_name as student_name
      FROM library_issues li
      JOIN library_inventory inv ON inv.id = li.inventory_id JOIN books b ON b.id = inv.book_id
      JOIN users u ON u.id = li.student_user_id WHERE li.id = ?
    `).get(result.issueId);
    res.status(201).json({ success: true, message: 'Book issued successfully', data: issue });
  } catch (err) { next(err); }
}

async function returnIssue(req, res, next) {
  try {
    const id = req.params.id;
    const result = db.transaction(() => {
      const issue = db.prepare('SELECT * FROM library_issues WHERE id = ?').get(id);
      if (!issue) throw Object.assign(new Error('Issue record not found'), { statusCode: 404 });
      if (issue.issue_status === 'returned') throw Object.assign(new Error('Book already returned'), { statusCode: 409 });
      const returnDate = req.body.return_date ? new Date(req.body.return_date) : new Date();
      db.prepare("UPDATE library_issues SET return_date = ?, issue_status = 'returned' WHERE id = ?").run(toISODate(returnDate), id);
      inventoryService.returnIssuedCopyTx(issue.inventory_id);
      return issue;
    })();
    logAudit(req.user.id, 'library_return', 'library_issue', id, null);
    createNotification({ userId: result.student_user_id, title: 'Library book returned', message: 'Your library book return has been recorded.', type: 'library_returned' });
    res.json({ success: true, message: 'Book return recorded' });
  } catch (err) { next(err); }
}

async function listIssues(req, res, next) {
  try {
    const rows = db.prepare(`
      SELECT li.*, b.title, b.author, u.full_name as student_name, s.hall_ticket_number,
             lib.full_name as issued_by_name
      FROM library_issues li
      JOIN library_inventory inv ON inv.id = li.inventory_id
      JOIN books b ON b.id = inv.book_id
      JOIN users u ON u.id = li.student_user_id
      LEFT JOIN students s ON s.user_id = u.id
      JOIN users lib ON lib.id = li.issued_by_librarian_id
      ORDER BY li.issue_date DESC
    `).all();
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

async function libraryReports(req, res, next) {
  try {
    const totals = db.prepare(`
      SELECT COUNT(*) as inventory_items,
             COALESCE(SUM(total_copies),0) as total_copies,
             COALESCE(SUM(available_copies),0) as available_copies,
             COALESCE(SUM(reserved_copies),0) as reserved_copies,
             COALESCE(SUM(issued_copies),0) as issued_copies
      FROM library_inventory
    `).get();
    const overdue = db.prepare(`
      SELECT li.*, b.title, u.full_name as student_name, s.hall_ticket_number
      FROM library_issues li
      JOIN library_inventory inv ON inv.id = li.inventory_id
      JOIN books b ON b.id = inv.book_id
      JOIN users u ON u.id = li.student_user_id
      LEFT JOIN students s ON s.user_id = u.id
      WHERE li.issue_status IN ('issued','overdue') AND li.due_date < datetime('now')
      ORDER BY li.due_date ASC
    `).all();
    const mostReserved = db.prepare(`
      SELECT b.id, b.title, b.author, COUNT(*) as reservation_count
      FROM library_reservations lr
      JOIN library_inventory li ON li.id = lr.inventory_id
      JOIN books b ON b.id = li.book_id
      GROUP BY b.id ORDER BY reservation_count DESC LIMIT 10
    `).all();
    const departmentUsage = db.prepare(`
      SELECT d.department_name, d.department_code,
             COUNT(DISTINCT li.id) as inventory_items,
             COALESCE(SUM(li.total_copies),0) as total_copies,
             COALESCE(SUM(li.issued_copies),0) as issued_copies,
             (SELECT COUNT(*) FROM library_reservations lr2 JOIN library_inventory li2 ON li2.id = lr2.inventory_id JOIN books b2 ON b2.id = li2.book_id WHERE b2.department_id = d.id) as reservations
      FROM departments d
      LEFT JOIN books b ON b.department_id = d.id
      LEFT JOIN library_inventory li ON li.book_id = b.id
      GROUP BY d.id
      ORDER BY d.department_name
    `).all();
    res.json({
      success: true,
      data: {
        totals,
        overdue_books: overdue,
        most_reserved_books: mostReserved,
        department_wise_usage: departmentUsage,
      }
    });
  } catch (err) { next(err); }
}

module.exports = {
  addInventory, updateInventory, searchLibraryBooks,
  createReservation, myReservations, listReservations,
  approveReservation, cancelReservation,
  issueBook, returnIssue, listIssues, libraryReports,
};
