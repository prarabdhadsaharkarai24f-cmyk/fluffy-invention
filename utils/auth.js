const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
async function hashPassword(password) {
  try {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    return await bcrypt.hash(password, rounds);
  } catch (error) {
    logger.error('Error hashing password:', error);
    throw error;
  }
}

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} - Password match result
 */
async function comparePassword(password, hash) {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error('Error comparing password:', error);
    throw error;
  }
}

/**
 * Generate JWT token
 * @param {object} payload - Token payload
 * @returns {string} - JWT token
 */
function generateToken(payload) {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long');
    }

    const options = {
      expiresIn: process.env.JWT_EXPIRY || '12h',
      algorithm: 'HS256'
    };

    return jwt.sign(payload, secret, options);
  } catch (error) {
    logger.error('Error generating token:', error);
    throw error;
  }
}

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {object|null} - Decoded payload or null if invalid
 */
function verifyToken(token) {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    return jwt.verify(token, secret);
  } catch (error) {
    logger.warn('Token verification failed:', error.message);
    return null;
  }
}

/**
 * Extract token from Authorization header
 * @param {object} req - Express request object
 * @returns {string|null} - Token or null
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  extractToken
};
