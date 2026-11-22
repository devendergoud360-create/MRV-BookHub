const { db } = require('../config/database');
const { getUserProfile } = require('./authController');

async function getProfile(req, res, next) {
  try {
    const profile = getUserProfile(req.user.id);
    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
}

async function getUserById(req, res, next) {
  try {
    if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id, 10)) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    const profile = getUserProfile(req.params.id);
    if (!profile) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
}

async function listDepartments(req, res, next) {
  try {
    const departments = db.prepare('SELECT * FROM departments ORDER BY department_name').all();
    res.json({ success: true, data: departments });
  } catch (err) { next(err); }
}

module.exports = { getProfile, getUserById, listDepartments };
