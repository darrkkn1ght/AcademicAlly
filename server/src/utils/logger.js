const winston = require('winston');
const path = require('path');

/**
 * Logger Utility for AcademicAlly
 * Handles application logging with different levels and formats
 */

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Tell winston that we want to link the colors 
winston.addColors(colors);

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Define console format (for development)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Define transports
const transports = [
  // Console transport for development
  new winston.transports.Console({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: consoleFormat,
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(logsDir, 'all.log'),
    level: 'debug',
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 10,
  }),
  
  // File transport for error logs only
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 10,
  }),
  
  // File transport for HTTP requests
  new winston.transports.File({
    filename: path.join(logsDir, 'http.log'),
    level: 'http',
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  })
];

// Create logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  levels,
  format: logFormat,
  transports,
  exitOnError: false,
});

/**
 * Enhanced logger with additional methods
 */
class Logger {
  constructor() {
    this.winston = logger;
  }

  /**
   * Log an error message
   * @param {string} message - Error message
   * @param {Error|Object} error - Error object or metadata
   * @param {Object} meta - Additional metadata
   */
  error(message, error = null, meta = {}) {
    const logData = { ...meta };
    
    if (error) {
      if (error instanceof Error) {
        logData.error = {
          message: error.message,
          stack: error.stack,
          name: error.name,
        };
      } else {
        logData.error = error;
      }
    }
    
    this.winston.error(message, logData);
  }

  /**
   * Log a warning message
   * @param {string} message - Warning message
   * @param {Object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    this.winston.warn(message, meta);
  }

  /**
   * Log an info message
   * @param {string} message - Info message
   * @param {Object} meta - Additional metadata
   */
  info(message, meta = {}) {
    this.winston.info(message, meta);
  }

  /**
   * Log an HTTP request
   * @param {string} message - HTTP message
   * @param {Object} meta - Request metadata
   */
  http(message, meta = {}) {
    this.winston.http(message, meta);
  }

  /**
   * Log a debug message
   * @param {string} message - Debug message
   * @param {Object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    this.winston.debug(message, meta);
  }

  /**
   * Log user authentication events
   * @param {string} action - Authentication action (login, register, logout)
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @param {Object} meta - Additional metadata
   */
  auth(action, userId, email, meta = {}) {
    this.info(`Auth: ${action}`, {
      userId,
      email,
      action,
      timestamp: new Date().toISOString(),
      ...meta
    });
  }

  /**
   * Log user profile events
   * @param {string} action - Profile action (create, update, delete)
   * @param {string} userId - User ID
   * @param {Object} meta - Additional metadata
   */
  profile(action, userId, meta = {}) {
    this.info(`Profile: ${action}`, {
      userId,
      action,
      timestamp: new Date().toISOString(),
      ...meta
    });
  }

  /**
   * Log matching events
   * @param {string} action - Matching action (create, accept, reject)
   * @param {string} userId - User ID who performed the action
   * @param {string} targetUserId - Target user ID
   * @param {Object} meta - Additional metadata
   */
  matching(action, userId, targetUserId, meta = {}) {
    this.info(`Matching: ${action}`, {
      userId,
      targetUserId,
      action,
      timestamp: new Date().toISOString(),
      ...meta
    });
  }

  /**
   * Log group events
   * @param {string} action - Group action (create, join, leave, delete)
   * @param {string} userId - User ID who performed the action
   * @param {string} groupId - Group ID
   * @param {Object} meta - Additional metadata
   */
  group(action, userId, groupId, meta = {}) {
    this.info(`Group: ${action}`, {
      userId,
      groupId,
      action,
      timestamp: new Date().toISOString(),
      ...meta
    });
  }

  /**
   * Log messaging events
   * @param {string} action - Message action (send, receive, delete)
   * @param {string} userId - User ID who performed the action
   * @param {string} recipientId - Recipient ID (user or group)
   * @param {Object} meta - Additional metadata
   */
  message(action, userId, recipientId, meta = {}) {
    this.info(`Message: ${action}`, {
      userId,
      recipientId,
      action,
      timestamp: new Date().toISOString(),
      ...meta
    });
  }

  /**
   * Log security events
   * @param {string} event - Security event type
   * @param {string} userId - User ID (if applicable)
   * @param {Object} meta - Additional metadata
   */
  security(event, userId = null, meta = {}) {
    this.warn(`Security: ${event}`, {
      userId,
      event,
      timestamp: new Date().toISOString(),
      ...meta
    });
  }

  /**
   * Log performance metrics
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   * @param {Object} meta - Additional metadata
   */
  performance(operation, duration, meta = {}) {
    this.debug(`Performance: ${operation}`, {
      operation,
      duration,
      timestamp: new Date().toISOString(),
      ...meta
    });
  }

  /**
   * Log API requests
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {number} duration - Request duration in milliseconds
   */
  apiRequest(req, res, duration) {
    const meta = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: req.user?.userId || 'anonymous',
    };

    // Add request body for non-GET requests (excluding sensitive data)
    if (req.method !== 'GET' && req.body) {
      const sanitizedBody = { ...req.body };
      delete sanitizedBody.password;
      delete sanitizedBody.confirmPassword;
      delete sanitizedBody.currentPassword;
      meta.body = sanitizedBody;
    }

    this.http(`${req.method} ${req.originalUrl} - ${res.statusCode}`, meta);
  }

  /**
   * Log middleware errors
   * @param {Error} error - Error object
   * @param {Object} req - Express request object
   * @param {string} middleware - Middleware name
   */
  middlewareError(error, req, middleware) {
    this.error(`Middleware error in ${middleware}`, error, {
      method: req.method,
      url: req.originalUrl,
      userId: req.user?.userId || 'anonymous',
      middleware,
    });
  }

  /**
   * Log database operations
   * @param {string} operation - Database operation (create, read, update, delete)
   * @param {string} collection - Database collection/model name
   * @param {Object} meta - Additional metadata
   */
  database(operation, collection, meta = {}) {
    this.debug(`Database: ${operation} ${collection}`, {
      operation,
      collection,
      timestamp: new Date().toISOString(),
      ...meta
    });
  }

  /**
   * Create a child logger with default metadata
   * @param {Object} defaultMeta - Default metadata to include in all logs
   * @returns {Object} Child logger instance
   */
  child(defaultMeta) {
    return this.winston.child(defaultMeta);
  }

  /**
   * Stream interface for Morgan HTTP logger
   */
  get stream() {
    return {
      write: (message) => {
        this.http(message.trim());
      }
    };
  }
}

// Create singleton instance
const appLogger = new Logger();

module.exports = appLogger;