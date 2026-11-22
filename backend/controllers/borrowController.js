const { db } = require('../config/database');
const { createNotification } = require('../services/notificationService');
const { logAudit } = require('./authController');
const { addDays, toISODate } = require('../utils/dateUtils');

function getListing(listingId) {
  return db.prepare(`
    SELECT bl.*, b.title, b.author, u.full_name as owner_name
    FROM book_listings bl
    JOIN books b ON b.id = bl.book_id
    JOIN users u ON u.id = bl.owner_user_id
    WHERE bl.id = ?
  `).get(listingId);
}

async function createRequest(req, res, next) {
  try {
    const { listing_id, requested_days, request_message } = req.body;
    if (!listing_id || !requested_days) return res.status(422).json({ success: false, message: 'listing_id and requested_days are required' });
    const days = parseInt(requested_days, 10);
    if (isNaN(days) || days <= 0) return res.status(422).json({ success: false, message: 'requested_days must be a positive number' });
    const listing = getListing(listing_id);
    if (!listing) return res.status(404).json({ success: false, message: 'Book listing not found' });
    if (!['borrow', 'both'].includes(listing.listing_type)) return res.status(400).json({ success: false, message: 'This listing is not available for borrowing' });
    if (listing.owner_user_id === req.user.id) return res.status(400).json({ success: false, message: 'You cannot request your own book' });
    if (!listing.available) return res.status(409).json({ success: false, message: 'Book is not available' });
    if (listing.max_borrow_days && days > listing.max_borrow_days) {
      return res.status(400).json({ success: false, message: `Requested days exceed maximum allowed (${listing.max_borrow_days})` });
    }
    const duplicate = db.prepare(`
      SELECT id FROM borrow_requests WHERE listing_id = ? AND borrower_user_id = ? AND status IN ('pending','approved')
    `).get(listing_id, req.user.id);
    if (duplicate) return res.status(409).json({ success: false, message: 'You already have an active request for this book' });

    const info = db.prepare(`
      INSERT INTO borrow_requests (listing_id, borrower_user_id, requested_days, request_message)
      VALUES (?,?,?,?)
    `).run(listing_id, req.user.id, days, request_message || null);

    createNotification({
      userId: listing.owner_user_id,
      title: 'New borrow request',
      message: `${req.user.full_name || 'A user'} requested to borrow "${listing.title}" for ${days} day(s).`,
      type: 'borrow_request',
      email: true,
    });
    logAudit(req.user.id, 'borrow_request_create', 'borrow_request', info.lastInsertRowid, { listing_id });
    const request = db.prepare('SELECT * FROM borrow_requests WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ success: true, message: 'Borrow request submitted', data: request });
  } catch (err) { next(err); }
}

function enrichRequestQuery(whereClause) {
  return `
    SELECT br.*, b.title, b.author, b.image_path, bl.owner_user_id, bl.max_borrow_days,
           u.full_name as borrower_name, u.email as borrower_email,
           owner.full_name as owner_name
    FROM borrow_requests br
    JOIN book_listings bl ON bl.id = br.listing_id
    JOIN books b ON b.id = bl.book_id
    JOIN users u ON u.id = br.borrower_user_id
    JOIN users owner ON owner.id = bl.owner_user_id
    ${whereClause}
    ORDER BY br.requested_at DESC
  `;
}

async function myRequests(req, res, next) {
  try {
    const rows = db.prepare(enrichRequestQuery('WHERE br.borrower_user_id = ?')).all(req.user.id);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

async function receivedRequests(req, res, next) {
  try {
    const rows = db.prepare(enrichRequestQuery('WHERE bl.owner_user_id = ?')).all(req.user.id);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

async function approveRequest(req, res, next) {
  try {
    const id = req.params.id;
    const tx = db.transaction(() => {
      const reqRow = db.prepare(`
        SELECT br.*, bl.owner_user_id, bl.available, b.title
        FROM borrow_requests br
        JOIN book_listings bl ON bl.id = br.listing_id
        JOIN books b ON b.id = bl.book_id
        WHERE br.id = ?
      `).get(id);
      if (!reqRow) throw Object.assign(new Error('Borrow request not found'), { statusCode: 404 });
      if (reqRow.owner_user_id !== req.user.id && req.user.role !== 'admin') throw Object.assign(new Error('Permission denied'), { statusCode: 403 });
      if (reqRow.status !== 'pending') throw Object.assign(new Error('Request is not pending'), { statusCode: 409 });
      if (!reqRow.available) throw Object.assign(new Error('Listing is no longer available'), { statusCode: 409 });
      db.prepare("UPDATE borrow_requests SET status = 'approved', approved_at = datetime('now') WHERE id = ?").run(id);
      db.prepare("UPDATE book_listings SET available = 0, updated_at = datetime('now') WHERE id = ?").run(reqRow.listing_id);
      // Auto-reject other pending requests for same listing
      db.prepare("UPDATE borrow_requests SET status = 'rejected', rejected_at = datetime('now') WHERE listing_id = ? AND id != ? AND status = 'pending'").run(reqRow.listing_id, id);
      return reqRow;
    });
    const reqRow = tx();
    createNotification({ userId: reqRow.borrower_user_id, title: 'Borrow request approved', message: `Your request to borrow "${reqRow.title}" was approved.`, type: 'borrow_approved', email: true });
    logAudit(req.user.id, 'borrow_request_approve', 'borrow_request', id, null);
    res.json({ success: true, message: 'Borrow request approved' });
  } catch (err) { next(err); }
}

async function rejectRequest(req, res, next) {
  try {
    const id = req.params.id;
    const reqRow = db.prepare(`
      SELECT br.*, bl.owner_user_id, b.title
      FROM borrow_requests br JOIN book_listings bl ON bl.id = br.listing_id JOIN books b ON b.id = bl.book_id
      WHERE br.id = ?
    `).get(id);
    if (!reqRow) return res.status(404).json({ success: false, message: 'Borrow request not found' });
    if (reqRow.owner_user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Permission denied' });
    if (reqRow.status !== 'pending') return res.status(409).json({ success: false, message: 'Request is not pending' });
    db.prepare("UPDATE borrow_requests SET status = 'rejected', rejected_at = datetime('now') WHERE id = ?").run(id);
    createNotification({ userId: reqRow.borrower_user_id, title: 'Borrow request rejected', message: `Your request to borrow "${reqRow.title}" was rejected.`, type: 'borrow_rejected', email: true });
    logAudit(req.user.id, 'borrow_request_reject', 'borrow_request', id, null);
    res.json({ success: true, message: 'Borrow request rejected' });
  } catch (err) { next(err); }
}

async function cancelRequest(req, res, next) {
  try {
    const id = req.params.id;
    const reqRow = db.prepare('SELECT * FROM borrow_requests WHERE id = ?').get(id);
    if (!reqRow) return res.status(404).json({ success: false, message: 'Borrow request not found' });
    if (reqRow.borrower_user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Permission denied' });
    if (reqRow.status !== 'pending') return res.status(409).json({ success: false, message: 'Only pending requests can be cancelled' });
    db.prepare("UPDATE borrow_requests SET status = 'cancelled' WHERE id = ?").run(id);
    res.json({ success: true, message: 'Borrow request cancelled' });
  } catch (err) { next(err); }
}

async function recordIssue(req, res, next) {
  try {
    const id = req.params.id;
    const tx = db.transaction(() => {
      const reqRow = db.prepare(`
        SELECT br.*, bl.owner_user_id, bl.listing_type
        FROM borrow_requests br JOIN book_listings bl ON bl.id = br.listing_id
        WHERE br.id = ?
      `).get(id);
      if (!reqRow) throw Object.assign(new Error('Borrow request not found'), { statusCode: 404 });
      if (reqRow.owner_user_id !== req.user.id && req.user.role !== 'admin') throw Object.assign(new Error('Permission denied'), { statusCode: 403 });
      if (reqRow.status !== 'approved') throw Object.assign(new Error('Request must be approved before issue'), { statusCode: 409 });
      const existing = db.prepare('SELECT id FROM borrow_transactions WHERE borrow_request_id = ?').get(id);
      if (existing) throw Object.assign(new Error('Transaction already recorded'), { statusCode: 409 });
      const issueDate = req.body.issue_date ? new Date(req.body.issue_date) : new Date();
      const dueDate = addDays(issueDate, reqRow.requested_days);
      const info = db.prepare(`
        INSERT INTO borrow_transactions (borrow_request_id, issue_date, due_date, original_due_date, transaction_status)
        VALUES (?,?,?,?, 'active')
      `).run(id, toISODate(issueDate), toISODate(dueDate), toISODate(dueDate));
      return info.lastInsertRowid;
    });
    const txId = tx();
    const transaction = db.prepare('SELECT * FROM borrow_transactions WHERE id = ?').get(txId);
    logAudit(req.user.id, 'borrow_issue', 'borrow_transaction', txId, { request_id: id });
    res.status(201).json({ success: true, message: 'Physical handover recorded', data: transaction });
  } catch (err) { next(err); }
}

async function returnBook(req, res, next) {
  try {
    const id = req.params.id; // borrow_request_id
    const tx = db.transaction(() => {
      const reqRow = db.prepare(`
        SELECT br.*, bl.owner_user_id, bl.id as listing_id, b.title
        FROM borrow_requests br
        JOIN book_listings bl ON bl.id = br.listing_id
        JOIN books b ON b.id = bl.book_id
        WHERE br.id = ?
      `).get(id);
      if (!reqRow) throw Object.assign(new Error('Borrow request not found'), { statusCode: 404 });
      if (reqRow.owner_user_id !== req.user.id && req.user.role !== 'admin') throw Object.assign(new Error('Permission denied'), { statusCode: 403 });
      const bt = db.prepare('SELECT * FROM borrow_transactions WHERE borrow_request_id = ?').get(id);
      if (!bt) throw Object.assign(new Error('No active transaction found. Record issue first.'), { statusCode: 404 });
      if (bt.transaction_status === 'returned') throw Object.assign(new Error('Book already returned'), { statusCode: 409 });
      const returnDate = req.body.return_date ? new Date(req.body.return_date) : new Date();
      db.prepare("UPDATE borrow_transactions SET return_date = ?, transaction_status = 'returned' WHERE id = ?").run(toISODate(returnDate), bt.id);
      db.prepare("UPDATE borrow_requests SET status = 'returned' WHERE id = ?").run(id);
      db.prepare("UPDATE book_listings SET available = 1, updated_at = datetime('now') WHERE id = ?").run(reqRow.listing_id);
      return reqRow;
    });
    const reqRow = tx();
    createNotification({ userId: reqRow.borrower_user_id, title: 'Book returned', message: `Return recorded for "${reqRow.title}".`, type: 'system_alert' });
    logAudit(req.user.id, 'borrow_return', 'borrow_request', id, null);
    res.json({ success: true, message: 'Book return recorded' });
  } catch (err) { next(err); }
}

async function requestExtension(req, res, next) {
  try {
    const id = req.params.id; // borrow_request_id
    const { requested_days } = req.body;
    const days = parseInt(requested_days, 10);
    if (!days || days <= 0) return res.status(422).json({ success: false, message: 'requested_days must be positive' });
    const reqRow = db.prepare(`
      SELECT br.*, bl.owner_user_id, b.title FROM borrow_requests br
      JOIN book_listings bl ON bl.id = br.listing_id JOIN books b ON b.id = bl.book_id
      WHERE br.id = ?
    `).get(id);
    if (!reqRow) return res.status(404).json({ success: false, message: 'Borrow request not found' });
    if (reqRow.borrower_user_id !== req.user.id) return res.status(403).json({ success: false, message: 'Permission denied' });
    const bt = db.prepare("SELECT * FROM borrow_transactions WHERE borrow_request_id = ? AND transaction_status IN ('active','overdue')").get(id);
    if (!bt) return res.status(409).json({ success: false, message: 'No active transaction to extend' });
    const existing = db.prepare("SELECT id FROM borrow_extension_requests WHERE borrow_transaction_id = ? AND status = 'pending'").get(bt.id);
    if (existing) return res.status(409).json({ success: false, message: 'An extension request is already pending' });
    db.prepare('INSERT INTO borrow_extension_requests (borrow_transaction_id, requested_days) VALUES (?,?)').run(bt.id, days);
    createNotification({ userId: reqRow.owner_user_id, title: 'Extension requested', message: `Extension of ${days} day(s) requested for "${reqRow.title}".`, type: 'borrow_request' });
    res.status(201).json({ success: true, message: 'Extension request submitted' });
  } catch (err) { next(err); }
}

async function approveExtension(req, res, next) {
  try {
    const id = req.params.id; // borrow_request_id
    const reqRow = db.prepare(`
      SELECT br.*, bl.owner_user_id FROM borrow_requests br JOIN book_listings bl ON bl.id = br.listing_id WHERE br.id = ?
    `).get(id);
    if (!reqRow) return res.status(404).json({ success: false, message: 'Borrow request not found' });
    if (reqRow.owner_user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Permission denied' });
    const bt = db.prepare('SELECT * FROM borrow_transactions WHERE borrow_request_id = ?').get(id);
    if (!bt) return res.status(404).json({ success: false, message: 'Transaction not found' });
    const ext = db.prepare("SELECT * FROM borrow_extension_requests WHERE borrow_transaction_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1").get(bt.id);
    if (!ext) return res.status(404).json({ success: false, message: 'No pending extension request' });
    const newDue = addDays(new Date(bt.due_date), ext.requested_days);
    const tx = db.transaction(() => {
      db.prepare("UPDATE borrow_extension_requests SET status = 'approved', resolved_at = datetime('now') WHERE id = ?").run(ext.id);
      db.prepare("UPDATE borrow_transactions SET due_date = ?, extension_days = extension_days + ?, transaction_status = 'active' WHERE id = ?").run(toISODate(newDue), ext.requested_days, bt.id);
    });
    tx();
    createNotification({ userId: reqRow.borrower_user_id, title: 'Extension approved', message: `Your extension request was approved. New due date: ${toISODate(newDue).slice(0,10)}.`, type: 'borrow_approved' });
    res.json({ success: true, message: 'Extension approved' });
  } catch (err) { next(err); }
}

async function rejectExtension(req, res, next) {
  try {
    const id = req.params.id;
    const reqRow = db.prepare(`
      SELECT br.*, bl.owner_user_id FROM borrow_requests br JOIN book_listings bl ON bl.id = br.listing_id WHERE br.id = ?
    `).get(id);
    if (!reqRow) return res.status(404).json({ success: false, message: 'Borrow request not found' });
    if (reqRow.owner_user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Permission denied' });
    const bt = db.prepare('SELECT * FROM borrow_transactions WHERE borrow_request_id = ?').get(id);
    if (!bt) return res.status(404).json({ success: false, message: 'Transaction not found' });
    const ext = db.prepare("SELECT * FROM borrow_extension_requests WHERE borrow_transaction_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1").get(bt.id);
    if (!ext) return res.status(404).json({ success: false, message: 'No pending extension request' });
    db.prepare("UPDATE borrow_extension_requests SET status = 'rejected', resolved_at = datetime('now') WHERE id = ?").run(ext.id);
    createNotification({ userId: reqRow.borrower_user_id, title: 'Extension rejected', message: 'Your extension request was rejected.', type: 'borrow_rejected' });
    res.json({ success: true, message: 'Extension rejected' });
  } catch (err) { next(err); }
}

module.exports = {
  createRequest, myRequests, receivedRequests,
  approveRequest, rejectRequest, cancelRequest,
  recordIssue, returnBook,
  requestExtension, approveExtension, rejectExtension,
};
