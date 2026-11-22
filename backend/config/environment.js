const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  host: process.env.HOST || '127.0.0.1',
  loopbackOnly: process.env.LOOPBACK_ONLY !== 'false',
  nodeEnv: process.env.NODE_ENV || 'development',
  databasePath: process.env.DATABASE_PATH || './database/mrv_bookhub.db',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me_at_least_32_chars_long',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  apiBearerToken: process.env.API_BEARER_TOKEN || '',
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM || 'MRV BookHub <noreply@mrvbookhub.local>',
  },
  otp: {
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10,
    resendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 10) || 60,
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 5,
  },
  reminders: {
    cron: process.env.REMINDER_CRON || '0 8 * * *',
    daysBefore: (process.env.REMINDER_DAYS_BEFORE || '2,1')
      .split(',').map((d) => parseInt(d.trim(), 10)).filter((d) => !Number.isNaN(d)),
  },
  reservationExpiryDays: parseInt(process.env.RESERVATION_EXPIRY_DAYS, 10) || 3,
  maxUploadSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB, 10) || 5,
  logFile: process.env.LOG_FILE || path.join(__dirname, '..', 'logs', 'app.log'),
  logToFile: process.env.LOG_TO_FILE !== 'false',
};

config.isProduction = config.nodeEnv === 'production';
config.smtpConfigured = Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);

module.exports = config;
