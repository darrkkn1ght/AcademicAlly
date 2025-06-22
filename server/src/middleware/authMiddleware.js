const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // Check for token in cookies
    else if (req.cookies.token) {
      token = req.cookies.token;
    }

    // Make sure token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'No user found with this token'
        });
      }

      // Check if user account is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User account is deactivated'
        });
      }

      // Update last active timestamp
      user.lastActive = new Date();
      await user.save({ validateBeforeSave: false });

      req.user = user;
      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication'
    });
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};

// Optional auth - doesn't require token but adds user if available
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // Check for token in cookies
    else if (req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from token
        const user = await User.findById(decoded.id);

        if (user && user.isActive) {
          // Update last active timestamp
          user.lastActive = new Date();
          await user.save({ validateBeforeSave: false });
          req.user = user;
        }
      } catch (error) {
        // Token invalid, but continue without user
        console.log('Optional auth token invalid:', error.message);
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next();
  }
};

// Check if user owns resource or is admin
const ownershipOrAdmin = (resourceUserField = 'user') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Not authorized to access this route'
        });
      }

      // Admin can access anything (if you implement admin role)
      if (req.user.role === 'admin') {
        return next();
      }

      // Check ownership based on the resource
      const resourceId = req.params.id;
      let resource;

      // Determine which model to check based on the route
      if (req.baseUrl.includes('/groups')) {
        const Group = require('../models/Group');
        resource = await Group.findById(resourceId);
        
        if (!resource) {
          return res.status(404).json({
            success: false,
            message: 'Resource not found'
          });
        }

        // Check if user is creator or admin of the group
        const isCreator = resource.creator.toString() === req.user._id.toString();
        const isAdmin = resource.admins.some(admin => admin.toString() === req.user._id.toString());
        
        if (!isCreator && !isAdmin) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to access this resource'
          });
        }
      } else if (req.baseUrl.includes('/users')) {
        // For user resources, check if it's the same user
        if (resourceId !== req.user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to access this resource'
          });
        }
      }

      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error during authorization check'
      });
    }
  };
};

// Rate limiting middleware for auth routes
const authRateLimit = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
  const attempts = new Map();

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const email = req.body.email;
    const key = email ? `${ip}-${email}` : ip;

    const now = Date.now();
    const userAttempts = attempts.get(key) || { count: 0, resetTime: now + windowMs };

    // Reset if window has passed
    if (now > userAttempts.resetTime) {
      userAttempts.count = 0;
      userAttempts.resetTime = now + windowMs;
    }

    // Check if limit exceeded
    if (userAttempts.count >= maxAttempts) {
      const resetTime = Math.ceil((userAttempts.resetTime - now) / 1000 / 60);
      return res.status(429).json({
        success: false,
        message: `Too many attempts. Try again in ${resetTime} minutes.`
      });
    }

    // Increment attempts
    userAttempts.count += 1;
    attempts.set(key, userAttempts);

    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      for (const [key, value] of attempts.entries()) {
        if (now > value.resetTime) {
          attempts.delete(key);
        }
      }
    }

    next();
  };
};

// Middleware to check if email is verified for certain actions
const requireEmailVerification = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  if (!req.user.emailVerified) {
    return res.status(403).json({
      success: false,
      message: 'Please verify your email before accessing this feature'
    });
  }

  next();
};

// Middleware to check minimum reputation for certain actions
const requireMinReputation = (minReputation = 3.0) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    if (req.user.reputation < minReputation) {
      return res.status(403).json({
        success: false,
        message: `Minimum reputation of ${minReputation} required for this action`
      });
    }

    next();
  };
};

module.exports = {
  protect,
  authorize,
  optionalAuth,
  ownershipOrAdmin,
  authRateLimit,
  requireEmailVerification,
  requireMinReputation
};