const express = require('express');
const ctrl = require('../controllers/userController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/profile', authenticate, ctrl.getProfile);
router.get('/departments', ctrl.listDepartments);
router.get('/:id', authenticate, ctrl.getUserById);

module.exports = router;
