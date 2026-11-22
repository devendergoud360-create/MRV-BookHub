const express = require('express');
const ctrl = require('../controllers/libraryController');
const { authenticate } = require('../middleware/authMiddleware');
const { allowRoles } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/books', ctrl.searchLibraryBooks);

router.post('/inventory', authenticate, allowRoles('librarian', 'admin'), ctrl.addInventory);
router.put('/inventory/:id', authenticate, allowRoles('librarian', 'admin'), ctrl.updateInventory);

router.post('/reservations', authenticate, allowRoles('student'), ctrl.createReservation);
router.get('/my-reservations', authenticate, allowRoles('student'), ctrl.myReservations);
router.get('/reservations', authenticate, allowRoles('librarian', 'admin'), ctrl.listReservations);
router.patch('/reservations/:id/approve', authenticate, allowRoles('librarian', 'admin'), ctrl.approveReservation);
router.patch('/reservations/:id/cancel', authenticate, ctrl.cancelReservation);

router.post('/issues', authenticate, allowRoles('librarian', 'admin'), ctrl.issueBook);
router.get('/issues', authenticate, allowRoles('librarian', 'admin'), ctrl.listIssues);
router.patch('/issues/:id/return', authenticate, allowRoles('librarian', 'admin'), ctrl.returnIssue);

router.get('/reports', authenticate, allowRoles('librarian', 'admin'), ctrl.libraryReports);

module.exports = router;
