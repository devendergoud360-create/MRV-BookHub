function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function requireFields(fields) {
  return (req, res, next) => {
    const missing = [];
    for (const f of fields) {
      const val = req.body ? req.body[f] : undefined;
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
        missing.push(f);
      }
    }
    if (missing.length) {
      return res.status(422).json({ success: false, message: 'Validation error', errors: { missing } });
    }
    next();
  };
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').toLowerCase());
}

function validateMobile(mobile) {
  return /^[0-9]{10,15}$/.test(String(mobile || ''));
}

function parsePositiveInt(val, fallback = null) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

module.exports = { isNonEmptyString, requireFields, validateEmail, validateMobile, parsePositiveInt };
