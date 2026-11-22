const express = require('express');
const ctrl = require('../controllers/borrowController');
const { authenticate } = require('../middleware/authMiddleware');
const { allowRoles } = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(authenticate);

router.post('/request', allowRoles('student', 'faculty', 'admin'), ctrl.createRequest);
router.get('/my-requests', ctrl.myRequests);
router.get('/received-requests', ctrl.receivedRequests);

router.patch('/:id/approve', allowRoles('student', 'faculty', 'admin'), ctrl.approveRequest);
router.patch('/:id/reject', allowRoles('student', 'faculty', 'admin'), ctrl.rejectRequest);
router.patch('/:id/cancel', ctrl.cancelRequest);

router.post('/:id/issue', allowRoles('student', 'faculty', 'admin'), ctrl.recordIssue);
router.patch('/:id/return', allowRoles('student', 'faculty', 'admin'), ctrl.returnBook);

router.post('/:id/extension-request', allowRoles('student', 'faculty'), ctrl.requestExtension);
router.patch('/:id/extension-approve', allowRoles('student', 'faculty', 'admin'), ctrl.approveExtension);
router.patch('/:id/extension-reject', allowRoles('student', 'faculty', 'admin'), ctrl.rejectExtension);

module.exports = router;
