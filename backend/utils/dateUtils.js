function toISODate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString();
}

function addDays(date, days) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setDate(d.getDate() + Number(days));
  return d;
}

function startOfDay(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function daysBetween(a, b) {
  const da = startOfDay(a).getTime();
  const db = startOfDay(b).getTime();
  return Math.round((db - da) / (24 * 60 * 60 * 1000));
}

module.exports = { toISODate, addDays, startOfDay, endOfDay, daysBetween };
