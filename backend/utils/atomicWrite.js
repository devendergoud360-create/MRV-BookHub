const fs = require('fs');
const path = require('path');

function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmp, payload, 'utf8');
  fs.renameSync(tmp, filePath);
  return filePath;
}

function safeReadJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    // corrupt file backup and recovery
    if (fs.existsSync(filePath)) {
      const backup = `${filePath}.corrupt.${Date.now()}.bak`;
      try { fs.copyFileSync(filePath, backup); } catch (_) {}
    }
    return fallback;
  }
}

module.exports = { atomicWriteJson, safeReadJson };
