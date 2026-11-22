const { db } = require('../config/database');
const { createNotification } = require('../services/notificationService');
const { logAudit } = require('./authController');

function ensureApprovedVendor(userId) {
  const v = db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(userId);
  if (!v) return { ok: false, status: 403, message: 'Vendor profile not found' };
  if (v.approval_status !== 'approved') return { ok: false, status: 403, message: 'Only approved vendors can perform this action' };
  return { ok: true, vendor: v };
}

async function createVendorListing(req, res, next) {
  try {
    const check = ensureApprovedVendor(req.user.id);
    if (!check.ok) return res.status(check.status).json({ success: false, message: check.message });
    const { title, author, edition, isbn, course_code, department_id, category, description, book_condition, price, stock_quantity } = req.body;
    if (!title || !author) return res.status(422).json({ success: false, message: 'Title and author are required' });
    if (price === undefined || isNaN(parseFloat(price))) return res.status(422).json({ success: false, message: 'Valid price required' });
    const stock = parseInt(stock_quantity, 10);
    if (isNaN(stock) || stock < 0) return res.status(422).json({ success: false, message: 'Valid stock quantity required' });
    const imagePath = req.file ? `/uploads/book-images/${req.file.filename}` : null;
    const tx = db.transaction(() => {
      let bookId;
      if (isbn) {
        const existing = db.prepare('SELECT id FROM books WHERE isbn = ?').get(isbn.trim());
        if (existing) bookId = existing.id;
      }
      if (!bookId) {
        const info = db.prepare(`INSERT INTO books (title, author, edition, isbn, course_code, department_id, category, description, image_path) VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(title.trim(), author.trim(), edition || null, isbn ? isbn.trim() : null, course_code || null, department_id || null, category || null, description || null, imagePath);
        bookId = info.lastInsertRowid;
      }
      const linfo = db.prepare(`
        INSERT INTO book_listings (book_id, owner_user_id, owner_type, listing_type, book_condition, price, stock_quantity, available)
        VALUES (?,?, 'vendor', 'sell', ?, ?, ?, ?)
      `).run(bookId, req.user.id, book_condition || null, parseFloat(price), stock, stock > 0 ? 1 : 0);
      return linfo.lastInsertRowid;
    });
    const listingId = tx();
    logAudit(req.user.id, 'vendor_listing_create', 'book_listing', listingId, null);
    const listing = db.prepare(`
      SELECT bl.*, b.title, b.author, b.isbn FROM book_listings bl JOIN books b ON b.id = bl.book_id WHERE bl.id = ?
    `).get(listingId);
    res.status(201).json({ success: true, message: 'Vendor listing created', data: listing });
  } catch (err) { next(err); }
}

async function listVendorListings(req, res, next) {
  try {
    // If vendor, show own; if others/public, show all vendor sell listings
    let rows;
    if (req.user && req.user.role === 'vendor') {
      rows = db.prepare(`
        SELECT bl.*, b.title, b.author, b.isbn, b.image_path
        FROM book_listings bl JOIN books b ON b.id = bl.book_id
        WHERE bl.owner_user_id = ? AND bl.owner_type = 'vendor'
        ORDER BY bl.created_at DESC
      `).all(req.user.id);
    } else {
      rows = db.prepare(`
        SELECT bl.*, b.title, b.author, b.isbn, b.image_path, u.full_name as vendor_name, v.business_name
        FROM book_listings bl
        JOIN books b ON b.id = bl.book_id
        JOIN users u ON u.id = bl.owner_user_id
        LEFT JOIN vendors v ON v.user_id = u.id
        WHERE bl.owner_type = 'vendor' AND bl.listing_type IN ('sell','both') AND bl.available = 1
        ORDER BY bl.created_at DESC
      `).all();
    }
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

async function createOrder(req, res, next) {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ success: false, message: 'Only students can place orders' });
    const { listing_id, quantity } = req.body;
    const qty = parseInt(quantity, 10);
    if (!listing_id || !qty || qty <= 0) return res.status(422).json({ success: false, message: 'listing_id and positive quantity required' });
    const result = db.transaction(() => {
      const listing = db.prepare(`
        SELECT bl.*, b.title FROM book_listings bl JOIN books b ON b.id = bl.book_id WHERE bl.id = ?
      `).get(listing_id);
      if (!listing) throw Object.assign(new Error('Listing not found'), { statusCode: 404 });
      if (listing.owner_type !== 'vendor' || !['sell', 'both'].includes(listing.listing_type)) {
        throw Object.assign(new Error('Listing is not available for sale'), { statusCode: 400 });
      }
      if (!listing.available || listing.stock_quantity === null || listing.stock_quantity < qty) {
        throw Object.assign(new Error('Insufficient stock'), { statusCode: 409 });
      }
      const vendor = db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(listing.owner_user_id);
      if (!vendor || vendor.approval_status !== 'approved') throw Object.assign(new Error('Vendor not approved'), { statusCode: 403 });
      const unitPrice = parseFloat(listing.price);
      const total = unitPrice * qty;
      const newStock = listing.stock_quantity - qty;
      const info = db.prepare(`
        INSERT INTO orders (student_user_id, vendor_user_id, listing_id, quantity, unit_price, total_amount, order_status)
        VALUES (?,?,?,?,?,?, 'placed')
      `).run(req.user.id, listing.owner_user_id, listing_id, qty, unitPrice, total);
      db.prepare("UPDATE book_listings SET stock_quantity = ?, available = ?, updated_at = datetime('now') WHERE id = ?")
        .run(newStock, newStock > 0 ? 1 : 0, listing_id);
      return { orderId: info.lastInsertRowid, vendorUserId: listing.owner_user_id, title: listing.title, total };
    })();
    createNotification({ userId: result.vendorUserId, title: 'New order received', message: `New order for "${result.title}" (qty ${qty}).`, type: 'order_update' });
    createNotification({ userId: req.user.id, title: 'Order placed', message: `Order placed for "${result.title}". Total: ${result.total.toFixed(2)} (simulated checkout).`, type: 'order_update' });
    logAudit(req.user.id, 'order_create', 'order', result.orderId, { listing_id, quantity: qty });
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(result.orderId);
    res.status(201).json({ success: true, message: 'Order placed (simulated checkout)', data: order });
  } catch (err) { next(err); }
}

async function listOrders(req, res, next) {
  try {
    let rows;
    if (req.user.role === 'vendor') {
      rows = db.prepare(`
        SELECT o.*, b.title, u.full_name as student_name
        FROM orders o JOIN book_listings bl ON bl.id = o.listing_id JOIN books b ON b.id = bl.book_id
        JOIN users u ON u.id = o.student_user_id
        WHERE o.vendor_user_id = ? ORDER BY o.created_at DESC
      `).all(req.user.id);
    } else if (req.user.role === 'student') {
      rows = db.prepare(`
        SELECT o.*, b.title, u.full_name as vendor_name
        FROM orders o JOIN book_listings bl ON bl.id = o.listing_id JOIN books b ON b.id = bl.book_id
        JOIN users u ON u.id = o.vendor_user_id
        WHERE o.student_user_id = ? ORDER BY o.created_at DESC
      `).all(req.user.id);
    } else if (req.user.role === 'admin') {
      rows = db.prepare(`SELECT o.*, b.title FROM orders o JOIN book_listings bl ON bl.id = o.listing_id JOIN books b ON b.id = bl.book_id ORDER BY o.created_at DESC`).all();
    } else {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

async function updateOrderStatus(req, res, next) {
  try {
    const { status } = req.body;
    const allowed = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) return res.status(422).json({ success: false, message: 'Invalid order status' });
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (req.user.role === 'vendor' && order.vendor_user_id !== req.user.id) return res.status(403).json({ success: false, message: 'Permission denied' });
    if (req.user.role !== 'vendor' && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Permission denied' });

    const tx = db.transaction(() => {
      // If cancelling, restore stock (if not already cancelled/delivered)
      if (status === 'cancelled' && order.order_status !== 'cancelled') {
        const listing = db.prepare('SELECT * FROM book_listings WHERE id = ?').get(order.listing_id);
        if (listing) {
          const newStock = (listing.stock_quantity || 0) + order.quantity;
          db.prepare("UPDATE book_listings SET stock_quantity = ?, available = 1, updated_at = datetime('now') WHERE id = ?").run(newStock, listing.id);
        }
      }
      db.prepare('UPDATE orders SET order_status = ? WHERE id = ?').run(status, order.id);
    });
    tx();
    createNotification({ userId: order.student_user_id, title: 'Order status updated', message: `Your order #${order.id} status is now: ${status}.`, type: 'order_update' });
    logAudit(req.user.id, 'order_status_update', 'order', order.id, { status });
    res.json({ success: true, message: 'Order status updated' });
  } catch (err) { next(err); }
}

module.exports = { createVendorListing, listVendorListings, createOrder, listOrders, updateOrderStatus };
