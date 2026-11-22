const jwt = require('jsonwebtoken');
const config = require('../config/environment');
const { db } = require('../config/database');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = db.prepare('SELECT id, role, account_status, full_name, email FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    if (user.account_status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Account suspended' });
    }
    if (user.account_status === 'rejected') {
      return res.status(403).json({ success: false, message: 'Account rejected' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = db.prepare('SELECT id, role, account_status, full_name, email FROM users WHERE id = ?').get(decoded.id);
    if (user && user.account_status === 'active') req.user = user;
  } catch (_) {}
  next();
}

function requireActive(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
  if (req.user.account_status !== 'active') {
    return res.status(403).json({ success: false, message: 'Account is not active' });
  }
  next();
}

module.exports = { authenticate, optionalAuth, requireActive };
