const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');
const hpp = require('hpp');

/**
 * General rate limiter - applies to all routes
 */
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for static files
    return req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico)$/);
  }
});

/**
 * Strict rate limiter for authentication endpoints
 */
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Data sanitization middleware
 */
const sanitizeData = mongoSanitize({
  onSanitize: ({ req, key }) => {
    console.warn(`Potential NoSQL injection attempt detected in ${key}`);
  }
});

/**
 * Security headers middleware
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"]
    }
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'
  },
  noSniff: true,
  xssFilter: true
});

/**
 * HTTP Parameter Pollution protection
 */
const parameterPollutionProtection = hpp({
  whitelist: [
    'sort',
    'fields',
    'limit',
    'skip',
    'page'
  ]
});

/**
 * CSRF token validation middleware
 */
const csrfProtection = (req, res, next) => {
  // Generate CSRF token for GET requests
  if (req.method === 'GET') {
    const crypto = require('crypto');
    req.csrfToken = crypto.randomBytes(32).toString('hex');
    res.setHeader('X-CSRF-Token', req.csrfToken);
  }

  // Validate CSRF token for state-changing requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const tokenFromHeader = req.headers['x-csrf-token'];
    const tokenFromCookie = req.cookies?.csrfToken;
    
    // CSRF check can be skipped for API endpoints with Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return next(); // Token-based auth is CSRF-safe
    }

    if (!tokenFromHeader || !tokenFromCookie || tokenFromHeader !== tokenFromCookie) {
      return res.status(403).json({ error: 'CSRF token validation failed' });
    }
  }

  next();
};

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });

  next();
};

module.exports = {
  generalLimiter,
  authLimiter,
  sanitizeData,
  securityHeaders,
  parameterPollutionProtection,
  csrfProtection,
  requestLogger
};
