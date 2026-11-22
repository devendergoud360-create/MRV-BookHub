const express = require('express');
const ctrl = require('../controllers/adminController');
const { authenticate } = require('../middleware/authMiddleware');
const { allowRoles } = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(authenticate, allowRoles('admin'));

router.get('/users', ctrl.listUsers);
router.patch('/users/:id/approve', ctrl.approveUser);
router.patch('/users/:id/suspend', ctrl.suspendUser);
router.patch('/users/:id/reject', ctrl.rejectUser);

router.get('/books', ctrl.listAllBooks);
router.delete('/books/:id', ctrl.deleteBook);

router.get('/reports', ctrl.reports);
router.get('/audit-logs', ctrl.auditLogs);

router.get('/departments', ctrl.manageDepartment);
router.post('/departments', ctrl.manageDepartment);
router.delete('/departments/:id', ctrl.manageDepartment);

module.exports = router;
