const nodemailer = require('nodemailer');
const config = require('../config/environment');

let transporter = null;
if (config.smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
}

async function sendEmail({ to, subject, text, html }) {
  if (!to) return { simulated: true, reason: 'no recipient' };
  if (!config.smtpConfigured) {
    if (!config.isProduction) {
      console.log('[DEV EMAIL SIMULATION]', { to, subject, text });
    }
    return { simulated: true };
  }
  return transporter.sendMail({ from: config.smtp.from, to, subject, text, html });
}

async function sendPasswordResetCode(user, code) {
  const subject = 'MRV BookHub Password Reset Code';
  const text = `Your password reset code is: ${code}. It expires in ${config.otp.expiryMinutes} minutes.`;
  return sendEmail({ to: user.email, subject, text });
}

module.exports = { sendEmail, sendPasswordResetCode };
