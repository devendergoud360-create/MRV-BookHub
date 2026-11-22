const express = require('express');
const ctrl = require('../controllers/bookController');
const { authenticate, optionalAuth } = require('../middleware/authMiddleware');
const { upload } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/search', ctrl.searchBooks);
router.get('/', ctrl.listBooks);
router.get('/:id', ctrl.getBook);
router.post('/', authenticate, upload.single('image'), ctrl.createBook);
router.put('/:id', authenticate, upload.single('image'), ctrl.updateBook);
router.delete('/:id', authenticate, ctrl.deleteBook);

module.exports = router;
