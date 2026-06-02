const { extractToken, verifyToken } = require('../utils/auth');
const { logAudit } = require('../config/auditLogger');
const logger = require('../config/logger');

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header
 */
const authenticate = (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    // Allow public routes
    if (req.path === '/api/auth/login' || (req.path === '/api/settings' && req.method === 'GET')) {
      return next();
    }
    return res.status(401).json({ error: 'Authentication token is missing' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    logAudit('FAILED_LOGIN', 'USER', 0, null, {
      reason: 'Invalid or expired token',
      ipAddress: req.ip
    });
    return res.status(403).json({ error: 'Authentication token is invalid or expired' });
  }

  req.user = payload;
  next();
};

/**
 * Authorization middleware
 * Checks if user has required role
 */
const authorize = (requiredRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (requiredRoles.length > 0 && !requiredRoles.includes(req.user.role)) {
      logAudit('UNAUTHORIZED_ACCESS', 'USER', req.user.id, req.user, {
        reason: 'Insufficient permissions',
        requiredRoles,
        ipAddress: req.ip
      });
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

/**
 * Error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  logger.error('Application error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id || 'anonymous'
  });

  // Don't expose internal error details to client
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  res.status(statusCode).json({ error: message });
};

module.exports = {
  authenticate,
  authorize,
  errorHandler
};
