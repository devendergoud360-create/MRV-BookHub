const path = require('path');
const fs = require('fs');
const { db } = require('../config/database');
const { logAudit } = require('./authController');

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function canUpload(role) {
  return ['student', 'faculty', 'vendor', 'admin'].includes(role);
}

async function createBook(req, res, next) {
  try {
    if (!canUpload(req.user.role)) return res.status(403).json({ success: false, message: 'Permission denied' });
    const {
      title, author, edition, isbn, course_code, department_id, category, description,
      listing_type, book_condition, max_borrow_days, price, stock_quantity
    } = req.body;

    if (!title || !author) return res.status(422).json({ success: false, message: 'Title and author are required' });
    const listingType = listing_type || 'borrow';
    if (!['borrow', 'sell', 'both'].includes(listingType)) return res.status(422).json({ success: false, message: 'Invalid listing type' });
    if (req.user.role === 'vendor' && listingType === 'borrow') {
      return res.status(422).json({ success: false, message: 'Vendors can only create sell listings' });
    }

    if (['student', 'faculty'].includes(req.user.role) && (listingType === 'borrow' || listingType === 'both')) {
      if (!max_borrow_days || parseInt(max_borrow_days, 10) <= 0) {
        return res.status(422).json({ success: false, message: 'max_borrow_days required for borrow listings' });
      }
    }
    if (listingType === 'sell' || listingType === 'both') {
      if (price === undefined || price === null || isNaN(parseFloat(price))) {
        return res.status(422).json({ success: false, message: 'Price required for sell listings' });
      }
      if (stock_quantity === undefined || stock_quantity === null || parseInt(stock_quantity, 10) < 0) {
        return res.status(422).json({ success: false, message: 'Stock quantity required for sell listings' });
      }
    }
    if (req.user.role === 'vendor') {
      const vendor = db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(req.user.id);
      if (!vendor || vendor.approval_status !== 'approved') {
        return res.status(403).json({ success: false, message: 'Only approved vendors can publish sale listings' });
      }
    }

    const imagePath = req.file ? `/uploads/book-images/${req.file.filename}` : null;
    const tx = db.transaction(() => {
      let bookId;
      if (isbn) {
        const existing = db.prepare('SELECT id FROM books WHERE isbn = ?').get(isbn.trim());
        if (existing) bookId = existing.id;
      }
      if (!bookId) {
        const info = db.prepare(`
          INSERT INTO books (title, author, edition, isbn, course_code, department_id, category, description, image_path)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).run(
          title.trim(), author.trim(), edition || null, isbn ? isbn.trim() : null,
          course_code || null, department_id || null, category || null, description || null, imagePath
        );
        bookId = info.lastInsertRowid;
      }
      const linfo = db.prepare(`
        INSERT INTO book_listings (book_id, owner_user_id, owner_type, listing_type, book_condition, max_borrow_days, price, stock_quantity, available)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(
        bookId, req.user.id, req.user.role, listingType, book_condition || null,
        max_borrow_days ? parseInt(max_borrow_days, 10) : null,
        price !== undefined && price !== null && price !== '' ? parseFloat(price) : null,
        stock_quantity !== undefined && stock_quantity !== null && stock_quantity !== '' ? parseInt(stock_quantity, 10) : null,
        1
      );
      return { bookId, listingId: linfo.lastInsertRowid };
    });
    const result = tx();
    logAudit(req.user.id, 'book_listing_create', 'book_listing', result.listingId, { bookId: result.bookId });
    const listing = getListingById(result.listingId);
    return res.status(201).json({ success: true, message: 'Book uploaded successfully', data: listing });
  } catch (err) { next(err); }
}

function listingSelectBase() {
  return `
    SELECT bl.*, b.title, b.author, b.edition, b.isbn, b.course_code, b.department_id, b.category, b.description, b.image_path,
           d.department_name, d.department_code,
           u.full_name as owner_name, u.role as owner_role
    FROM book_listings bl
    JOIN books b ON b.id = bl.book_id
    LEFT JOIN departments d ON d.id = b.department_id
    JOIN users u ON u.id = bl.owner_user_id
  `;
}

function getListingById(id) {
  return db.prepare(listingSelectBase() + ' WHERE bl.id = ?').get(id);
}

async function listBooks(req, res, next) {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const where = ['bl.available = 1'];
    const params = [];
    if (req.query.listing_type) { where.push('bl.listing_type = ?'); params.push(req.query.listing_type); }
    if (req.query.department_id) { where.push('b.department_id = ?'); params.push(req.query.department_id); }
    if (req.query.category) { where.push('b.category = ?'); params.push(req.query.category); }
    if (req.query.condition) { where.push('bl.book_condition = ?'); params.push(req.query.condition); }
    if (req.query.owner_type) { where.push('bl.owner_type = ?'); params.push(req.query.owner_type); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const count = db.prepare(`SELECT COUNT(*) as c FROM book_listings bl JOIN books b ON b.id = bl.book_id ${whereSql}`).get(...params).c;
    const rows = db.prepare(`${listingSelectBase()} ${whereSql} ORDER BY bl.created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json({ success: true, data: rows, pagination: { page, limit, total: count } });
  } catch (err) { next(err); }
}

async function getBook(req, res, next) {
  try {
    const listing = getListingById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Book listing not found' });
    res.json({ success: true, data: listing });
  } catch (err) { next(err); }
}

async function searchBooks(req, res, next) {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const where = ['1=1'];
    const params = [];
    const like = (v) => `%${v}%`;
    if (req.query.title) { where.push('b.title LIKE ?'); params.push(like(req.query.title)); }
    if (req.query.author) { where.push('b.author LIKE ?'); params.push(like(req.query.author)); }
    if (req.query.course_code) { where.push('b.course_code LIKE ?'); params.push(like(req.query.course_code)); }
    if (req.query.isbn) { where.push('b.isbn LIKE ?'); params.push(like(req.query.isbn)); }
    if (req.query.department_id) { where.push('b.department_id = ?'); params.push(req.query.department_id); }
    if (req.query.department) { where.push('(d.department_name LIKE ? OR d.department_code LIKE ?)'); params.push(like(req.query.department), like(req.query.department)); }
    if (req.query.category) { where.push('b.category LIKE ?'); params.push(like(req.query.category)); }
    if (req.query.condition) { where.push('bl.book_condition = ?'); params.push(req.query.condition); }
    if (req.query.listing_type) { where.push('bl.listing_type = ?'); params.push(req.query.listing_type); }
    if (req.query.availability === 'available') where.push('bl.available = 1');
    if (req.query.availability === 'unavailable') where.push('bl.available = 0');

    const sortMap = {
      newest: 'bl.created_at DESC',
      oldest: 'bl.created_at ASC',
      title: 'b.title ASC',
      author: 'b.author ASC',
    };
    const orderBy = sortMap[req.query.sort] || 'bl.created_at DESC';
    const whereSql = 'WHERE ' + where.join(' AND ');
    const count = db.prepare(`SELECT COUNT(*) as c FROM book_listings bl JOIN books b ON b.id = bl.book_id LEFT JOIN departments d ON d.id = b.department_id ${whereSql}`).get(...params).c;
    const rows = db.prepare(`${listingSelectBase()} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json({ success: true, data: rows, pagination: { page, limit, total: count } });
  } catch (err) { next(err); }
}

async function updateBook(req, res, next) {
  try {
    const listing = db.prepare('SELECT * FROM book_listings WHERE id = ?').get(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Book listing not found' });
    if (listing.owner_user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this listing' });
    }
    // Prevent changes if active transactions
    const activeBorrow = db.prepare(`SELECT 1 FROM borrow_requests WHERE listing_id = ? AND status IN ('pending','approved')`).get(listing.id);
    if (activeBorrow && (req.body.listing_type || req.body.available === 0 || req.body.available === '0')) {
      return res.status(409).json({ success: false, message: 'Cannot modify listing with active borrow requests/transactions' });
    }

    const { title, author, edition, isbn, course_code, department_id, category, description, listing_type, book_condition, max_borrow_days, price, stock_quantity, available } = req.body;
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE books SET
          title = COALESCE(?, title),
          author = COALESCE(?, author),
          edition = COALESCE(?, edition),
          isbn = COALESCE(?, isbn),
          course_code = COALESCE(?, course_code),
          department_id = COALESCE(?, department_id),
          category = COALESCE(?, category),
          description = COALESCE(?, description),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(title || null, author || null, edition || null, isbn || null, course_code || null, department_id || null, category || null, description || null, listing.book_id);
      if (req.file) {
        db.prepare("UPDATE books SET image_path = ?, updated_at = datetime('now') WHERE id = ?").run(`/uploads/book-images/${req.file.filename}`, listing.book_id);
      }
      db.prepare(`
        UPDATE book_listings SET
          listing_type = COALESCE(?, listing_type),
          book_condition = COALESCE(?, book_condition),
          max_borrow_days = COALESCE(?, max_borrow_days),
          price = COALESCE(?, price),
          stock_quantity = COALESCE(?, stock_quantity),
          available = COALESCE(?, available),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        listing_type || null, book_condition || null,
        max_borrow_days !== undefined ? (max_borrow_days ? parseInt(max_borrow_days, 10) : null) : null,
        price !== undefined ? (price !== '' && price !== null ? parseFloat(price) : null) : null,
        stock_quantity !== undefined ? (stock_quantity !== '' && stock_quantity !== null ? parseInt(stock_quantity, 10) : null) : null,
        available !== undefined ? (String(available) === '1' || available === true ? 1 : 0) : null,
        listing.id
      );
    });
    tx();
    logAudit(req.user.id, 'book_listing_update', 'book_listing', listing.id, null);
    res.json({ success: true, message: 'Book listing updated', data: getListingById(listing.id) });
  } catch (err) { next(err); }
}

async function deleteBook(req, res, next) {
  try {
    const listing = db.prepare('SELECT * FROM book_listings WHERE id = ?').get(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Book listing not found' });
    if (listing.owner_user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this listing' });
    }
    const active = db.prepare(`SELECT 1 FROM borrow_requests WHERE listing_id = ? AND status IN ('pending','approved')`).get(listing.id);
    if (active) {
      return res.status(409).json({ success: false, message: 'Cannot remove listing with active borrow requests or transactions' });
    }
    db.prepare('UPDATE book_listings SET available = 0, updated_at = datetime(\'now\') WHERE id = ?').run(listing.id);
    logAudit(req.user.id, 'book_listing_deactivate', 'book_listing', listing.id, null);
    res.json({ success: true, message: 'Book listing removed' });
  } catch (err) { next(err); }
}

module.exports = { createBook, listBooks, getBook, searchBooks, updateBook, deleteBook };
