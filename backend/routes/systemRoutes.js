const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { allowRoles } = require('../middleware/roleMiddleware');
const commandBus = require('../services/commandBus');
const { StorageRegistry } = require('../services/storageStrategy');
const { computeBookTrustScore } = require('../services/trustScoreService');
const { db } = require('../config/database');

router.get('/commands', authenticate, allowRoles('admin'), (req, res) => {
  res.json({ success: true, data: commandBus.list() });
});

router.post('/commands/:name', authenticate, allowRoles('admin'), async (req, res, next) => {
  try {
    const result = await commandBus.execute(req.params.name, { user: req.user }, req.body || {});
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/export', authenticate, allowRoles('admin'), (req, res, next) => {
  try {
    const format = (req.query.format || 'json').toLowerCase();
    const reg = new StorageRegistry();
    const outDir = require('path').join(__dirname, '..', 'exports');
    const data = reg.get(format).exportAll(outDir);
    res.json({ success: true, data: { format, tables: Object.keys(data), rows: Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])) } });
  } catch (err) { next(err); }
});

router.get('/trust-score/listing/:id', authenticate, (req, res, next) => {
  try {
    const listing = db.prepare(`SELECT bl.*, b.title, b.created_at as book_created_at, u.created_at as owner_created_at
      FROM book_listings bl JOIN books b ON b.id=bl.book_id JOIN users u ON u.id=bl.owner_user_id WHERE bl.id=?`).get(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    const txCount = db.prepare(`SELECT COUNT(*) as c FROM borrow_transactions bt JOIN borrow_requests br ON br.id=bt.borrow_request_id WHERE br.listing_id=?`).get(req.params.id).c;
    const overdueCount = db.prepare(`SELECT COUNT(*) as c FROM borrow_transactions bt JOIN borrow_requests br ON br.id=bt.borrow_request_id WHERE br.listing_id=? AND bt.transaction_status='overdue'`).get(req.params.id).c;
    const ownerListings = db.prepare(`SELECT COUNT(*) as c FROM book_listings WHERE owner_user_id=?`).get(listing.owner_user_id).c;
    const score = computeBookTrustScore({
      listingAgeDays: Math.max(0, (Date.now() - new Date(listing.created_at).getTime())/86400000),
      ownerAccountAgeDays: Math.max(0, (Date.now() - new Date(listing.owner_created_at).getTime())/86400000),
      completedTransactions: txCount,
      overdueTransactions: overdueCount,
      ownerListingCount: ownerListings,
      hasImage: !!listing.image_path,
      hasIsbn: !!listing.isbn,
      descriptionLength: (listing.description || '').length,
      condition: listing.book_condition || 'Good',
    });
    res.json({ success: true, data: { listing_id: listing.id, ...score } });
  } catch (err) { next(err); }
});

module.exports = router;
