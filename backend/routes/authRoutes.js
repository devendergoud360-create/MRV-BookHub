const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { success: false, message: 'Too many attempts, please try later' } });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'Too many reset attempts, please try later' } });

router.post('/register/student', authLimiter, ctrl.registerStudent);
router.post('/login/student', authLimiter, ctrl.loginStudent);
router.post('/login/faculty', authLimiter, ctrl.loginFaculty);
router.post('/login/librarian', authLimiter, ctrl.loginLibrarian);
router.post('/login/vendor', authLimiter, ctrl.loginVendor);
router.post('/login/admin', authLimiter, ctrl.loginAdmin);

router.post('/forgot-password', resetLimiter, ctrl.forgotPassword);
router.post('/verify-reset-code', resetLimiter, ctrl.verifyResetCode);
router.post('/reset-password', resetLimiter, ctrl.resetPassword);

router.get('/me', authenticate, ctrl.me);

module.exports = router;
