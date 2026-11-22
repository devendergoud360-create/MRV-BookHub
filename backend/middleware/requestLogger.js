const { v4: uuidv4 } = require('uuid');
const logger = require('../services/logger');

function requestLogger(req, res, next) {
  const id = req.headers['x-request-id'] || uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  const start = Date.now();
  res.on('finish', () => {
    logger.info('http.request', {
      requestId: id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: req.ip,
      userId: req.user?.id || null,
    });
  });
  next();
}

module.exports = requestLogger;
