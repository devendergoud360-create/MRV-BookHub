const express = require('express');
const ctrl = require('../controllers/vendorController');
const { authenticate, optionalAuth } = require('../middleware/authMiddleware');
const { allowRoles } = require('../middleware/roleMiddleware');
const { upload } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/listings', optionalAuth, ctrl.listVendorListings);
router.post('/listings', authenticate, allowRoles('vendor'), upload.single('image'), ctrl.createVendorListing);

router.get('/orders', authenticate, ctrl.listOrders);
router.post('/orders', authenticate, allowRoles('student'), ctrl.createOrder);
router.patch('/orders/:id/status', authenticate, allowRoles('vendor', 'admin'), ctrl.updateOrderStatus);

module.exports = router;
