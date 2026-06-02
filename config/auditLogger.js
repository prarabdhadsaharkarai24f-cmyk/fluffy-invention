const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Ensure audit logs directory exists
const auditLogsDir = process.env.AUDIT_LOG_PATH ? path.dirname(process.env.AUDIT_LOG_PATH) : path.join(__dirname, '../logs');
if (!fs.existsSync(auditLogsDir)) {
  fs.mkdirSync(auditLogsDir, { recursive: true });
}

// Create audit logger
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: process.env.AUDIT_LOG_PATH || path.join(auditLogsDir, 'audit.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  ]
});

/**
 * Log transaction activity
 * @param {string} action - Type of action (CREATE, UPDATE, DELETE, LOGIN, LOGOUT)
 * @param {string} entityType - Type of entity (USER, SALE, PURCHASE, CUSTOMER, etc)
 * @param {number} entityId - ID of the entity
 * @param {object} user - User performing the action
 * @param {object} details - Additional details about the transaction
 */
function logAudit(action, entityType, entityId, user, details = {}) {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    action,
    entityType,
    entityId,
    userId: user?.id || 'SYSTEM',
    username: user?.username || 'SYSTEM',
    details,
    ipAddress: details.ipAddress || 'N/A'
  };

  auditLogger.info('AUDIT_LOG', auditEntry);
  return auditEntry;
}

module.exports = {
  auditLogger,
  logAudit
};
