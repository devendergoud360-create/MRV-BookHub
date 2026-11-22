/**
 * Defensive input wrappers - validate/normalize request body/query/params.
 * Returns 422 with structured errors; controllers can assume sanitized values.
 */
function sanitizeString(v, { max = 500, trim = true } = {}) {
  if (v === undefined || v === null) return '';
  const s = trim ? String(v).trim() : String(v);
  return s.slice(0, max);
}
function toInt(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}
function toFloat(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n;
}
function validate(schema) {
  return (req, res, next) => {
    const errors = [];
    const out = {};
    for (const [key, rule] of Object.entries(schema)) {
      const source = rule.in === 'query' ? req.query : rule.in === 'params' ? req.params : req.body;
      let val = source ? source[key] : undefined;
      const present = val !== undefined && val !== null && !(typeof val === 'string' && val.trim() === '');
      if (!present) {
        if (rule.required) errors.push({ field: key, message: 'required' });
        else if (rule.default !== undefined) out[key] = rule.default;
        continue;
      }
      if (rule.type === 'string') {
        val = sanitizeString(val, { max: rule.max || 500 });
        if (rule.min && val.length < rule.min) errors.push({ field: key, message: `min length ${rule.min}` });
        if (rule.enum && !rule.enum.includes(val)) errors.push({ field: key, message: 'invalid value' });
        if (rule.pattern && !rule.pattern.test(val)) errors.push({ field: key, message: 'invalid format' });
      } else if (rule.type === 'int') {
        val = toInt(val, NaN);
        if (!Number.isFinite(val)) errors.push({ field: key, message: 'must be integer' });
        if (rule.min !== undefined && val < rule.min) errors.push({ field: key, message: `min ${rule.min}` });
        if (rule.max !== undefined && val > rule.max) errors.push({ field: key, message: `max ${rule.max}` });
      } else if (rule.type === 'float') {
        val = toFloat(val, NaN);
        if (!Number.isFinite(val)) errors.push({ field: key, message: 'must be number' });
      } else if (rule.type === 'bool') {
        if (typeof val === 'boolean') { /* ok */ }
        else if (['true','1','yes'].includes(String(val).toLowerCase())) val = true;
        else if (['false','0','no'].includes(String(val).toLowerCase())) val = false;
        else errors.push({ field: key, message: 'must be boolean' });
      }
      out[key] = val;
    }
    if (errors.length) return res.status(422).json({ success: false, message: 'Validation error', errors });
    req.validated = { ...(req.validated || {}), ...out };
    next();
  };
}

module.exports = { validate, sanitizeString, toInt, toFloat };
