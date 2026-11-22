const crypto = require('crypto');
const config = require('../config/environment');
const logger = require('../services/logger');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Strict CSP; allow inline styles for frontend build, no unsafe-eval
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self' " + (config.frontendUrl || ''),
    "font-src 'self' data:",
  ].join('; '));
  next();
}

function originCheck(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next(); // non-browser or same-origin
  const allowed = new Set([config.frontendUrl, `http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`]);
  if (allowed.has(origin)) return next();
  logger.warn(logger.events.SECURITY_ORIGIN_REJECT, { origin, path: req.path, ip: req.ip });
  return res.status(403).json({ success: false, message: 'Origin not allowed' });
}

function ensureCsrfCookie(req, res, next) {
  const token = req.cookies?.csrf_token || crypto.randomBytes(24).toString('hex');
  res.cookie('csrf_token', token, {
    httpOnly: false, // readable by client to echo in header
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
  });
  req.csrfToken = token;
  next();
}

// Double-submit CSRF: cookie readable by JS + X-CSRF-Token header must match
function csrfProtect(req, res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'];
  if (safe.includes(req.method)) return next();
  // Allow bearer-token API clients (non-browser) to skip CSRF; require for cookie-auth
  const hasBearer = (req.headers.authorization || '').startsWith('Bearer ');
  const cookie = req.cookies?.csrf_token;
  const header = req.headers['x-csrf-token'];
  if (hasBearer && !cookie) return next();
  if (!cookie || !header || cookie !== header) {
    logger.warn(logger.events.SECURITY_CSRF_REJECT, { path: req.path, ip: req.ip, hasCookie: !!cookie, hasHeader: !!header });
    return res.status(403).json({ success: false, message: 'CSRF validation failed' });
  }
  next();
}

function optionalBearer(req, res, next) {
  const token = process.env.API_BEARER_TOKEN;
  if (!token) return next();
  const auth = req.headers.authorization || '';
  if (req.path === '/api/health') return next();
  if (auth === `Bearer ${token}`) { req.bearerAuth = true; return next(); }
  // if JWT present, let auth middleware handle; if neither, reject for protected API
  if (auth.startsWith('Bearer ')) return next();
  return res.status(401).json({ success: false, message: 'Bearer token required' });
}

module.exports = { securityHeaders, originCheck, ensureCsrfCookie, csrfProtect, optionalBearer };
