const { db } = require('../config/database');
const logger = require('./logger');

function logAudit({ actorUserId = null, action, entityType = null, entityId = null, details = null, requestId = null }) {
  try {
    db.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)`)
      .run(actorUserId, action, entityType, entityId, details ? JSON.stringify({ ...details, requestId }) : (requestId ? JSON.stringify({ requestId }) : null));
  } catch (err) {
    logger.error('audit.write.failure', { action, message: err.message });
  }
}

module.exports = { logAudit };
