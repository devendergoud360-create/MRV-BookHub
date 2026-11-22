const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config/environment');
const { initializeDatabase } = require('./config/database');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { startReminderScheduler } = require('./services/reminderService');
const logger = require('./services/logger');
const requestLogger = require('./middleware/requestLogger');
const { securityHeaders, originCheck, ensureCsrfCookie, csrfProtect } = require('./middleware/securityMiddleware');
require('./services/commandRegistry'); // register command handlers

initializeDatabase();

const app = express();
app.disable('x-powered-by');

const allowedOrigins = new Set([config.frontendUrl, `http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`, 'http://localhost:5173', 'http://127.0.0.1:5173']);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    logger.warn(logger.events.SECURITY_ORIGIN_REJECT, { origin });
    return cb(null, false);
  },
  credentials: true,
}));
app.use(securityHeaders);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());
app.use(ensureCsrfCookie);
app.use(requestLogger);
app.use(originCheck);
app.use(csrfProtect);

// Static serving for uploaded book images - whitelist extensions
const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', (req, res, next) => {
  const safe = /\.(jpg|jpeg|png|webp|gif)$/i.test(req.path);
  if (!safe) return res.status(404).json({ success: false, message: 'Not found' });
  next();
}, express.static(uploadsDir, { dotfiles: 'deny', index: false }));

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'MRV BookHub API is running', data: { env: config.nodeEnv, time: new Date().toISOString() } });
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/books', require('./routes/bookRoutes'));
app.use('/api/borrow', require('./routes/borrowRoutes'));
app.use('/api/library', require('./routes/libraryRoutes'));
app.use('/api/vendor', require('./routes/vendorRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/system', require('./routes/systemRoutes'));

// Serve frontend build (if present)
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { dotfiles: 'deny', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    const indexPath = path.join(frontendDist, 'index.html');
    if (!fs.existsSync(indexPath)) return next();
    res.sendFile(indexPath);
  });
}

app.use(notFound);
app.use(errorHandler);

startReminderScheduler();

if (require.main === module) {
  const host = config.loopbackOnly ? '127.0.0.1' : '0.0.0.0';
  app.listen(config.port, host, () => {
    logger.info(logger.events.SERVER_START, { port: config.port, host, env: config.nodeEnv });
  });
}

module.exports = app;
