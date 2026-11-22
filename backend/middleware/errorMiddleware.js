const logger = require('../services/logger');

function notFound(req, res, _next) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, _next) { // eslint-disable-line
  const status = err.statusCode || err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const message = status >= 500 && isProd ? 'Internal server error' : (err.message || 'Internal server error');
  const payload = { success: false, message };
  if (err.errors) payload.errors = err.errors;
  if (req.requestId) payload.requestId = req.requestId;
  logger.error(logger.events.REQUEST_ERROR, {
    requestId: req.requestId,
    status,
    message: err.message,
    stack: isProd ? undefined : err.stack,
    path: req.originalUrl,
    method: req.method,
  });
  res.status(status).json(payload);
}

module.exports = { notFound, errorHandler };
