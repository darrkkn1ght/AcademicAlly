// Application-wide constants for AcademicAlly

// Application Information
const APP_INFO = {
  NAME: 'AcademicAlly',
  VERSION: '1.0.0',
  DESCRIPTION: 'University Study Partner & Group Matching Platform',
  AUTHOR: 'AcademicAlly Team',
  SUPPORT_EMAIL: 'support@academicAlly.com'
};

// Environment Constants
const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
  TEST: 'test'
};

// HTTP Status Codes
const HTTP_STATUS = {
  // Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  
  // Client Errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  TOO_MANY_REQUESTS: 429,
  
  // Server Errors
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

// User Related Constants
const USER_CONSTANTS = {
  // Roles
  ROLES: {
    STUDENT: 'student',
    MODERATOR: 'moderator',
    ADMIN: 'admin',
    SUPER_ADMIN: 'super_admin'
  },
  
  // Account Status
  STATUS: {
    ACTIVE: 'active',
    PENDING: 'pending',
    SUSPENDED: 'suspended',
    BANNED: 'banned',
    DEACTIVATED: 'deactivated'
  },
  
  // Year Levels
  YEAR_LEVELS: [1, 2, 3, 4, 5, 6, 7, 8], // Graduate levels included
  
  // Study Preferences
  STUDY_TIMES: [
    'early_morning',   // 5 AM - 8 AM
    'morning',         // 8 AM - 12 PM
    'afternoon',       // 12 PM - 5 PM
    'evening',         // 5 PM - 8 PM
    'night',           // 8 PM - 11 PM
    'late_night'       // 11 PM - 5 AM
  ],
  
  STUDY_ENVIRONMENTS: [
    'quiet',      // Libraries, quiet study rooms
    'moderate',   // Cafes, common areas
    'social'      // Group study rooms, collaborative spaces
  ],
  
  STUDY_STYLES: [
    'visual',     // Diagrams, charts, mind maps
    'auditory',   // Discussions, lectures, verbal explanations
    'kinesthetic', // Hands-on, practice problems
    'reading'     // Text-based, note-taking
  ],
  
  GROUP_SIZES: [
    'one_on_one',   // 1-on-1 study sessions
    'small_group',  // 2-4 people
    'large_group',  // 5+ people
    'any'           // No preference
  ],
  
  MEETING_TYPES: [
    'in_person',  // Physical meetups
    'online',     // Virtual meetings
    'hybrid'      // Both options available
  ],
  
  // Reputation System
  REPUTATION: {
    MIN: 0,
    MAX: 5,
    DEFAULT: 3.0,
    DECIMAL_PLACES: 1
  },
  
  // Profile Constraints
  CONSTRAINTS: {
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 50,
    BIO_MAX_LENGTH: 500,
    MAX_COURSES: 20,
    MIN_COURSES: 1
  }
};

// Group Related Constants
const GROUP_CONSTANTS = {
  // Group Status
  STATUS: {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    ARCHIVED: 'archived',
    SUSPENDED: 'suspended'
  },
  
  // Group Types
  TYPES: {
    STUDY_GROUP: 'study_group',
    PROJECT_TEAM: 'project_team',
    EXAM_PREP: 'exam_prep',
    HOMEWORK_HELP: 'homework_help',
    GENERAL: 'general'
  },
  
  // Member Roles
  MEMBER_ROLES: {
    CREATOR: 'creator',
    ADMIN: 'admin',
    MEMBER: 'member',
    PENDING: 'pending',
    INVITED: 'invited'
  },
  
  // Meeting Frequencies
  MEETING_FREQUENCIES: [
    'daily',
    'weekly',
    'bi_weekly',
    'monthly',
    'as_needed',
    'one_time'
  ],
  
  // Commitment Levels
  COMMITMENT_LEVELS: [
    'low',      // Casual, flexible
    'medium',   // Regular meetings
    'high'      // Intensive, strict schedule
  ],
  
  // Group Constraints
  CONSTRAINTS: {
    NAME_MIN_LENGTH: 3,
    NAME_MAX_LENGTH: 100,
    DESCRIPTION_MIN_LENGTH: 10,
    DESCRIPTION_MAX_LENGTH: 500,
    MIN_MEMBERS: 2,
    MAX_MEMBERS: 20,
    DEFAULT_MAX_MEMBERS: 6,
    MAX_TAGS: 10,
    TAG_MAX_LENGTH: 30
  }
};

// Message Related Constants
const MESSAGE_CONSTANTS = {
  // Message Types
  TYPES: {
    TEXT: 'text',
    FILE: 'file',
    IMAGE: 'image',
    LINK: 'link',
    SYSTEM: 'system',
    ANNOUNCEMENT: 'announcement'
  },
  
  // Message Status
  STATUS: {
    SENT: 'sent',
    DELIVERED: 'delivered',
    READ: 'read',
    FAILED: 'failed'
  },
  
  // System Message Types
  SYSTEM_TYPES: {
    USER_JOINED: 'user_joined',
    USER_LEFT: 'user_left',
    USER_ADDED: 'user_added',
    USER_REMOVED: 'user_removed',
    GROUP_CREATED: 'group_created',
    GROUP_UPDATED: 'group_updated',
    ROLE_CHANGED: 'role_changed'
  },
  
  // Message Constraints
  CONSTRAINTS: {
    CONTENT_MAX_LENGTH: 2000,
    MAX_ATTACHMENTS: 5,
    MAX_FILE_SIZE: 10485760, // 10MB in bytes
    EDIT_TIME_LIMIT: 900000  // 15 minutes in milliseconds
  }
};

// File Upload Constants
const FILE_CONSTANTS = {
  // Allowed MIME Types
  ALLOWED_IMAGE_TYPES: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
  ],
  
  ALLOWED_DOCUMENT_TYPES: [
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ],
  
  // File Size Limits (in bytes)
  SIZE_LIMITS: {
    PROFILE_PICTURE: 5242880,    // 5MB
    MESSAGE_ATTACHMENT: 10485760, // 10MB
    DOCUMENT: 20971520           // 20MB
  },
  
  // Image Dimensions
  IMAGE_DIMENSIONS: {
    PROFILE_PICTURE: {
      MAX_WIDTH: 1000,
      MAX_HEIGHT: 1000,
      THUMBNAIL_SIZE: 150
    }
  }
};

// Matching Algorithm Constants
const MATCHING_CONSTANTS = {
  // Compatibility Factors and Weights
  WEIGHTS: {
    COURSES: 0.4,           // 40% - Shared courses
    STUDY_PREFERENCES: 0.3, // 30% - Study preferences alignment
    AVAILABILITY: 0.2,      // 20% - Schedule compatibility
    LOCATION: 0.1          // 10% - Geographic proximity
  },
  
  // Minimum Compatibility Scores
  MIN_COMPATIBILITY: {
    PARTNER: 0.3,  // 30% minimum for study partners
    GROUP: 0.2     // 20% minimum for group suggestions
  },
  
  // Maximum Results
  MAX_RESULTS: {
    PARTNERS: 20,
    GROUPS: 30
  },
  
  // Location Matching
  LOCATION: {
    MAX_DISTANCE_KM: 50,     // Maximum distance for local matching
    CITY_BOOST_FACTOR: 1.2,  // Boost score for same city
    CAMPUS_BOOST_FACTOR: 1.5 // Boost score for same campus
  }
};

// Security Constants
const SECURITY_CONSTANTS = {
  // Password Requirements
  PASSWORD: {
    MIN_LENGTH: 8,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBERS: true,
    REQUIRE_SPECIAL_CHARS: true,
    BCRYPT_ROUNDS: 12
  },
  
  // JWT Configuration
  JWT: {
    ACCESS_TOKEN_EXPIRY: '15m',     // 15 minutes
    REFRESH_TOKEN_EXPIRY: '7d',     // 7 days
    RESET_TOKEN_EXPIRY: '1h',       // 1 hour
    VERIFY_TOKEN_EXPIRY: '24h'      // 24 hours
  },
  
  // Rate Limiting
  RATE_LIMITS: {
    GENERAL: { windowMs: 900000, max: 100 },        // 15 min, 100 requests
    AUTH: { windowMs: 900000, max: 5 },             // 15 min, 5 attempts
    REGISTER: { windowMs: 3600000, max: 3 },        // 1 hour, 3 attempts
    PASSWORD_RESET: { windowMs: 3600000, max: 3 },  // 1 hour, 3 attempts
    MESSAGES: { windowMs: 60000, max: 30 },         // 1 min, 30 messages
    UPLOADS: { windowMs: 3600000, max: 20 },        // 1 hour, 20 uploads
    REPORTS: { windowMs: 86400000
        , max: 5 }             // 24 hours, 5 reports
  },
  
  // Session Management
  SESSION: {
    MAX_CONCURRENT_SESSIONS: 5,
    CLEANUP_INTERVAL: 3600000,      // 1 hour
    IDLE_TIMEOUT: 1800000           // 30 minutes
  }
};

// Notification Constants
const NOTIFICATION_CONSTANTS = {
  // Notification Types
  TYPES: {
    MESSAGE: 'message',
    MATCH: 'match',
    GROUP_INVITE: 'group_invite',
    GROUP_UPDATE: 'group_update',
    SYSTEM: 'system',
    REMINDER: 'reminder',
    REPORT_UPDATE: 'report_update'
  },
  
  // Delivery Methods
  DELIVERY_METHODS: {
    IN_APP: 'in_app',
    EMAIL: 'email',
    PUSH: 'push'
  },
  
  // Priority Levels
  PRIORITY: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent'
  },
  
  // Notification Status
  STATUS: {
    PENDING: 'pending',
    SENT: 'sent',
    DELIVERED: 'delivered',
    READ: 'read',
    FAILED: 'failed'
  },
  
  // Batch Settings
  BATCH: {
    SIZE: 100,
    INTERVAL: 5000,                 // 5 seconds
    MAX_RETRIES: 3
  }
};

// Report and Moderation Constants
const MODERATION_CONSTANTS = {
  // Report Types
  REPORT_TYPES: {
    SPAM: 'spam',
    HARASSMENT: 'harassment',
    INAPPROPRIATE_CONTENT: 'inappropriate_content',
    FAKE_PROFILE: 'fake_profile',
    SCAM: 'scam',
    HATE_SPEECH: 'hate_speech',
    VIOLENCE: 'violence',
    OTHER: 'other'
  },
  
  // Report Status
  REPORT_STATUS: {
    PENDING: 'pending',
    UNDER_REVIEW: 'under_review',
    RESOLVED: 'resolved',
    DISMISSED: 'dismissed',
    ESCALATED: 'escalated'
  },
  
  // Actions
  ACTIONS: {
    NO_ACTION: 'no_action',
    WARNING: 'warning',
    TEMPORARY_SUSPENSION: 'temporary_suspension',
    PERMANENT_BAN: 'permanent_ban',
    CONTENT_REMOVAL: 'content_removal',
    PROFILE_RESTRICTION: 'profile_restriction'
  },
  
  // Auto-moderation thresholds
  AUTO_MOD: {
    SPAM_THRESHOLD: 3,              // 3 reports trigger auto-review
    HARASSMENT_THRESHOLD: 2,        // 2 reports trigger auto-review
    HATE_SPEECH_THRESHOLD: 1,       // 1 report triggers immediate review
    MAX_REPORTS_PER_USER_DAY: 5     // Maximum reports a user can make per day
  },
  
  // Suspension Durations (in milliseconds)
  SUSPENSION_DURATIONS: {
    SHORT: 86400000,                // 1 day
    MEDIUM: 604800000,              // 7 days
    LONG: 2592000000                // 30 days
  }
};

// Real-time/Socket Constants
const SOCKET_CONSTANTS = {
  // Socket Events
  EVENTS: {
    // Connection Events
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    RECONNECT: 'reconnect',
    ERROR: 'error',
    
    // Authentication Events
    AUTHENTICATE: 'authenticate',
    AUTHENTICATED: 'authenticated',
    AUTH_ERROR: 'auth_error',
    
    // User Events
    USER_ONLINE: 'user_online',
    USER_OFFLINE: 'user_offline',
    USER_TYPING: 'user_typing',
    USER_STOPPED_TYPING: 'user_stopped_typing',
    
    // Message Events
    SEND_MESSAGE: 'send_message',
    NEW_MESSAGE: 'new_message',
    MESSAGE_DELIVERED: 'message_delivered',
    MESSAGE_READ: 'message_read',
    MESSAGE_EDITED: 'message_edited',
    MESSAGE_DELETED: 'message_deleted',
    
    // Group Events
    JOIN_GROUP: 'join_group',
    LEAVE_GROUP: 'leave_group',
    GROUP_MESSAGE: 'group_message',
    GROUP_UPDATED: 'group_updated',
    USER_JOINED_GROUP: 'user_joined_group',
    USER_LEFT_GROUP: 'user_left_group',
    
    // Notification Events
    NEW_NOTIFICATION: 'new_notification',
    NOTIFICATION_READ: 'notification_read',
    
    // Matching Events
    NEW_MATCH: 'new_match',
    MATCH_UPDATED: 'match_updated'
  },
  
  // Room Types
  ROOMS: {
    USER: 'user_',                  // user_12345
    GROUP: 'group_',                // group_67890
    CONVERSATION: 'conversation_',   // conversation_abc123
    GLOBAL: 'global'
  },
  
  // Connection Settings
  CONNECTION: {
    PING_TIMEOUT: 60000,            // 60 seconds
    PING_INTERVAL: 25000,           // 25 seconds
    MAX_CONNECTIONS_PER_USER: 5,
    HEARTBEAT_INTERVAL: 30000       // 30 seconds
  },
  
  // Typing Indicator Settings
  TYPING: {
    TIMEOUT: 3000,                  // 3 seconds
    DEBOUNCE: 500                   // 500ms debounce
  }
};

// Email Constants
const EMAIL_CONSTANTS = {
  // Email Types
  TYPES: {
    WELCOME: 'welcome',
    EMAIL_VERIFICATION: 'email_verification',
    PASSWORD_RESET: 'password_reset',
    MATCH_NOTIFICATION: 'match_notification',
    GROUP_INVITATION: 'group_invitation',
    WEEKLY_DIGEST: 'weekly_digest',
    SECURITY_ALERT: 'security_alert',
    ACCOUNT_SUSPENSION: 'account_suspension'
  },
  
  // Email Templates
  TEMPLATES: {
    WELCOME: 'welcome-template',
    VERIFICATION: 'verification-template',
    RESET_PASSWORD: 'reset-password-template',
    MATCH_FOUND: 'match-found-template',
    GROUP_INVITE: 'group-invite-template',
    DIGEST: 'weekly-digest-template',
    SECURITY: 'security-alert-template',
    SUSPENSION: 'account-suspension-template'
  },
  
  // Sending Limits
  LIMITS: {
    VERIFICATION_RESEND_INTERVAL: 300000,     // 5 minutes
    PASSWORD_RESET_RESEND_INTERVAL: 600000,   // 10 minutes
    MAX_EMAILS_PER_HOUR: 10,
    MAX_EMAILS_PER_DAY: 50
  }
};

// Search and Filter Constants
const SEARCH_CONSTANTS = {
  // Search Types
  TYPES: {
    USERS: 'users',
    GROUPS: 'groups',
    COURSES: 'courses',
    MESSAGES: 'messages'
  },
  
  // Sort Options
  SORT_OPTIONS: {
    RELEVANCE: 'relevance',
    NEWEST: 'newest',
    OLDEST: 'oldest',
    ALPHABETICAL: 'alphabetical',
    COMPATIBILITY: 'compatibility',
    POPULARITY: 'popularity'
  },
  
  // Filter Options
  FILTERS: {
    UNIVERSITY: 'university',
    YEAR: 'year',
    MAJOR: 'major',
    COURSES: 'courses',
    STUDY_PREFERENCES: 'study_preferences',
    LOCATION: 'location',
    AVAILABILITY: 'availability',
    GROUP_SIZE: 'group_size',
    MEETING_TYPE: 'meeting_type'
  },
  
  // Search Constraints
  CONSTRAINTS: {
    MIN_QUERY_LENGTH: 2,
    MAX_QUERY_LENGTH: 100,
    MAX_RESULTS: 50,
    DEFAULT_RESULTS: 20
  }
};

// Cache Constants
const CACHE_CONSTANTS = {
  // Cache Keys
  KEYS: {
    USER_PROFILE: 'user_profile_',
    USER_MATCHES: 'user_matches_',
    GROUP_MEMBERS: 'group_members_',
    POPULAR_COURSES: 'popular_courses',
    ACTIVE_USERS: 'active_users',
    SYSTEM_STATS: 'system_stats'
  },
  
  // TTL (Time To Live) in seconds
  TTL: {
    USER_PROFILE: 3600,             // 1 hour
    USER_MATCHES: 1800,             // 30 minutes
    GROUP_MEMBERS: 600,             // 10 minutes
    POPULAR_COURSES: 86400,         // 24 hours
    ACTIVE_USERS: 300,              // 5 minutes
    SYSTEM_STATS: 3600              // 1 hour
  }
};

// Database Constants
const DATABASE_CONSTANTS = {
  // Collection Names
  COLLECTIONS: {
    USERS: 'users',
    GROUPS: 'groups',
    MESSAGES: 'messages',
    MATCHES: 'matches',
    REPORTS: 'reports',
    NOTIFICATIONS: 'notifications',
    SESSIONS: 'sessions',
    AUDIT_LOGS: 'audit_logs'
  },
  
  // Index Names
  INDEXES: {
    USER_EMAIL: 'user_email_unique',
    USER_UNIVERSITY: 'user_university_index',
    MESSAGE_CONVERSATION: 'message_conversation_index',
    GROUP_COURSE: 'group_course_index',
    MATCH_USERS: 'match_users_compound'
  },
  
  // Connection Settings
  CONNECTION: {
    MAX_POOL_SIZE: 10,
    SERVER_SELECTION_TIMEOUT: 5000,
    SOCKET_TIMEOUT: 45000,
    HEARTBEAT_FREQUENCY: 10000
  }
};

// Error Messages
const ERROR_MESSAGES = {
  // Authentication Errors
  AUTH: {
    INVALID_CREDENTIALS: 'Invalid email or password',
    ACCOUNT_NOT_VERIFIED: 'Please verify your email address',
    ACCOUNT_SUSPENDED: 'Your account has been suspended',
    TOKEN_EXPIRED: 'Your session has expired. Please log in again',
    UNAUTHORIZED: 'You are not authorized to perform this action'
  },
  
  // Validation Errors
  VALIDATION: {
    REQUIRED_FIELD: 'This field is required',
    INVALID_EMAIL: 'Please provide a valid email address',
    WEAK_PASSWORD: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character',
    INVALID_PHONE: 'Please provide a valid phone number',
    INVALID_DATE: 'Please provide a valid date'
  },
  
  // User Errors
  USER: {
    NOT_FOUND: 'User not found',
    EMAIL_EXISTS: 'An account with this email already exists',
    PROFILE_INCOMPLETE: 'Please complete your profile',
    BLOCKED_USER: 'You have been blocked by this user'
  },
  
  // Group Errors
  GROUP: {
    NOT_FOUND: 'Group not found',
    ALREADY_MEMBER: 'You are already a member of this group',
    GROUP_FULL: 'This group is full',
    NOT_AUTHORIZED: 'You are not authorized to perform this action in this group',
    CANNOT_LEAVE: 'Group creator cannot leave the group'
  },
  
  // Message Errors
  MESSAGE: {
    NOT_FOUND: 'Message not found',
    CANNOT_EDIT: 'You can only edit your own messages',
    EDIT_TIME_EXPIRED: 'Message can no longer be edited',
    TOO_LONG: 'Message is too long',
    EMPTY_MESSAGE: 'Message cannot be empty'
  },
  
  // File Upload Errors
  FILE: {
    TOO_LARGE: 'File is too large',
    INVALID_TYPE: 'File type not supported',
    UPLOAD_FAILED: 'File upload failed',
    NOT_FOUND: 'File not found'
  },
  
  // General Errors
  GENERAL: {
    SERVER_ERROR: 'An unexpected error occurred',
    NETWORK_ERROR: 'Network connection error',
    RATE_LIMIT: 'Too many requests. Please try again later',
    MAINTENANCE: 'System is under maintenance'
  }
};

// Success Messages
const SUCCESS_MESSAGES = {
  AUTH: {
    LOGIN_SUCCESS: 'Login successful',
    LOGOUT_SUCCESS: 'Logout successful',
    REGISTER_SUCCESS: 'Account created successfully',
    EMAIL_VERIFIED: 'Email verified successfully',
    PASSWORD_RESET: 'Password reset successfully'
  },
  
  USER: {
    PROFILE_UPDATED: 'Profile updated successfully',
    PREFERENCES_SAVED: 'Study preferences saved',
    ACCOUNT_DEACTIVATED: 'Account deactivated successfully'
  },
  
  GROUP: {
    CREATED: 'Group created successfully',
    JOINED: 'Joined group successfully',
    LEFT: 'Left group successfully',
    UPDATED: 'Group updated successfully',
    DELETED: 'Group deleted successfully'
  },
  
  MESSAGE: {
    SENT: 'Message sent',
    EDITED: 'Message edited',
    DELETED: 'Message deleted'
  },
  
  GENERAL: {
    CHANGES_SAVED: 'Changes saved successfully',
    ACTION_COMPLETED: 'Action completed successfully'
  }
};

// Export all constants
module.exports = {
  APP_INFO,
  ENVIRONMENTS,
  HTTP_STATUS,
  USER_CONSTANTS,
  GROUP_CONSTANTS,
  MESSAGE_CONSTANTS,
  FILE_CONSTANTS,
  MATCHING_CONSTANTS,
  SECURITY_CONSTANTS,
  NOTIFICATION_CONSTANTS,
  MODERATION_CONSTANTS,
  SOCKET_CONSTANTS,
  EMAIL_CONSTANTS,
  SEARCH_CONSTANTS,
  CACHE_CONSTANTS,
  DATABASE_CONSTANTS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
};