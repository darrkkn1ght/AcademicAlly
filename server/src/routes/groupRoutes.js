const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const { validationMiddleware, handleValidationErrors } = require('../middleware/validationMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimitMiddleware');
const groupController = require('../controllers/groupController');

// Apply auth middleware to all group routes
router.use(protect);

/**
 * @route   GET /api/groups
 * @desc    Get all groups with optional filtering
 * @access  Private
 */
router.get(
  '/',
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('course').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Course must be between 1-100 characters'),
  query('university').optional().trim().isLength({ min: 1, max: 100 }).withMessage('University must be between 1-100 characters'),
  query('meetingType').optional().isIn(['online', 'in-person', 'hybrid']).withMessage('Meeting type must be online, in-person, or hybrid'),
  query('status').optional().isIn(['active', 'inactive', 'full']).withMessage('Status must be active, inactive, or full'),
  query('search').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Search query must be between 1-200 characters'),
  query('sortBy').optional().isIn(['createdAt', 'memberCount', 'name', 'lastActivity']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  handleValidationErrors,
  (req, res) => groupController.getGroups(req, res)
);

/**
 * @route   GET /api/groups/my-groups
 * @desc    Get current user's groups (created or joined)
 * @access  Private
 */
router.get(
  '/my-groups',
  query('type').optional().isIn(['created', 'joined', 'all']).withMessage('Type must be created, joined, or all'),
  query('status').optional().isIn(['active', 'inactive', 'all']).withMessage('Status must be active, inactive, or all'),
  validationMiddleware,
  (req, res) => groupController.getMyGroups(req, res)
);

/**
 * @route   GET /api/groups/recommended
 * @desc    Get recommended groups for current user
 * @access  Private
 */
// router.get('/recommended',
//   [
//     query('limit')
//       .optional()
//       .isInt({ min: 1, max: 20 })
//       .withMessage('Limit must be between 1 and 20')
//   ],
//   validationMiddleware,
//   groupController.getRecommendedGroups
// );

/**
 * @route   GET /api/groups/:groupId
 * @desc    Get single group by ID
 * @access  Private
 */
router.get('/:groupId',
  [
    param('groupId')
      .isMongoId()
      .withMessage('Invalid group ID')
  ],
  validationMiddleware,
  (req, res) => groupController.getGroupById(req, res)
);

/**
 * @route   POST /api/groups
 * @desc    Create new study group
 * @access  Private
 */
router.post('/',
  rateLimitMiddleware.groupCreationLimit, // Rate limit group creation
  [
    body('name')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Group name must be between 3-100 characters')
      .matches(/^[a-zA-Z0-9\s\-_&().,!]+$/)
      .withMessage('Group name contains invalid characters'),
    body('description')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Description must be between 10-500 characters'),
    body('course')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Course must be between 2-100 characters'),
    body('subject')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Subject must be between 2-50 characters'),
    body('maxMembers')
      .isInt({ min: 2, max: 50 })
      .withMessage('Max members must be between 2-50'),
    body('meetingType')
      .isIn(['online', 'in-person', 'hybrid'])
      .withMessage('Meeting type must be online, in-person, or hybrid'),
    body('location')
      .optional()
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage('Location must be between 2-200 characters'),
    body('schedule')
      .optional()
      .isObject()
      .withMessage('Schedule must be an object'),
    body('schedule.days')
      .optional()
      .isArray({ min: 1, max: 7 })
      .withMessage('Schedule days must be an array with 1-7 items'),
    body('schedule.days.*')
      .optional()
      .isIn(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
      .withMessage('Invalid day in schedule'),
    body('schedule.startTime')
      .optional()
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('Start time must be in HH:MM format'),
    body('schedule.endTime')
      .optional()
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('End time must be in HH:MM format'),
    body('requirements')
      .optional()
      .isArray({ max: 10 })
      .withMessage('Requirements must be an array with max 10 items'),
    body('requirements.*')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Each requirement must be between 2-100 characters'),
    body('tags')
      .optional()
      .isArray({ max: 10 })
      .withMessage('Tags must be an array with max 10 items'),
    body('tags.*')
      .optional()
      .trim()
      .isLength({ min: 2, max: 30 })
      .withMessage('Each tag must be between 2-30 characters'),
    body('isPrivate')
      .optional()
      .isBoolean()
      .withMessage('isPrivate must be a boolean'),
    body('autoAccept')
      .optional()
      .isBoolean()
      .withMessage('autoAccept must be a boolean')
  ],
  validationMiddleware,
  (req, res) => groupController.createGroup(req, res)
);

/**
 * @route   PUT /api/groups/:groupId
 * @desc    Update group details
 * @access  Private (Group Creator/Admin only)
 */
router.put('/:groupId',
  [
    param('groupId')
      .isMongoId()
      .withMessage('Invalid group ID'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Group name must be between 3-100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Description must be between 10-500 characters'),
    body('maxMembers')
      .optional()
      .isInt({ min: 2, max: 50 })
      .withMessage('Max members must be between 2-50'),
    body('meetingType')
      .optional()
      .isIn(['online', 'in-person', 'hybrid'])
      .withMessage('Meeting type must be online, in-person, or hybrid'),
    body('location')
      .optional()
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage('Location must be between 2-200 characters'),
    body('schedule')
      .optional()
      .isObject()
      .withMessage('Schedule must be an object'),
    body('isPrivate')
      .optional()
      .isBoolean()
      .withMessage('isPrivate must be a boolean'),
    body('autoAccept')
      .optional()
      .isBoolean()
      .withMessage('autoAccept must be a boolean')
  ],
  validationMiddleware,
  (req, res) => groupController.updateGroup(req, res)
);

/**
 * @route   DELETE /api/groups/:groupId
 * @desc    Delete group
 * @access  Private (Group Creator only)
 */
router.delete('/:groupId',
  [
    param('groupId')
      .isMongoId()
      .withMessage('Invalid group ID')
  ],
  validationMiddleware,
  (req, res) => groupController.deleteGroup(req, res)
);

/**
 * @route   POST /api/groups/:groupId/join
 * @desc    Join a study group
 * @access  Private
 */
router.post('/:groupId/join',
  // No joinGroup rate limiter defined
  [
    param('groupId')
      .isMongoId()
      .withMessage('Invalid group ID'),
    body('message')
      .optional()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Join message must be between 1-500 characters')
  ],
  validationMiddleware,
  (req, res) => groupController.joinGroup(req, res)
);

/**
 * @route   POST /api/groups/:groupId/leave
 * @desc    Leave a study group
 * @access  Private
 */
router.post('/:groupId/leave',
  [
    param('groupId')
      .isMongoId()
      .withMessage('Invalid group ID'),
    body('reason')
      .optional()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Leave reason must be between 1-500 characters')
  ],
  validationMiddleware,
  (req, res) => groupController.leaveGroup(req, res)
);

/**
 * @route   GET /api/groups/:groupId/members
 * @desc    Get group members
 * @access  Private (Group members only)
 */
// router.get('/:groupId/members',
//   [
//     param('groupId')
//       .isMongoId()
//       .withMessage('Invalid group ID'),
//     query('page')
//       .optional()
//       .isInt({ min: 1 })
//       .withMessage('Page must be a positive integer'),
//     query('limit')
//       .optional()
//       .isInt({ min: 1, max: 50 })
//       .withMessage('Limit must be between 1 and 50')
//   ],
//   validationMiddleware,
//   groupController.getGroupMembers
// );

/**
 * @route   POST /api/groups/:groupId/members/:memberId/remove
 * @desc    Remove member from group
 * @access  Private (Group Creator/Admin only)
 */
router.post('/:groupId/members/:memberId/remove',
  [
    param('groupId')
      .isMongoId()
      .withMessage('Invalid group ID'),
    param('memberId')
      .isMongoId()
      .withMessage('Invalid member ID'),
    body('reason')
      .optional()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Removal reason must be between 1-500 characters')
  ],
  validationMiddleware,
  (req, res) => groupController.removeMember(req, res)
);

/**
 * @route   POST /api/groups/:groupId/members/:memberId/promote
 * @desc    Promote member to admin
 * @access  Private (Group Creator only)
 */
// router.post('/:groupId/members/:memberId/promote',
//   [
//     param('groupId')
//       .isMongoId()
//       .withMessage('Invalid group ID'),
//     param('memberId')
//       .isMongoId()
//       .withMessage('Invalid member ID')
//   ],
//   validationMiddleware,
//   groupController.promoteMember
// );

/**
 * @route   POST /api/groups/:groupId/members/:memberId/demote
 * @desc    Demote admin to regular member
 * @access  Private (Group Creator only)
 */
// router.post('/:groupId/members/:memberId/demote',
//   [
//     param('groupId')
//       .isMongoId()
//       .withMessage('Invalid group ID'),
//     param('memberId')
//       .isMongoId()
//       .withMessage('Invalid member ID')
//   ],
//   validationMiddleware,
//   groupController.demoteMember
// );

/**
 * @route   GET /api/groups/:groupId/join-requests
 * @desc    Get pending join requests for group
 * @access  Private (Group Creator/Admin only)
 */
// router.get('/:groupId/join-requests',
//   [
//     param('groupId')
//       .isMongoId()
//       .withMessage('Invalid group ID'),
//     query('status')
//       .optional()
//       .isIn(['pending', 'approved', 'rejected', 'all'])
//       .withMessage('Status must be pending, approved, rejected, or all')
//   ],
//   validationMiddleware,
//   groupController.getJoinRequests
// );

/**
 * @route   POST /api/groups/:groupId/join-requests/:requestId/approve
 * @desc    Approve join request
 * @access  Private (Group Creator/Admin only)
 */
// router.post('/:groupId/join-requests/:requestId/approve',
//   [
//     param('groupId')
//       .isMongoId()
//       .withMessage('Invalid group ID'),
//     param('requestId')
//       .isMongoId()
//       .withMessage('Invalid request ID'),
//     body('welcomeMessage')
//       .optional()
//       .trim()
//       .isLength({ min: 1, max: 500 })
//       .withMessage('Welcome message must be between 1-500 characters')
//   ],
//   validationMiddleware,
//   groupController.approveJoinRequest
// );

/**
 * @route   POST /api/groups/:groupId/join-requests/:requestId/reject
 * @desc    Reject join request
 * @access  Private (Group Creator/Admin only)
 */
// router.post('/:groupId/join-requests/:requestId/reject',
//   [
//     param('groupId')
//       .isMongoId()
//       .withMessage('Invalid group ID'),
//     param('requestId')
//       .isMongoId()
//       .withMessage('Invalid request ID'),
//     body('reason')
//       .optional()
//       .trim()
//       .isLength({ min: 1, max: 500 })
//       .withMessage('Rejection reason must be between 1-500 characters')
//   ],
//   validationMiddleware,
//   groupController.rejectJoinRequest
// );

/**
 * @route   POST /api/groups/:groupId/invite
 * @desc    Invite user to group
 * @access  Private (Group Creator/Admin only)
 */
// router.post('/:groupId/invite',
//   rateLimitMiddleware.inviteUser, // Rate limit invitations
//   [
//     param('groupId')
//       .isMongoId()
//       .withMessage('Invalid group ID'),
//     body('userId')
//       .optional()
//       .isMongoId()
//       .withMessage('Invalid user ID'),
//     body('email')
//       .optional()
//       .isEmail()
//       .normalizeEmail()
//       .withMessage('Invalid email address'),
//     body('message')
//       .optional()
//       .trim()
//       .isLength({ min: 1, max: 500 })
//       .withMessage('Invitation message must be between 1-500 characters')
//   ],
//   validationMiddleware,
//   groupController.inviteUser
// );

/**
 * @route   GET /api/groups/:groupId/activity
 * @desc    Get group activity/stats
 * @access  Private (Group members only)
 */
// router.get('/:groupId/activity',
//   [
//     param('groupId')
//       .isMongoId()
//       .withMessage('Invalid group ID'),
//     query('timeframe')
//       .optional()
//       .isIn(['week', 'month', 'semester', 'all'])
//       .withMessage('Timeframe must be week, month, semester, or all')
//   ],
//   validationMiddleware,
//   groupController.getGroupActivity
// );

/**
 * @route   POST /api/groups/:groupId/report
 * @desc    Report group for inappropriate content
 * @access  Private
 */
// router.post('/:groupId/report',
//   rateLimitMiddleware.reportContent, // Rate limit reports
//   [
//     param('groupId')
//       .isMongoId()
//       .withMessage('Invalid group ID'),
//     body('reason')
//       .isIn(['spam', 'inappropriate', 'harassment', 'fake', ' 'other'])
//       .withMessage('Invalid report reason'),
//     body('description')
//       .trim()
//       .isLength({ min: 10, max: 1000 })
//       .withMessage('Report description must be between 10-1000 characters'),
//     body('evidence')
//       .optional()
//       .isArray({ max: 5 })
//       .withMessage('Evidence must be an array with max 5 items')
//   ],
//   validationMiddleware,
//   groupController.reportGroup
// );

/**
 * @route   GET /api/groups/:groupId/similar
 * @desc    Get similar groups based on course/topics
 * @access  Private
 */
// router.get('/:groupId/similar',
//   [
//     param('groupId')
//       .isMongoId()
//       .withMessage('Invalid group ID'),
//     query('limit')
//       .optional()
//       .isInt({ min: 1, max: 10 })
//       .withMessage('Limit must be between 1 and 10')
//   ],
//   validationMiddleware,
//   groupController.getSimilarGroups
// );

/**
 * @route   POST /api/groups/:groupId/sessions
 * @desc    Create study session for group
 * @access  Private (Group members only)
 */
// router.post('/:groupId/sessions',
//   [
//     param('groupId')
//       .isMongoId()
//       .withMessage('Invalid group ID'),
//     body('title')
//       .trim()
//       .isLength({ min: 3, max: 100 })
//       .withMessage('Session title must be between 3-100 characters'),
//     body('description')
//       .optional()
//       .trim()
//       .isLength({ min: 1, max: 500 })
//       .withMessage('Description must be between 1-500 characters'),
//     body('scheduledFor')
//       .isISO8601()
//       .withMessage('Scheduled time must be a valid date'),
//     body('duration')
//       .isInt({ min: 15, max: 480 })
//       .withMessage('Duration must be between 15-480 minutes'),
//     body('location')
//       .optional()
//       .trim()
//       .isLength({ min: 2, max: 200 })
//       .withMessage('Location must be between 2-200 characters'),
//     body('meetingLink')
//       .optional()
//       .isURL()
//       .withMessage('Meeting link must be a valid URL'),
//     body('topics')
//       .optional()
//       .isArray({ max: 10 })
//       .withMessage('Topics must be an array with max 10 items')
//   ],
//   validationMiddleware,
//   groupController.createStudySession
// );

/**
 * @route   GET /api/groups/:groupId/sessions
 * @desc    Get group study sessions
 * @access  Private (Group members only)
 */
// router.get('/:groupId/sessions',
//   [
//     param('groupId')
//       .isMongoId()
//       .withMessage('Invalid group ID'),
//     query('status')
//       .optional()
//       .isIn(['upcoming', 'ongoing', 'completed', 'cancelled', 'all'])
//       .withMessage('Invalid session status'),
//     query('limit')
//       .optional()
//       .isInt({ min: 1, max: 50 })
//       .withMessage('Limit must be between 1 and 50')
//   ],
//   validationMiddleware,
//   groupController.getStudySessions
// );

module.exports = router;