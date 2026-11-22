const crypto = require('crypto');

function generateReservationId() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `MRV-${y}${m}${d}-${rand}`;
}

module.exports = generateReservationId;
