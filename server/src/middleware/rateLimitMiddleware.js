const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');
const logger = require('../utils/logger');

// Redis client for distributed rate limiting (optional)
let redisClient;
if (process.env.REDIS_URL) {
  redisClient = redis.createClient({
    url: process.env.REDIS_URL,
    retry_strategy: (options) => {
      if (options.error && options.error.code === 'ECONNREFUSED') {
        logger.error('Redis server connection refused');
        return new Error('Redis server connection refused');
      }
      if (options.total_retry_time > 1000 * 60 * 60) {
        return new Error('Retry time exhausted');
      }
      if (options.attempt > 10) {
        return undefined;
      }
      return Math.min(options.attempt * 100, 3000);
    }
  });
  
  redisClient.on('error', (err) => {
    logger.error('Redis rate limit store error:', err);
  });
}

// Store configuration
const getStore = () => {
  if (redisClient && redisClient.connected) {
    return new RedisStore({
      client: redisClient,
      prefix: 'rl:academically:'
    });
  }
  return undefined; // Use memory store as fallback
};

// Custom key generator for user-specific rate limiting
const generateKey = (req) => {
  // Use user ID if authenticated, otherwise use IP
  if (req.user && req.user.id) {
    return `user:${req.user.id}`;
  }
  return `ip:${req.ip || req.connection.remoteAddress}`;
};

// Custom rate limit message handler
const rateLimitHandler = (req, res) => {
  const isAuthenticated = req.user && req.user.id;
  
  logger.warn('Rate limit exceeded', {
    identifier: generateKey(req),
    endpoint: req.path,
    method: req.method,
    userAgent: req.get('User-Agent'),
    authenticated: isAuthenticated
  });
  
  res.status(429).json({
    success: false,
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please slow down your requests.',
    retryAfter: Math.round(req.rateLimit.resetTime / 1000),
    limit: req.rateLimit.limit,
    remaining: req.rateLimit.remaining
  });
};

// Skip rate limiting for certain conditions
const skipSuccessfulRequests = (req, res) => {
  // Skip counting successful requests for certain endpoints
  const skipPaths = ['/api/health', '/api/status'];
  return skipPaths.includes(req.path) && res.statusCode < 400;
};

const skipFailedRequests = (req, res) => {
  // Always count failed requests
  return false;
};

// General API rate limit
const generalLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each user to 100 requests per windowMs
  message: rateLimitHandler,
  keyGenerator: generateKey,
  store: getStore(),
  skipSuccessfulRequests,
  skipFailedRequests,
  standardHeaders: true,
  legacyHeaders: false
});

// Strict rate limit for authentication endpoints
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth requests per windowMs
  message: rateLimitHandler,
  keyGenerator: (req) => `auth:${req.ip}`, // Always use IP for auth
  store: getStore(),
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  standardHeaders: true,
  legacyHeaders: false
});

// Registration rate limit (even stricter)
const registerLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 registration attempts per hour
  message: rateLimitHandler,
  keyGenerator: (req) => `register:${req.ip}`,
  store: getStore(),
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  standardHeaders: true,
  legacyHeaders: false
});

// Password reset rate limit
const passwordResetLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset requests per hour
  message: rateLimitHandler,
  keyGenerator: (req) => `reset:${req.ip}`,
  store: getStore(),
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  standardHeaders: true,
  legacyHeaders: false
});

// File upload rate limit
const uploadLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each user to 20 uploads per hour
  message: rateLimitHandler,
  keyGenerator: generateKey,
  store: getStore(),
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  standardHeaders: true,
  legacyHeaders: false
});

// Message sending rate limit
const messageLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each user to 30 messages per minute
  message: rateLimitHandler,
  keyGenerator: generateKey,
  store: getStore(),
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  standardHeaders: true,
  legacyHeaders: false
});

// Group creation rate limit
const groupCreationLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // Limit each user to 5 group creations per day
  message: rateLimitHandler,
  keyGenerator: generateKey,
  store: getStore(),
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  standardHeaders: true,
  legacyHeaders: false
});

// Matching requests rate limit
const matchingLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Limit each user to 50 matching requests per hour
  message: rateLimitHandler,
  keyGenerator: generateKey,
  store: getStore(),
  skipSuccessfulRequests: true,
  skipFailedRequests: false,
  standardHeaders: true,
  legacyHeaders: false
});

// Report submission rate limit
const reportLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 10, // Limit each user to 10 reports per day
  message: rateLimitHandler,
  keyGenerator: generateKey,
  store: getStore(),
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  standardHeaders: true,
  legacyHeaders: false
});

// Typing indicator rate limit (example: 60 per minute)
const typingLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Limit each user to 60 typing events per minute
  message: rateLimitHandler,
  keyGenerator: generateKey,
  store: getStore(),
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  standardHeaders: true,
  legacyHeaders: false
});

// Study invite rate limit (example: 10 per hour)
const inviteLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each user to 10 invites per hour
  message: rateLimitHandler,
  keyGenerator: generateKey,
  store: getStore(),
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  standardHeaders: true,
  legacyHeaders: false
});

// Presigned URL rate limiter (e.g., 10 requests per minute per user)
const presignedUrlLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: {
    success: false,
    message: 'Too many presigned URL requests. Please try again later.'
  },
  keyGenerator: (req) => req.user ? req.user.id : req.ip
});

// Search rate limiter (e.g., 30 requests per minute per user)
const searchLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: {
    success: false,
    message: 'Too many search requests. Please try again later.'
  },
  keyGenerator: (req) => req.user ? req.user.id : req.ip
});

// Adaptive rate limiting based on user reputation
const adaptiveLimit = (baseLimit, reputationThreshold = 4.0, bonusMultiplier = 1.5) => {
  return (req, res, next) => {
    // If user has good reputation, increase their rate limit
    if (req.user && req.user.reputation >= reputationThreshold) {
      req.rateLimit = {
        ...req.rateLimit,
        limit: Math.floor(baseLimit * bonusMultiplier)
      };
    }
    next();
  };
};

// Middleware to add rate limit info to response headers
const addRateLimitHeaders = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    if (req.rateLimit) {
      res.set({
        'X-RateLimit-Limit': req.rateLimit.limit,
        'X-RateLimit-Remaining': req.rateLimit.remaining,
        'X-RateLimit-Reset': new Date(req.rateLimit.resetTime)
      });
    }
    originalSend.call(this, data);
  };
  
  next();
};

// Custom rate limiter factory
const createCustomLimit = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: rateLimitHandler,
    keyGenerator: generateKey,
    store: getStore(),
    standardHeaders: true,
    legacyHeaders: false
  };
  
  return rateLimit({ ...defaultOptions, ...options });
};

const conversionLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each user to 10 conversions per hour
  message: rateLimitHandler,
  keyGenerator: generateKey,
  store: getStore(),
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  // Pre-configured rate limiters
  generalLimit,
  authLimit,
  registerLimit,
  passwordResetLimit,
  uploadLimit,
  messageLimit,
  groupCreationLimit,
  matchingLimit,
  reportLimit,
  searchLimit,
  typingLimit,
  inviteLimit,
  presignedUrlLimit,
  conversionLimit,
  
  // Utility functions
  adaptiveLimit,
  addRateLimitHeaders,
  createCustomLimit,
  
  // Configuration helpers
  generateKey,
  rateLimitHandler,
  
  // Redis client for external use
  redisClient
};