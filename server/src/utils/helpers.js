const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const logger = require('./logger');

// Date and time helpers
const dateHelpers = {
  // Get current timestamp
  now: () => new Date(),
  
  // Format date to readable string
  formatDate: (date, format = 'YYYY-MM-DD') => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  },
  
  // Get time difference in human readable format
  getTimeAgo: (date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    
    if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
    if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
    if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  },
  
  // Check if date is within business hours
  isBusinessHours: (date, timezone = 'UTC') => {
    const hour = new Date(date).getHours();
    return hour >= 9 && hour <= 17; // 9 AM to 5 PM
  },
  
  // Add days to date
  addDays: (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  },
  
  // Get start and end of day
  getStartOfDay: (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
  },
  
  getEndOfDay: (date) => {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
  }
};

// String manipulation helpers
const stringHelpers = {
  // Generate random string
  generateRandomString: (length = 10, includeNumbers = true, includeSymbols = false) => {
    let chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeNumbers) chars += '0123456789';
    if (includeSymbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  
  // Generate secure random token
  generateSecureToken: (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
  },
  
  // Slugify string for URLs
  slugify: (text) => {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  },
  
  // Capitalize first letter
  capitalize: (str) => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },
  
  // Title case
  titleCase: (str) => {
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  },
  
  // Truncate text with ellipsis
  truncate: (text, maxLength = 100, suffix = '...') => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
  },
  
  // Extract initials from name
  getInitials: (name) => {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .substring(0, 3);
  },
  
  // Mask sensitive data
  maskEmail: (email) => {
    const [username, domain] = email.split('@');
    const maskedUsername = username.charAt(0) + '*'.repeat(username.length - 2) + username.slice(-1);
    return `${maskedUsername}@${domain}`;
  },
  
  // Clean and validate text input
  sanitizeText: (text) => {
    return text
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/\s+/g, ' '); // Normalize whitespace
  }
};

// Array and object helpers
const dataHelpers = {
  // Deep clone object
  deepClone: (obj) => {
    return JSON.parse(JSON.stringify(obj));
  },
  
  // Check if object is empty
  isEmpty: (obj) => {
    if (obj == null) return true;
    if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
    return Object.keys(obj).length === 0;
  },
  
  // Remove duplicates from array
  removeDuplicates: (arr, key = null) => {
    if (!key) return [...new Set(arr)];
    return arr.filter((item, index, self) => 
      index === self.findIndex(t => t[key] === item[key])
    );
  },
  
  // Group array by property
  groupBy: (arr, key) => {
    return arr.reduce((groups, item) => {
      const group = item[key];
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
      return groups;
    }, {});
  },
  
  // Chunk array into smaller arrays
  chunk: (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  },
  
  // Flatten nested array
  flatten: (arr) => {
    return arr.reduce((flat, item) => 
      flat.concat(Array.isArray(item) ? dataHelpers.flatten(item) : item), []
    );
  },
  
  // Pick specific properties from object
  pick: (obj, keys) => {
    const picked = {};
    keys.forEach(key => {
      if (obj.hasOwnProperty(key)) {
        picked[key] = obj[key];
      }
    });
    return picked;
  },
  
  // Omit specific properties from object
  omit: (obj, keys) => {
    const omitted = { ...obj };
    keys.forEach(key => delete omitted[key]);
    return omitted;
  },
  
  // Sort array of objects by property
  sortBy: (arr, key, direction = 'asc') => {
    return arr.sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];
      
      if (direction === 'desc') {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    });
  }
};

// Validation helpers
const validationHelpers = {
  // Check if valid email
  isValidEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },
  
  // Check if valid URL
  isValidUrl: (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },
  
  // Check if valid MongoDB ObjectId
  isValidObjectId: (id) => {
    return mongoose.Types.ObjectId.isValid(id);
  },
  
  // Check if valid phone number (basic)
  isValidPhone: (phone) => {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  },
  
  // Check if string contains only alphanumeric characters
  isAlphanumeric: (str) => {
    return /^[a-zA-Z0-9]+$/.test(str);
  },
  
  // Check if valid password strength
  checkPasswordStrength: (password) => {
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    
    const score = Object.values(checks).filter(Boolean).length;
    let strength = 'weak';
    
    if (score >= 4) strength = 'strong';
    else if (score >= 3) strength = 'medium';
    
    return { checks, score, strength };
  }
};

// Encryption and hashing helpers
const securityHelpers = {
  // Hash password
  hashPassword: async (password, saltRounds = 12) => {
    try {
      return await bcrypt.hash(password, saltRounds);
    } catch (error) {
      logger.error('Password hashing failed:', error);
      throw new Error('Password hashing failed');
    }
  },
  
  // Compare password with hash
  comparePassword: async (password, hash) => {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Password comparison failed:', error);
      return false;
    }
  },
  
  // Generate hash for data integrity
  generateHash: (data, algorithm = 'sha256') => {
    return crypto
      .createHash(algorithm)
      .update(data)
      .digest('hex');
  },
  
  // Generate HMAC for secure signatures
  generateHMAC: (data, secret, algorithm = 'sha256') => {
    return crypto
      .createHmac(algorithm, secret)
      .update(data)
      .digest('hex');
  },
  
  // Encrypt sensitive data
  encrypt: (text, secretKey) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', secretKey);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  },
  
  // Decrypt sensitive data
  decrypt: (encryptedText, secretKey) => {
    try {
      const [ivHex, encrypted] = encryptedText.split(':');
      const decipher = crypto.createDecipher('aes-256-cbc', secretKey);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Decryption failed');
    }
  }
};

// API response helpers
const responseHelpers = {
  // Success response
  success: (res, data = null, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  },
  
  // Error response
  error: (res, message = 'An error occurred', statusCode = 500, details = null) => {
    return res.status(statusCode).json({
      success: false,
      error: message,
      details,
      timestamp: new Date().toISOString()
    });
  },
  
  // Paginated response
  paginated: (res, data, pagination, message = 'Success') => {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        pages: Math.ceil(pagination.total / pagination.limit),
        hasNext: pagination.page * pagination.limit < pagination.total,
        hasPrev: pagination.page > 1
      },
      timestamp: new Date().toISOString()
    });
  },
  
  // Not found response
  notFound: (res, resource = 'Resource') => {
    return res.status(404).json({
      success: false,
      error: `${resource} not found`,
      timestamp: new Date().toISOString()
    });
  },
  
  // Unauthorized response
  unauthorized: (res, message = 'Unauthorized access') => {
    return res.status(401).json({
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    });
  },
  
  // Forbidden response
  forbidden: (res, message = 'Access forbidden') => {
    return res.status(403).json({
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    });
  },
  
  // Validation error response
  validationError: (res, errors) => {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors,
      timestamp: new Date().toISOString()
    });
  }
};

// File and upload helpers
const fileHelpers = {
  // Get file extension
  getFileExtension: (filename) => {
    return filename.split('.').pop().toLowerCase();
  },
  
  // Check if file is image
  isImageFile: (filename) => {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    return imageExtensions.includes(fileHelpers.getFileExtension(filename));
  },
  
  // Check if file is document
  isDocumentFile: (filename) => {
    const docExtensions = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'];
    return docExtensions.includes(fileHelpers.getFileExtension(filename));
  },
  
  // Format file size
  formatFileSize: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },
  
  // Generate unique filename
  generateUniqueFilename: (originalName) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const extension = fileHelpers.getFileExtension(originalName);
    return `${timestamp}_${random}.${extension}`;
  }
};

// Math and calculation helpers
const mathHelpers = {
  // Calculate percentage
  percentage: (value, total) => {
    return total === 0 ? 0 : Math.round((value / total) * 100);
  },
  
  // Calculate average
  average: (numbers) => {
    return numbers.length === 0 ? 0 : numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  },
  
  // Calculate distance between two coordinates (Haversine formula)
  calculateDistance: (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },
  
  // Round to decimal places
  roundTo: (number, decimals = 2) => {
    return Math.round((number + Number.EPSILON) * Math.pow(10, decimals)) / Math.pow(10, decimals);
  },
  
  // Clamp number between min and max
  clamp: (number, min, max) => {
    return Math.min(Math.max(number, min), max);
  }
};

// Async helpers
const asyncHelpers = {
  // Sleep function
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Retry function with exponential backoff
  retry: async (fn, maxAttempts = 3, delay = 1000) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        
        const backoffDelay = delay * Math.pow(2, attempt - 1);
        logger.warn(`Attempt ${attempt} failed, retrying in ${backoffDelay}ms:`, error.message);
        await asyncHelpers.sleep(backoffDelay);
      }
    }
  },
  
  // Timeout wrapper
  withTimeout: (promise, timeoutMs) => {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
    );
    return Promise.race([promise, timeout]);
  }
};

module.exports = {
  dateHelpers,
  stringHelpers,
  dataHelpers,
  validationHelpers,
  securityHelpers,
  responseHelpers,
  fileHelpers,
  mathHelpers,
  asyncHelpers
};