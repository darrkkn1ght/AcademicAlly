const { body, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Registration validation rules
const validateRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number and one special character'),
  
  body('university')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('University name must be between 2 and 100 characters'),
  
  body('year')
    .isIn(['1', '2', '3', '4', '5', 'graduate', 'postgraduate'])
    .withMessage('Please select a valid academic year'),
  
  body('major')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Major must be between 2 and 100 characters'),
  
  handleValidationErrors
];

// Login validation rules
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  handleValidationErrors
];

// Profile update validation rules
const validateProfileUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  
  body('university')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('University name must be between 2 and 100 characters'),
  
  body('year')
    .optional()
    .isIn(['1', '2', '3', '4', '5', 'graduate', 'postgraduate'])
    .withMessage('Please select a valid academic year'),
  
  body('major')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Major must be between 2 and 100 characters'),
  
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters'),
  
  handleValidationErrors
];

// Group creation validation rules
const validateGroupCreation = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Group name must be between 3 and 100 characters'),
  
  body('description')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Description must be between 10 and 500 characters'),
  
  body('course')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Course name must be between 2 and 100 characters'),
  
  body('maxMembers')
    .isInt({ min: 2, max: 50 })
    .withMessage('Maximum members must be between 2 and 50'),
  
  body('meetingType')
    .isIn(['online', 'in-person', 'hybrid'])
    .withMessage('Meeting type must be online, in-person, or hybrid'),
  
  handleValidationErrors
];

// Message validation rules
const validateMessage = [
  body('content')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message must be between 1 and 2000 characters'),
  
  handleValidationErrors
];

// Password update validation
const validatePasswordUpdate = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number and one special character'),
  
  handleValidationErrors
];

// Export handleValidationErrors as default for generic validation middleware usage
module.exports = {
  validateRegistration,
  validateLogin,
  validateProfileUpdate,
  validateGroupCreation,
  validateMessage,
  validatePasswordUpdate,
  handleValidationErrors,
  // For generic validation middleware usage
  validationMiddleware: handleValidationErrors
};