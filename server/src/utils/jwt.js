const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * JWT Utilities for AcademicAlly
 * Handles token generation, verification, and refresh functionality
 */

class JWTUtils {
  constructor() {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET || crypto.randomBytes(64).toString('hex');
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
  }

  /**
   * Generate access token for user authentication
   * @param {Object} payload - User data to encode in token
   * @param {string} payload.userId - User ID
   * @param {string} payload.email - User email
   * @param {string} payload.role - User role (default: 'student')
   * @returns {string} JWT access token
   */
  generateAccessToken(payload) {
    try {
      const tokenPayload = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role || 'student',
        type: 'access'
      };

      return jwt.sign(tokenPayload, this.accessTokenSecret, {
        expiresIn: this.accessTokenExpiry,
        issuer: 'academically',
        audience: 'academically-users'
      });
    } catch (error) {
      throw new Error(`Failed to generate access token: ${error.message}`);
    }
  }

  /**
   * Generate refresh token for token renewal
   * @param {Object} payload - User data to encode in token
   * @param {string} payload.userId - User ID
   * @param {string} payload.email - User email
   * @returns {string} JWT refresh token
   */
  generateRefreshToken(payload) {
    try {
      const tokenPayload = {
        userId: payload.userId,
        email: payload.email,
        type: 'refresh',
        tokenId: crypto.randomBytes(16).toString('hex') // Unique token ID for revocation
      };

      return jwt.sign(tokenPayload, this.refreshTokenSecret, {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'academically',
        audience: 'academically-users'
      });
    } catch (error) {
      throw new Error(`Failed to generate refresh token: ${error.message}`);
    }
  }

  /**
   * Generate both access and refresh tokens
   * @param {Object} payload - User data
   * @returns {Object} Object containing both tokens
   */
  generateTokenPair(payload) {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
      tokenType: 'Bearer',
      expiresIn: this.accessTokenExpiry
    };
  }

  /**
   * Verify access token
   * @param {string} token - JWT token to verify
   * @returns {Object} Decoded token payload
   */
  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'academically',
        audience: 'academically-users'
      });

      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Access token expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid access token');
      } else {
        throw new Error(`Token verification failed: ${error.message}`);
      }
    }
  }

  /**
   * Verify refresh token
   * @param {string} token - JWT refresh token to verify
   * @returns {Object} Decoded token payload
   */
  verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret, {
        issuer: 'academically',
        audience: 'academically-users'
      });

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Refresh token expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid refresh token');
      } else {
        throw new Error(`Token verification failed: ${error.message}`);
      }
    }
  }

  /**
   * Decode token without verification (for debugging)
   * @param {string} token - JWT token to decode
   * @returns {Object} Decoded token payload
   */
  decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      throw new Error(`Failed to decode token: ${error.message}`);
    }
  }

  /**
   * Check if token is expired
   * @param {string} token - JWT token to check
   * @returns {boolean} True if token is expired
   */
  isTokenExpired(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) {
        return true;
      }
      
      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get token expiration time
   * @param {string} token - JWT token
   * @returns {Date|null} Expiration date or null if invalid
   */
  getTokenExpiration(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) {
        return null;
      }
      
      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate password reset token
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @returns {string} Password reset token
   */
  generatePasswordResetToken(userId, email) {
    try {
      const payload = {
        userId,
        email,
        type: 'password_reset',
        resetId: crypto.randomBytes(16).toString('hex')
      };

      return jwt.sign(payload, this.accessTokenSecret, {
        expiresIn: '1h', // Password reset tokens expire in 1 hour
        issuer: 'academically',
        audience: 'academically-users'
      });
    } catch (error) {
      throw new Error(`Failed to generate password reset token: ${error.message}`);
    }
  }

  /**
   * Verify password reset token
   * @param {string} token - Password reset token
   * @returns {Object} Decoded token payload
   */
  verifyPasswordResetToken(token) {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'academically',
        audience: 'academically-users'
      });

      if (decoded.type !== 'password_reset') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Password reset token expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid password reset token');
      } else {
        throw new Error(`Token verification failed: ${error.message}`);
      }
    }
  }

  /**
   * Generate email verification token
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @returns {string} Email verification token
   */
  generateEmailVerificationToken(userId, email) {
    try {
      const payload = {
        userId,
        email,
        type: 'email_verification',
        verificationId: crypto.randomBytes(16).toString('hex')
      };

      return jwt.sign(payload, this.accessTokenSecret, {
        expiresIn: '24h', // Email verification tokens expire in 24 hours
        issuer: 'academically',
        audience: 'academically-users'
      });
    } catch (error) {
      throw new Error(`Failed to generate email verification token: ${error.message}`);
    }
  }

  /**
   * Verify email verification token
   * @param {string} token - Email verification token
   * @returns {Object} Decoded token payload
   */
  verifyEmailVerificationToken(token) {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'academically',
        audience: 'academically-users'
      });

      if (decoded.type !== 'email_verification') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Email verification token expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid email verification token');
      } else {
        throw new Error(`Token verification failed: ${error.message}`);
      }
    }
  }
}

// Create singleton instance
const jwtUtils = new JWTUtils();

module.exports = jwtUtils;