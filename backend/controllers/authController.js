const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../config/database');
const config = require('../config/environment');
const generateToken = require('../utils/generateToken');
const { sendPasswordResetCode } = require('../services/emailService');
const { validateEmail, validateMobile } = require('../middleware/validationMiddleware');

function logAudit(actorId, action, entityType, entityId, details) {
  try {
    db.prepare('INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
      .run(actorId || null, action, entityType || null, entityId || null, details ? JSON.stringify(details) : null);
  } catch (_) {}
}

function safeUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

function getUserProfile(userId) {
  const user = db.prepare('SELECT id, full_name, email, mobile_number, role, account_status, email_verified, mobile_verified, created_at FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  let profile = { ...user };
  if (user.role === 'student') {
    const s = db.prepare(`SELECT s.*, d.department_name, d.department_code FROM students s LEFT JOIN departments d ON d.id = s.department_id WHERE s.user_id = ?`).get(userId);
    if (s) profile.student = s;
  } else if (user.role === 'faculty') {
    const f = db.prepare(`SELECT f.*, d.department_name, d.department_code FROM faculty f LEFT JOIN departments d ON d.id = f.department_id WHERE f.user_id = ?`).get(userId);
    if (f) profile.faculty = f;
  } else if (user.role === 'vendor') {
    const v = db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(userId);
    if (v) profile.vendor = v;
  } else if (user.role === 'librarian') {
    const l = db.prepare('SELECT * FROM librarians WHERE user_id = ?').get(userId);
    if (l) profile.librarian = l;
  }
  return profile;
}

async function registerStudent(req, res, next) {
  try {
    const { full_name, hall_ticket_number, email, mobile_number, department_id, academic_year, semester, password, confirm_password } = req.body;
    if (!full_name || !hall_ticket_number || !email || !mobile_number || !password || !confirm_password) {
      return res.status(422).json({ success: false, message: 'All required fields must be provided' });
    }
    if (password !== confirm_password) return res.status(400).json({ success: false, message: 'Passwords do not match' });
    if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    if (!validateEmail(email)) return res.status(422).json({ success: false, message: 'Invalid email' });
    if (!validateMobile(mobile_number)) return res.status(422).json({ success: false, message: 'Invalid mobile number' });

    const existingHall = db.prepare('SELECT id FROM students WHERE hall_ticket_number = ?').get(hall_ticket_number.trim().toUpperCase());
    if (existingHall) return res.status(409).json({ success: false, message: 'Hall ticket number already exists' });
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (existingEmail) return res.status(409).json({ success: false, message: 'Email already exists' });
    const existingMobile = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get(mobile_number.trim());
    if (existingMobile) return res.status(409).json({ success: false, message: 'Mobile number already exists' });

    // Optional verification against authorized_students list
    const authorized = db.prepare('SELECT * FROM authorized_students WHERE hall_ticket_number = ? AND active = 1').get(hall_ticket_number.trim().toUpperCase());
    const account_status = authorized ? 'active' : 'pending';
    const password_hash = await bcrypt.hash(password, 10);

    const tx = db.transaction(() => {
      const info = db.prepare(`INSERT INTO users (full_name, email, mobile_number, password_hash, role, account_status) VALUES (?,?,?,?, 'student', ?)`)
        .run(full_name.trim(), email.trim().toLowerCase(), mobile_number.trim(), password_hash, account_status);
      const userId = info.lastInsertRowid;
      db.prepare(`INSERT INTO students (user_id, hall_ticket_number, department_id, academic_year, semester) VALUES (?,?,?,?,?)`)
        .run(userId, hall_ticket_number.trim().toUpperCase(), department_id || null, academic_year || null, semester || null);
      return userId;
    });
    const userId = tx();
    logAudit(userId, 'student_register', 'user', userId, { hall_ticket_number, account_status });
    const profile = getUserProfile(userId);
    const result = { success: true, message: account_status === 'active' ? 'Registration successful' : 'Registration submitted. Awaiting admin approval.', data: profile };
    if (account_status === 'active') result.data.token = generateToken({ id: userId, role: 'student', email: email.toLowerCase() });
    return res.status(201).json(result);
  } catch (err) { next(err); }
}

async function loginStudent(req, res, next) {
  try {
    const { hall_ticket_number, password } = req.body;
    if (!hall_ticket_number || !password) return res.status(422).json({ success: false, message: 'Hall ticket number and password required' });
    const student = db.prepare('SELECT * FROM students WHERE hall_ticket_number = ?').get(hall_ticket_number.trim().toUpperCase());
    if (!student) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(student.user_id);
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (user.role !== 'student') return res.status(403).json({ success: false, message: 'Invalid account type' });
    if (user.account_status === 'suspended') return res.status(403).json({ success: false, message: 'Account suspended' });
    if (user.account_status === 'rejected') return res.status(403).json({ success: false, message: 'Account rejected' });
    if (user.account_status === 'pending') return res.status(403).json({ success: false, message: 'Account pending approval' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const token = generateToken(user);
    return res.json({ success: true, message: 'Login successful', data: { token, user: getUserProfile(user.id) } });
  } catch (err) { next(err); }
}

async function genericRoleLogin(req, res, next, { role, idField, table, label }) {
  try {
    const idValue = req.body[idField] || req.body.identifier;
    const { password } = req.body;
    if (!idValue || !password) return res.status(422).json({ success: false, message: `${label} and password required` });
    const record = db.prepare(`SELECT * FROM ${table} WHERE ${idField} = ?`).get(String(idValue).trim().toUpperCase());
    if (!record) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(record.user_id);
    if (!user || user.role !== role) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (user.account_status === 'suspended') return res.status(403).json({ success: false, message: 'Account suspended' });
    if (user.account_status === 'rejected') return res.status(403).json({ success: false, message: 'Account rejected' });
    if (user.account_status === 'pending') return res.status(403).json({ success: false, message: 'Account pending approval' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const token = generateToken(user);
    return res.json({ success: true, message: 'Login successful', data: { token, user: getUserProfile(user.id) } });
  } catch (err) { next(err); }
}

async function loginFaculty(req, res, next) {
  return genericRoleLogin(req, res, next, { role: 'faculty', idField: 'faculty_id', table: 'faculty', label: 'Faculty ID' });
}
async function loginLibrarian(req, res, next) {
  return genericRoleLogin(req, res, next, { role: 'librarian', idField: 'librarian_id', table: 'librarians', label: 'Librarian ID' });
}
async function loginVendor(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(422).json({ success: false, message: 'Email and password required' });
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND role = ?').get(email.trim().toLowerCase(), 'vendor');
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (user.account_status === 'suspended') return res.status(403).json({ success: false, message: 'Account suspended' });
    if (user.account_status === 'rejected') return res.status(403).json({ success: false, message: 'Account rejected' });
    if (user.account_status === 'pending') return res.status(403).json({ success: false, message: 'Account pending approval' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const token = generateToken(user);
    return res.json({ success: true, message: 'Login successful', data: { token, user: getUserProfile(user.id) } });
  } catch (err) { next(err); }
}
async function loginAdmin(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(422).json({ success: false, message: 'Email and password required' });
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND role = ?').get(email.trim().toLowerCase(), 'admin');
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (user.account_status !== 'active') return res.status(403).json({ success: false, message: 'Account not active' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const token = generateToken(user);
    return res.json({ success: true, message: 'Login successful', data: { token, user: getUserProfile(user.id) } });
  } catch (err) { next(err); }
}

async function forgotPassword(req, res, next) {
  try {
    const { email, mobile_number } = req.body;
    if (!email && !mobile_number) return res.status(422).json({ success: false, message: 'Provide registered email or mobile number' });
    let user;
    if (email) user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    else user = db.prepare('SELECT * FROM users WHERE mobile_number = ?').get(String(mobile_number).trim());
    // Always respond success to avoid user enumeration, but only act if found
    if (!user) return res.json({ success: true, message: 'If the account exists, a verification code has been sent' });

    const recent = db.prepare('SELECT * FROM password_resets WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(user.id);
    if (recent) {
      const created = new Date(recent.created_at).getTime();
      const cooldownMs = config.otp.resendCooldownSeconds * 1000;
      if (Date.now() - created < cooldownMs) {
        return res.status(429).json({ success: false, message: 'Please wait before requesting another code' });
      }
    }

    const code = String(crypto.randomInt(100000, 999999));
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000).toISOString();
    db.prepare('INSERT INTO password_resets (user_id, verification_code_hash, expires_at) VALUES (?,?,?)').run(user.id, hash, expiresAt);
    await sendPasswordResetCode(user, code);

    const resp = { success: true, message: 'If the account exists, a verification code has been sent' };
    if (!config.isProduction && !config.smtpConfigured) resp.dev_code = code; // dev-only simulated OTP
    return res.json(resp);
  } catch (err) { next(err); }
}

async function verifyResetCode(req, res, next) {
  try {
    const { email, mobile_number, code } = req.body;
    if (!code || (!email && !mobile_number)) return res.status(422).json({ success: false, message: 'Identifier and code required' });
    let user;
    if (email) user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    else user = db.prepare('SELECT * FROM users WHERE mobile_number = ?').get(String(mobile_number).trim());
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    const reset = db.prepare(`SELECT * FROM password_resets WHERE user_id = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`).get(user.id);
    if (!reset) return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    if (new Date(reset.expires_at).getTime() < Date.now()) return res.status(400).json({ success: false, message: 'Code expired' });
    if (reset.attempts >= config.otp.maxAttempts) return res.status(429).json({ success: false, message: 'Too many attempts. Request a new code.' });
    const hash = crypto.createHash('sha256').update(String(code)).digest('hex');
    if (hash !== reset.verification_code_hash) {
      db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?').run(reset.id);
      return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    }
    db.prepare("UPDATE password_resets SET verified_at = datetime('now') WHERE id = ?").run(reset.id);
    return res.json({ success: true, message: 'Code verified. You may reset your password.' });
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const { email, mobile_number, code, new_password, confirm_password } = req.body;
    if (!code || !new_password || !confirm_password || (!email && !mobile_number)) {
      return res.status(422).json({ success: false, message: 'Missing required fields' });
    }
    if (new_password !== confirm_password) return res.status(400).json({ success: false, message: 'Passwords do not match' });
    if (new_password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    let user;
    if (email) user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    else user = db.prepare('SELECT * FROM users WHERE mobile_number = ?').get(String(mobile_number).trim());
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    const hash = crypto.createHash('sha256').update(String(code)).digest('hex');
    const reset = db.prepare(`SELECT * FROM password_resets WHERE user_id = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`).get(user.id);
    if (!reset || reset.verification_code_hash !== hash) return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    if (new Date(reset.expires_at).getTime() < Date.now()) return res.status(400).json({ success: false, message: 'Code expired' });
    if (!reset.verified_at) return res.status(400).json({ success: false, message: 'Code not verified' });
    const password_hash = await bcrypt.hash(new_password, 10);
    const tx = db.transaction(() => {
      db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(password_hash, user.id);
      db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").run(user.id);
    });
    tx();
    logAudit(user.id, 'password_reset', 'user', user.id, null);
    return res.json({ success: true, message: 'Password reset successful' });
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    const profile = getUserProfile(req.user.id);
    return res.json({ success: true, data: profile });
  } catch (err) { next(err); }
}

module.exports = {
  registerStudent,
  loginStudent,
  loginFaculty,
  loginLibrarian,
  loginVendor,
  loginAdmin,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  me,
  getUserProfile,
  logAudit,
};
