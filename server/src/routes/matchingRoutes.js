const express = require('express');
const { body, param, query } = require('express-validator');
const matchingController = require('../controllers/matchingController');
const authMiddleware = require('../middleware/authMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimitMiddleware');

const router = express.Router();

/**
 * Matching Routes for AcademicAlly
 * All routes require authentication
 */

// Apply authentication middleware to all matching routes
router.use(authMiddleware.protect);

/**
 * @route   GET /api/matching/partners
 * @desc    Find compatible study partners
 * @access  Private
 */
router.get('/partners',
  [
    query('courses').optional().isString().withMessage('Courses must be a string'),
    query('studyStyle').optional().isIn(['intensive', 'casual', 'exam-prep', 'project-based'])
      .withMessage('Invalid study style'),
    query('location').optional().isString().withMessage('Location must be a string'),
    query('maxDistance').optional().isInt({ min: 1, max: 100 })
      .withMessage('Max distance must be between 1 and 100 km'),
    query('timePreference').optional().isIn(['morning', 'afternoon', 'evening', 'night', 'flexible'])
      .withMessage('Invalid time preference'),
    query('limit').optional().isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
    query('minReputation').optional().isFloat({ min: 0, max: 5 })
      .withMessage('Min reputation must be between 0 and 5'),
    query('excludeMatched').optional().isBoolean()
      .withMessage('Exclude matched must be a boolean')
  ],
  matchingController.findPartners
);

/**
 * @route   GET /api/matching/compatibility/:partnerId
 * @desc    Get detailed compatibility analysis with a potential partner
 * @access  Private
 */
router.get('/compatibility/:partnerId',
  [
    param('partnerId').isMongoId().withMessage('Invalid partner ID')
  ],
  matchingController.getCompatibilityAnalysis
);

/**
 * @route   POST /api/matching/request
 * @desc    Send match request to potential partner
 * @access  Private
 * @rate    5 requests per minute
 */
router.post('/request',
  rateLimitMiddleware.createCustomLimit({ max: 5, windowMs: 1 * 60 * 1000 }), // 5 requests per minute
  [
    body('partnerId').isMongoId().withMessage('Invalid partner ID'),
    body('message').optional().isString().isLength({ min: 1, max: 500 })
      .withMessage('Message must be between 1 and 500 characters'),
    body('courses').optional().isArray().withMessage('Courses must be an array'),
    body('courses.*').optional().isString().withMessage('Each course must be a string')
  ],
  matchingController.sendMatchRequest
);

/**
 * @route   PUT /api/matching/request/:matchId
 * @desc    Respond to match request (accept/decline)
 * @access  Private
 */
router.put('/request/:matchId',
  [
    param('matchId').isMongoId().withMessage('Invalid match ID'),
    body('action').isIn(['accept', 'decline']).withMessage('Action must be accept or decline'),
    body('message').optional().isString().isLength({ min: 1, max: 300 })
      .withMessage('Message must be between 1 and 300 characters')
  ],
  matchingController.respondToMatchRequest
);

/**
 * @route   GET /api/matching/my-matches
 * @desc    Get all matches for current user
 * @access  Private
 */
router.get('/my-matches',
  [
    query('status').optional().isIn(['pending', 'accepted', 'declined', 'expired'])
      .withMessage('Invalid status'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
    query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'compatibilityScore'])
      .withMessage('Invalid sort field'),
    query('sortOrder').optional().isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc')
  ],
  matchingController.getMyMatches
);

/**
 * @route   GET /api/matching/stats
 * @desc    Get matching statistics for user
 * @access  Private
 */
router.get('/stats', matchingController.getMatchingStats);

/**
 * @route   PUT /api/matching/preferences
 * @desc    Update matching preferences
 * @access  Private
 */
router.put('/preferences',
  [
    body('studyStyle').optional().isIn(['intensive', 'casual', 'exam-prep', 'project-based'])
      .withMessage('Invalid study style'),
    body('preferredGroupSize').optional().isInt({ min: 1, max: 10 })
      .withMessage('Preferred group size must be between 1 and 10'),
    body('location').optional().isString().isLength({ min: 1, max: 100 })
      .withMessage('Location must be between 1 and 100 characters'),
    body('maxDistance').optional().isInt({ min: 1, max: 100 })
      .withMessage('Max distance must be between 1 and 100 km'),
    body('timePreferences').optional().isArray()
      .withMessage('Time preferences must be an array'),
    body('timePreferences.*').optional().isIn(['morning', 'afternoon', 'evening', 'night'])
      .withMessage('Invalid time preference'),
    body('subjectPreferences').optional().isArray()
      .withMessage('Subject preferences must be an array'),
    body('subjectPreferences.*').optional().isString()
      .withMessage('Each subject preference must be a string'),
    body('minReputation').optional().isFloat({ min: 0, max: 5 })
      .withMessage('Min reputation must be between 0 and 5'),
    body('autoAcceptHighCompatibility').optional().isBoolean()
      .withMessage('Auto accept must be a boolean'),
    body('notificationsEnabled').optional().isBoolean()
      .withMessage('Notifications enabled must be a boolean')
  ],
  matchingController.updateMatchingPreferences
);

/**
 * @route   POST /api/matching/block
 * @desc    Block a user from matching
 * @access  Private
 * @rate    3 requests per hour
 */
router.post('/block',
  rateLimitMiddleware.createCustomLimit({ max: 3, windowMs: 60 * 60 * 1000 }), // 3 requests per hour
  [
    body('blockedUserId').isMongoId().withMessage('Invalid user ID'),
    body('reason').optional().isString().isLength({ min: 1, max: 200 })
      .withMessage('Reason must be between 1 and 200 characters')
  ],
  matchingController.blockUser
);

/**
 * @route   DELETE /api/matching/block/:blockedUserId
 * @desc    Unblock a user
 * @access  Private
 */
router.delete('/block/:blockedUserId',
  [
    param('blockedUserId').isMongoId().withMessage('Invalid user ID')
  ],
  matchingController.unblockUser
);

/**
 * @route   GET /api/matching/blocked
 * @desc    Get list of blocked users
 * @access  Private
 */
router.get('/blocked', matchingController.getBlockedUsers);

/**
 * @route   POST /api/matching/rate
 * @desc    Rate a study partner after session
 * @access  Private
 * @rate    10 requests per hour
 */
router.post('/rate',
  rateLimitMiddleware.createCustomLimit({ max: 10, windowMs: 60 * 60 * 1000 }), // 10 requests per hour
  [
    body('partnerId').isMongoId().withMessage('Invalid partner ID'),
    body('matchId').isMongoId().withMessage('Invalid match ID'),
    body('rating').isFloat({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('feedback').optional().isString().isLength({ min: 1, max: 500 })
      .withMessage('Feedback must be between 1 and 500 characters')
  ],
  matchingController.ratePartner
);

/**
 * @route   GET /api/matching/recommendations
 * @desc    Get personalized matching recommendations
 * @access  Private
 */
router.get('/recommendations',
  [
    query('limit').optional().isInt({ min: 1, max: 20 })
      .withMessage('Limit must be between 1 and 20')
  ],
  matchingController.getRecommendations
);

/**
 * Additional utility routes
 */

/**
 * @route   GET /api/matching/search
 * @desc    Advanced search for study partners
 * @access  Private
 */
router.get('/search',
  [
    query('q').optional().isString().isLength({ min: 1, max: 100 })
      .withMessage('Search query must be between 1 and 100 characters'),
    query('university').optional().isString().withMessage('University must be a string'),
    query('major').optional().isString().withMessage('Major must be a string'),
    query('year').optional().isInt({ min: 1, max: 6 }).withMessage('Year must be between 1 and 6'),
    query('courses').optional().isString().withMessage('Courses must be a string'),
    query('minRating').optional().isFloat({ min: 0, max: 5 })
      .withMessage('Min rating must be between 0 and 5'),
    query('location').optional().isString().withMessage('Location must be a string'),
    query('availability').optional().isString().withMessage('Availability must be a string'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  matchingController.findPartners // Reuse the findPartners method with enhanced filtering
);

/**
 * @route   GET /api/matching/mutual/:userId
 * @desc    Check for mutual connections with another user
 * @access  Private
 */
router.get('/mutual/:userId',
  [
    param('userId').isMongoId().withMessage('Invalid user ID')
  ],
  async (req, res) => {
    try {
      const currentUserId = req.user.id;
      const { userId } = req.params;

      // This would be implemented in the matching service
      // For now, return a placeholder response
      res.status(200).json({
        success: true,
        message: 'Mutual connections checked',
        data: {
          mutualConnections: [],
          count: 0,
          hasDirectConnection: false
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to check mutual connections'
      });
    }
  }
);

/**
 * @route   POST /api/matching/feedback
 * @desc    Submit general feedback about matching system
 * @access  Private
 * @rate    2 requests per day
 */
router.post('/feedback',
  rateLimitMiddleware.createCustomLimit({ max: 2, windowMs: 24 * 60 * 60 * 1000 }), // 2 requests per day
  [
    body('type').isIn(['bug', 'suggestion', 'complaint', 'compliment'])
      .withMessage('Invalid feedback type'),
    body('subject').isString().isLength({ min: 5, max: 100 })
      .withMessage('Subject must be between 5 and 100 characters'),
    body('message').isString().isLength({ min: 10, max: 1000 })
      .withMessage('Message must be between 10 and 1000 characters'),
    body('rating').optional().isInt({ min: 1, max: 5 })
      .withMessage('Rating must be between 1 and 5')
  ],
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { type, subject, message, rating } = req.body;

      // Log feedback for review
      require('../utils/logger').logMatching('Matching feedback received', {
        userId,
        type,
        subject,
        rating
      });

      res.status(200).json({
        success: true,
        message: 'Feedback submitted successfully. Thank you for helping us improve!'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to submit feedback'
      });
    }
  }
);

module.exports = router;