const Joi = require('joi');
const mongoose = require('mongoose');

// Custom validation helpers
const customValidators = {
  // Validate MongoDB ObjectId
  objectId: (value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return helpers.error('any.invalid');
    }
    return value;
  },
  
  // Validate university email format
  universityEmail: (value, helpers) => {
    const universityDomains = [
      '.edu', '.ac.uk', '.edu.au', '.edu.ca', '.ac.in', '.ac.za',
      '.edu.sg', '.edu.my', '.ac.nz', '.edu.hk', '.ac.jp'
    ];
    
    const hasUniversityDomain = universityDomains.some(domain => 
      value.toLowerCase().includes(domain)
    );
    
    if (!hasUniversityDomain) {
      return helpers.error('string.universityEmail');
    }
    return value;
  },
  
  // Validate password strength
  strongPassword: (value, helpers) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumbers = /\d/.test(value);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);
    
    if (value.length < minLength) {
      return helpers.error('string.passwordTooShort');
    }
    if (!hasUpperCase) {
      return helpers.error('string.passwordNeedsUppercase');
    }
    if (!hasLowerCase) {
      return helpers.error('string.passwordNeedsLowercase');
    }
    if (!hasNumbers) {
      return helpers.error('string.passwordNeedsNumber');
    }
    if (!hasSpecialChar) {
      return helpers.error('string.passwordNeedsSpecialChar');
    }
    
    return value;
  },
  
  // Validate course code format (e.g., CS101, MATH201)
  courseCode: (value, helpers) => {
    const courseCodePattern = /^[A-Z]{2,4}\d{3,4}[A-Z]?$/i;
    if (!courseCodePattern.test(value)) {
      return helpers.error('string.invalidCourseCode');
    }
    return value.toUpperCase();
  }
};

// Extend Joi with custom validators
const JoiExtended = Joi.extend(
  {
    type: 'string',
    base: Joi.string(),
    messages: {
      'string.universityEmail': 'Must be a valid university email address (.edu, .ac.uk, etc.)',
      'string.passwordTooShort': 'Password must be at least 8 characters long',
      'string.passwordNeedsUppercase': 'Password must contain at least one uppercase letter',
      'string.passwordNeedsLowercase': 'Password must contain at least one lowercase letter',
      'string.passwordNeedsNumber': 'Password must contain at least one number',
      'string.passwordNeedsSpecialChar': 'Password must contain at least one special character',
      'string.invalidCourseCode': 'Course code must be in format like CS101, MATH201'
    },
    rules: {
      universityEmail: {
        method: customValidators.universityEmail
      },
      strongPassword: {
        method: customValidators.strongPassword
      },
      courseCode: {
        method: customValidators.courseCode
      }
    }
  },
  {
    type: 'objectId',
    base: Joi.string(),
    messages: {
      'any.invalid': 'Must be a valid ObjectId'
    },
    validate: customValidators.objectId
  }
);

// Common validation schemas
const commonSchemas = {
  // Pagination
  pagination: JoiExtended.object({
    page: JoiExtended.number().integer().min(1).default(1),
    limit: JoiExtended.number().integer().min(1).max(100).default(20),
    sort: JoiExtended.string().valid('createdAt', '-createdAt', 'name', '-name', 'updatedAt', '-updatedAt').default('-createdAt')
  }),
  
  // MongoDB ObjectId
  objectId: JoiExtended.objectId().required(),
  
  // Email
  email: JoiExtended.string().email().lowercase().trim().required(),
  
  // University email
  universityEmail: JoiExtended.string().email().universityEmail().lowercase().trim().required(),
  
  // Password
  password: JoiExtended.string().strongPassword().required(),
  
  // Course code
  courseCode: JoiExtended.string().courseCode().required()
};

// User validation schemas
const userSchemas = {
  register: JoiExtended.object({
    name: JoiExtended.string().min(2).max(50).trim().required(),
    email: commonSchemas.universityEmail,
    password: commonSchemas.password,
    university: JoiExtended.string().min(2).max(100).trim().required(),
    year: JoiExtended.number().integer().min(1).max(8).required(),
    major: JoiExtended.string().min(2).max(50).trim().required(),
    courses: JoiExtended.array().items(
      JoiExtended.object({
        code: commonSchemas.courseCode,
        name: JoiExtended.string().min(2).max(100).trim().required(),
        credits: JoiExtended.number().min(1).max(6).default(3)
      })
    ).min(1).max(20).required()
  }),
  
  login: JoiExtended.object({
    email: commonSchemas.email,
    password: JoiExtended.string().required()
  }),
  
  updateProfile: JoiExtended.object({
    name: JoiExtended.string().min(2).max(50).trim(),
    university: JoiExtended.string().min(2).max(100).trim(),
    year: JoiExtended.number().integer().min(1).max(8),
    major: JoiExtended.string().min(2).max(50).trim(),
    bio: JoiExtended.string().max(500).trim(),
    location: JoiExtended.object({
      city: JoiExtended.string().max(50).trim(),
      state: JoiExtended.string().max(50).trim(),
      country: JoiExtended.string().max(50).trim(),
      timezone: JoiExtended.string().max(50).trim()
    }),
    studyPreferences: JoiExtended.object({
      studyTimes: JoiExtended.array().items(
        JoiExtended.string().valid('early_morning', 'morning', 'afternoon', 'evening', 'night', 'late_night')
      ).min(1).max(6),
      environment: JoiExtended.string().valid('quiet', 'moderate', 'social'),
      studyStyle: JoiExtended.string().valid('visual', 'auditory', 'kinesthetic', 'reading'),
      groupSize: JoiExtended.string().valid('one_on_one', 'small_group', 'large_group', 'any'),
      meetingType: JoiExtended.string().valid('in_person', 'online', 'hybrid')
    }),
    availability: JoiExtended.object({
      monday: JoiExtended.array().items(JoiExtended.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)),
      tuesday: JoiExtended.array().items(JoiExtended.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)),
      wednesday: JoiExtended.array().items(JoiExtended.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)),
      thursday: JoiExtended.array().items(JoiExtended.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)),
      friday: JoiExtended.array().items(JoiExtended.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)),
      saturday: JoiExtended.array().items(JoiExtended.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)),
      sunday: JoiExtended.array().items(JoiExtended.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/))
    })
  }),
  
  updateCourses: JoiExtended.object({
    courses: JoiExtended.array().items(
      JoiExtended.object({
        code: commonSchemas.courseCode,
        name: JoiExtended.string().min(2).max(100).trim().required(),
        credits: JoiExtended.number().min(1).max(6).default(3)
      })
    ).min(1).max(20).required()
  }),
  
  forgotPassword: JoiExtended.object({
    email: commonSchemas.email
  }),
  
  resetPassword: JoiExtended.object({
    token: JoiExtended.string().required(),
    password: commonSchemas.password
  }),
  
  changePassword: JoiExtended.object({
    currentPassword: JoiExtended.string().required(),
    newPassword: commonSchemas.password
  })
};

// Group validation schemas
const groupSchemas = {
  create: JoiExtended.object({
    name: JoiExtended.string().min(3).max(100).trim().required(),
    description: JoiExtended.string().min(10).max(500).trim().required(),
    course: JoiExtended.object({
      code: commonSchemas.courseCode,
      name: JoiExtended.string().min(2).max(100).trim().required()
    }).required(),
    maxMembers: JoiExtended.number().integer().min(2).max(20).default(6),
    meetingType: JoiExtended.string().valid('in_person', 'online', 'hybrid').required(),
    location: JoiExtended.object({
      address: JoiExtended.string().max(200).trim(),
      city: JoiExtended.string().max(50).trim(),
      building: JoiExtended.string().max(100).trim(),
      room: JoiExtended.string().max(50).trim(),
      onlineLink: JoiExtended.string().uri()
    }),
    schedule: JoiExtended.object({
      recurring: JoiExtended.boolean(),
      startDate: JoiExtended.date().min('now'),
      endDate: JoiExtended.date().min(JoiExtended.ref('startDate')),
      times: JoiExtended.array().items(
        JoiExtended.object({
          day: JoiExtended.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday').required(),
          startTime: JoiExtended.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
          endTime: JoiExtended.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required()
        })
      ).min(1)
    }),
    requirements: JoiExtended.object({
      minGPA: JoiExtended.number().min(0).max(4.0),
      yearLevel: JoiExtended.array().items(JoiExtended.number().integer().min(1).max(8)),
      prerequisites: JoiExtended.array().items(JoiExtended.string().max(100)),
      commitment: JoiExtended.string().valid('low', 'medium', 'high')
    }),
    tags: JoiExtended.array().items(JoiExtended.string().max(30).lowercase()).max(10)
  }),
  
  join: JoiExtended.object({
    groupId: commonSchemas.objectId,
    message: JoiExtended.string().max(200).trim() // Optional message when joining
  }),
  
  search: JoiExtended.object({
    query: JoiExtended.string().min(1).max(100).trim(),
    course: JoiExtended.string().courseCode(),
    meetingType: JoiExtended.string().valid('in_person', 'online', 'hybrid'),
    city: JoiExtended.string().max(50).trim(),
    maxMembers: JoiExtended.number().integer().min(2).max(20),
    tags: JoiExtended.array().items(JoiExtended.string().max(30).lowercase()).max(5),
    ...commonSchemas.pagination
  })
};

// Message validation schemas
const messageSchemas = {
  send: JoiExtended.object({
    recipient: commonSchemas.objectId.when('groupId', {
      is: JoiExtended.exist(),
      then: JoiExtended.forbidden(),
      otherwise: JoiExtended.required()
    }),
    groupId: commonSchemas.objectId.when('recipient', {
      is: JoiExtended.exist(),
      then: JoiExtended.forbidden(),
      otherwise: JoiExtended.required()
    }),
    content: JoiExtended.string().min(1).max(2000).trim().required(),
    messageType: JoiExtended.string().valid('text', 'file', 'image', 'link').default('text'),
    attachments: JoiExtended.array().items(
      JoiExtended.object({
        filename: JoiExtended.string().max(255).required(),
        url: JoiExtended.string().uri().required(),
        size: JoiExtended.number().integer().min(1).max(10485760), // 10MB max
        mimeType: JoiExtended.string().max(100)
      })
    ).max(5)
  }),
  
  edit: JoiExtended.object({
    messageId: commonSchemas.objectId,
    content: JoiExtended.string().min(1).max(2000).trim().required()
  }),
  
  delete: JoiExtended.object({
    messageId: commonSchemas.objectId
  }),
  
  getConversation: JoiExtended.object({
    recipientId: commonSchemas.objectId.when('groupId', {
      is: JoiExtended.exist(),
      then: JoiExtended.forbidden(),
      otherwise: JoiExtended.required()
    }),
    groupId: commonSchemas.objectId.when('recipientId', {
      is: JoiExtended.exist(),
      then: JoiExtended.forbidden(),
      otherwise: JoiExtended.required()
    }),
    ...commonSchemas.pagination
  }),
  
  markAsRead: JoiExtended.object({
    messageIds: JoiExtended.array().items(commonSchemas.objectId).min(1).max(50).required()
  })
};

// Matching validation schemas
const matchingSchemas = {
  findPartners: JoiExtended.object({
    courses: JoiExtended.array().items(JoiExtended.string().courseCode()).min(1).max(10),
    studyPreferences: JoiExtended.object({
      studyTimes: JoiExtended.array().items(
        JoiExtended.string().valid('early_morning', 'morning', 'afternoon', 'evening', 'night', 'late_night')
      ).min(1),
      environment: JoiExtended.string().valid('quiet', 'moderate', 'social'),
      groupSize: JoiExtended.string().valid('one_on_one', 'small_group', 'large_group', 'any'),
      meetingType: JoiExtended.string().valid('in_person', 'online', 'hybrid')
    }),
    location: JoiExtended.object({
      city: JoiExtended.string().max(50).trim(),
      maxDistance: JoiExtended.number().min(1).max(100) // km
    }),
    yearLevel: JoiExtended.array().items(JoiExtended.number().integer().min(1).max(8)).max(8),
    minCompatibilityScore: JoiExtended.number().min(0).max(1).default(0.3),
    ...commonSchemas.pagination
  }),
  
  respondToMatch: JoiExtended.object({
    matchId: commonSchemas.objectId,
    action: JoiExtended.string().valid('accept', 'decline').required(),
    message: JoiExtended.string().max(200).trim()
  })
};

// Report validation schemas
const reportSchemas = {
  create: JoiExtended.object({
    reportType: JoiExtended.string().valid('user', 'message', 'group').required(),
    reportedUser: commonSchemas.objectId.when('reportType', {
      is: 'user',
      then: JoiExtended.required(),
      otherwise: JoiExtended.forbidden()
    }),
    reportedMessage: commonSchemas.objectId.when('reportType', {
      is: 'message',
      then: JoiExtended.required(),
      otherwise: JoiExtended.forbidden()
    }),
    reportedGroup: commonSchemas.objectId.when('reportType', {
      is: 'group',
      then: JoiExtended.required(),
      otherwise: JoiExtended.forbidden()
    }),
    category: JoiExtended.string().valid(
      'spam', 'harassment', 'inappropriate_content', 'fake_profile',
      'academic_dishonesty', 'bullying', 'hate_speech', 'impersonation',
      'privacy_violation', 'other'
    ).required(),
    reason: JoiExtended.string().min(10).max(500).trim().required(),
    evidence: JoiExtended.array().items(JoiExtended.string().uri()).max(5)
  }),
  
  update: JoiExtended.object({
    reportId: commonSchemas.objectId,
    status: JoiExtended.string().valid('pending', 'investigating', 'resolved', 'dismissed'),
    priority: JoiExtended.string().valid('low', 'medium', 'high', 'urgent'),
    assignedModerator: commonSchemas.objectId,
    moderatorNotes: JoiExtended.string().max(1000).trim(),
    resolution: JoiExtended.string().max(500).trim(),
    actionTaken: JoiExtended.string().valid(
      'none', 'warning_issued', 'content_removed', 'user_suspended',
      'user_banned', 'group_disbanded', 'escalated'
    )
  }),
  
  search: JoiExtended.object({
    status: JoiExtended.string().valid('pending', 'investigating', 'resolved', 'dismissed'),
    category: JoiExtended.string().valid(
      'spam', 'harassment', 'inappropriate_content', 'fake_profile',
      'academic_dishonesty', 'bullying', 'hate_speech', 'impersonation',
      'privacy_violation', 'other'
    ),
    reportType: JoiExtended.string().valid('user', 'message', 'group'),
    priority: JoiExtended.string().valid('low', 'medium', 'high', 'urgent'),
    assignedModerator: commonSchemas.objectId,
    dateFrom: JoiExtended.date(),
    dateTo: JoiExtended.date().min(JoiExtended.ref('dateFrom')),
    ...commonSchemas.pagination
  })
};

// File upload validation schemas
const uploadSchemas = {
  profilePicture: JoiExtended.object({
    file: JoiExtended.object({
      mimetype: JoiExtended.string().valid('image/jpeg', 'image/png', 'image/jpg', 'image/webp').required(),
      size: JoiExtended.number().max(5242880).required() // 5MB max
    }).unknown(true).required()
  }),
  
  messageAttachment: JoiExtended.object({
    file: JoiExtended.object({
      mimetype: JoiExtended.string().pattern(/^(image\/|application\/pdf|text\/|application\/msword|application\/vnd\.openxmlformats)/).required(),
      size: JoiExtended.number().max(10485760).required() // 10MB max
    }).unknown(true).required()
  })
};

// Search validation schemas
const searchSchemas = {
  users: JoiExtended.object({
    query: JoiExtended.string().min(1).max(100).trim(),
    university: JoiExtended.string().max(100).trim(),
    major: JoiExtended.string().max(50).trim(),
    year: JoiExtended.number().integer().min(1).max(8),
    courses: JoiExtended.array().items(JoiExtended.string().courseCode()).max(10),
    city: JoiExtended.string().max(50).trim(),
    ...commonSchemas.pagination
  }),
  
  groups: groupSchemas.search,
  
  global: JoiExtended.object({
    query: JoiExtended.string().min(1).max(100).trim().required(),
    type: JoiExtended.string().valid('users', 'groups', 'all').default('all'),
    ...commonSchemas.pagination
  })
};

// Validation middleware factory
const createValidationMiddleware = (schema, source = 'body') => {
  return (req, res, next) => {
    const dataToValidate = req[source];
    
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }
    
    // Replace the request data with validated and sanitized data
    req[source] = value;
    next();
  };
};

// Utility functions
const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return input.trim().replace(/[<>]/g, '');
  }
  if (typeof input === 'object' && input !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  return input;
};

const validateObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validateUniversityEmail = (email) => {
  if (!validateEmail(email)) return false;
  
  const universityDomains = [
    '.edu', '.ac.uk', '.edu.au', '.edu.ca', '.ac.in', '.ac.za',
    '.edu.sg', '.edu.my', '.ac.nz', '.edu.hk', '.ac.jp'
  ];
  
  return universityDomains.some(domain => 
    email.toLowerCase().includes(domain)
  );
};

module.exports = {
  // Validation schemas
  userSchemas,
  groupSchemas,
  messageSchemas,
  matchingSchemas,
  reportSchemas,
  uploadSchemas,
  searchSchemas,
  commonSchemas,
  
  // Middleware factory
  createValidationMiddleware,
  
  // Utility functions
  sanitizeInput,
  validateObjectId,
  validateEmail,
  validateUniversityEmail,
  
  // Extended Joi instance
  JoiExtended,
  
  // Custom validators for reuse
  customValidators
};