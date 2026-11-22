const fs = require('fs');
const path = require('path');

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const configured = (process.env.LOG_LEVEL || 'info').toLowerCase();
const level = LOG_LEVELS[configured] ?? LOG_LEVELS.info;
const logFile = process.env.LOG_FILE || path.join(__dirname, '..', 'logs', 'app.log');

function ensureLogDir() {
  const dir = path.dirname(logFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function write(entry) {
  const line = JSON.stringify(entry);
  if (process.env.NODE_ENV !== 'test') process.stdout.write(line + '\n');
  if (process.env.LOG_TO_FILE !== 'false') {
    try { ensureLogDir(); fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* file sink best-effort */ }
  }
}

function log(severity, event, data = {}) {
  if ((LOG_LEVELS[severity] ?? 2) > level) return;
  const entry = {
    ts: new Date().toISOString(),
    severity,
    event,
    service: 'mrv-bookhub-backend',
    ...data,
  };
  write(entry);
}

module.exports = {
  log,
  info: (event, data) => log('info', event, data),
  warn: (event, data) => log('warn', event, data),
  error: (event, data) => log('error', event, data),
  debug: (event, data) => log('debug', event, data),
  events: {
    SERVER_START: 'server.start',
    REQUEST_ERROR: 'request.error',
    AUTH_LOGIN_SUCCESS: 'auth.login.success',
    AUTH_LOGIN_FAILURE: 'auth.login.failure',
    AUTH_REGISTER: 'auth.register',
    SECURITY_CSRF_REJECT: 'security.csrf.reject',
    SECURITY_ORIGIN_REJECT: 'security.origin.reject',
    SECURITY_AUTH_REJECT: 'security.auth.reject',
    DATA_WRITE: 'data.write',
    DATA_CORRUPTION: 'data.corruption',
    COMMAND_EXECUTE: 'command.execute',
  },
};
