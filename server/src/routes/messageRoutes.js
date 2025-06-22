const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const authMiddleware = require('../middleware/authMiddleware');
const { validationMiddleware } = require('../middleware/validationMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimitMiddleware');
const messageController = require('../controllers/messageController'); // Keep only one import

// DEBUG: Check all message controller methods for undefined
[
  'sendDirectMessage',
  'sendGroupMessage',
  'addReaction',
  'pinMessage',
  'markMessagesAsRead',
  'sendTypingIndicator',
  'reportMessage',
  'blockUser',
  'unblockUser',
  'sendStudyInvite',
  'respondToStudyInvite'
].forEach(fn => {
  console.log('DEBUG:', fn, typeof messageController[fn]);
});

// DEBUG: Verify controller imports
console.log('DEBUG: messageController loaded:', messageController);
console.log('DEBUG: sendDirectMessage exists:', typeof messageController.sendDirectMessage === 'function');
// DEBUG: List all controller methods and check for undefined
Object.keys(messageController).forEach(key => {
  const val = messageController[key];
  console.log(`DEBUG: messageController.${key} is`, typeof val, val === undefined ? '(undefined)' : '');
});

// Apply authentication to all message routes
router.use(authMiddleware.protect);

// =============================================================================
// DIRECT MESSAGING ROUTES
// =============================================================================

/**
 * @route   GET /api/messages/conversations
 * @desc    Get user's conversation list
 * @access  Private
 */
router.get('/conversations', 
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),
    query('search')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Search term cannot exceed 100 characters')
  ],
  validationMiddleware,
  (req, res) => messageController.getConversations(req, res)
);

/**
 * @route   GET /api/messages/conversation/:userId
 * @desc    Get messages in a direct conversation
 * @access  Private
 */
router.get('/conversation/:userId',
  [
    param('userId')
      .isMongoId()
      .withMessage('Invalid user ID'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),
    query('before')
      .optional()
      .isISO8601()
      .withMessage('Before must be a valid date')
  ],
  validationMiddleware,
  (req, res) => {
    // Call getMessages with type 'direct' and id as userId param
    req.params.type = 'direct';
    req.params.id = req.params.userId;
    return messageController.getMessages(req, res);
  }
);

/**
 * @route   POST /api/messages/send
 * @desc    Send a direct message to another user
 * @access  Private
 */
router.post('/send',
  rateLimitMiddleware.messageLimit, // Rate limit messaging
  [
    body('recipientId')
      .isMongoId()
      .withMessage('Invalid recipient ID'),
    body('content')
      .trim()
      .notEmpty()
      .withMessage('Message content is required')
      .isLength({ min: 1, max: 2000 })
      .withMessage('Message must be between 1 and 2000 characters'),
    body('messageType')
      .optional()
      .isIn(['text', 'image', 'file', 'study_invite'])
      .withMessage('Invalid message type'),
    body('attachments')
      .optional()
      .isArray({ max: 5 })
      .withMessage('Maximum 5 attachments allowed'),
    body('attachments.*')
      .optional()
      .isString()
      .withMessage('Invalid attachment format'),
    body('replyTo')
      .optional()
      .isMongoId()
      .withMessage('Invalid reply message ID')
  ],
  validationMiddleware,
  (req, res) => {
    if (typeof messageController.sendDirectMessage === 'function') {
      return messageController.sendDirectMessage(req, res);
    } else {
      console.error('sendDirectMessage is not a function');
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

// =============================================================================
// GROUP MESSAGING ROUTES
// =============================================================================

/**
 * @route   GET /api/messages/group/:groupId
 * @desc    Get messages in a group chat
 * @access  Private (Group Member)
 */
router.get('/group/:groupId',
  [
    param('groupId')
      .isMongoId()
      .withMessage('Invalid group ID'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),
    query('before')
      .optional()
      .isISO8601()
      .withMessage('Before must be a valid date')
  ],
  validationMiddleware,
  (req, res) => messageController.getGroupMessages(req, res)
);

/**
 * @route   POST /api/messages/group/:groupId
 * @desc    Send a message to a group
 * @access  Private (Group Member)
 */
router.post('/group/:groupId',
  rateLimitMiddleware.messageLimit,
  [
    param('groupId')
      .isMongoId()
      .withMessage('Invalid group ID'),
    body('content')
      .trim()
      .notEmpty()
      .withMessage('Message content is required')
      .isLength({ min: 1, max: 2000 })
      .withMessage('Message must be between 1 and 2000 characters'),
    body('messageType')
      .optional()
      .isIn(['text', 'image', 'file', 'announcement', 'study_session'])
      .withMessage('Invalid message type'),
    body('attachments')
      .optional()
      .isArray({ max: 5 })
      .withMessage('Maximum 5 attachments allowed'),
    body('attachments.*')
      .optional()
      .isString()
      .withMessage('Invalid attachment format'),
    body('replyTo')
      .optional()
      .isMongoId()
      .withMessage('Invalid reply message ID'),
    body('mentionedUsers')
      .optional()
      .isArray({ max: 10 })
      .withMessage('Maximum 10 user mentions allowed'),
    body('mentionedUsers.*')
      .optional()
      .isMongoId()
      .withMessage('Invalid mentioned user ID')
  ],
  validationMiddleware,
  (req, res) => messageController.sendGroupMessage(req, res)
);

// =============================================================================
// MESSAGE MANAGEMENT ROUTES
// =============================================================================

/**
 * @route   PUT /api/messages/:messageId
 * @desc    Edit a message (within time limit)
 * @access  Private (Message Author)
 */
router.put('/:messageId',
  [
    param('messageId')
      .isMongoId()
      .withMessage('Invalid message ID'),
    body('content')
      .trim()
      .notEmpty()
      .withMessage('Message content is required')
      .isLength({ min: 1, max: 2000 })
      .withMessage('Message must be between 1 and 2000 characters')
  ],
  validationMiddleware,
  (req, res) => messageController.editMessage(req, res)
);

/**
 * @route   DELETE /api/messages/:messageId
 * @desc    Delete a message
 * @access  Private (Message Author or Group Admin)
 */
router.delete('/:messageId',
  [
    param('messageId')
      .isMongoId()
      .withMessage('Invalid message ID')
  ],
  validationMiddleware,
  (req, res) => messageController.deleteMessage(req, res)
);

/**
 * @route   POST /api/messages/:messageId/react
 * @desc    Add reaction to a message
 * @access  Private
 */
router.post('/:messageId/react',
  [
    param('messageId')
      .isMongoId()
      .withMessage('Invalid message ID'),
    body('emoji')
      .trim()
      .notEmpty()
      .withMessage('Emoji is required')
      .isLength({ min: 1, max: 10 })
      .withMessage('Invalid emoji format')
  ],
  validationMiddleware,
  (req, res) => messageController.addReaction(req, res)
);

/**
 * @route   DELETE /api/messages/:messageId/react
 * @desc    Remove reaction from a message
 * @access  Private
 */
router.delete('/:messageId/react',
  [
    param('messageId')
      .isMongoId()
      .withMessage('Invalid message ID'),
    body('emoji')
      .trim()
      .notEmpty()
      .withMessage('Emoji is required')
  ],
  validationMiddleware,
  (req, res) => messageController.removeReaction(req, res)
);

/**
 * @route   POST /api/messages/:messageId/pin
 * @desc    Pin a message in group chat
 * @access  Private (Group Admin)
 */
router.post('/:messageId/pin',
  [
    param('messageId')
      .isMongoId()
      .withMessage('Invalid message ID')
  ],
  validationMiddleware,
  (req, res) => messageController.pinMessage(req, res)
);

/**
 * @route   DELETE /api/messages/:messageId/pin
 * @desc    Unpin a message in group chat
 * @access  Private (Group Admin)
 */
router.delete('/:messageId/pin',
  [
    param('messageId')
      .isMongoId()
      .withMessage('Invalid message ID')
  ],
  validationMiddleware,
  (req, res) => messageController.unpinMessage(req, res)
);

// =============================================================================
// MESSAGE STATUS & ACTIVITY ROUTES
// =============================================================================

/**
 * @route   POST /api/messages/mark-read
 * @desc    Mark messages as read
 * @access  Private
 */
router.post('/mark-read',
  [
    body('messageIds')
      .isArray({ min: 1, max: 100 })
      .withMessage('Message IDs array required (max 100)'),
    body('messageIds.*')
      .isMongoId()
      .withMessage('Invalid message ID'),
    body('conversationType')
      .optional()
      .isIn(['direct', 'group'])
      .withMessage('Invalid conversation type'),
    body('conversationId')
      .optional()
      .isMongoId()
      .withMessage('Invalid conversation ID')
  ],
  validationMiddleware,
  (req, res) => messageController.markMessagesAsRead(req, res)
);

/**
 * @route   GET /api/messages/unread-count
 * @desc    Get unread message count
 * @access  Private
 */
router.get('/unread-count',
  (req, res) => messageController.getUnreadCount(req, res)
);

/**
 * @route   POST /api/messages/typing
 * @desc    Send typing indicator
 * @access  Private
 */
router.post('/typing',
  rateLimitMiddleware.typingLimit, // Higher rate limit for typing
  [
    body('conversationType')
      .isIn(['direct', 'group'])
      .withMessage('Invalid conversation type'),
    body('conversationId')
      .isMongoId()
      .withMessage('Invalid conversation ID'),
    body('isTyping')
      .isBoolean()
      .withMessage('isTyping must be boolean')
  ],
  validationMiddleware,
  (req, res) => messageController.sendTypingIndicator(req, res)
);

// =============================================================================
// SEARCH & FILTERING ROUTES
// =============================================================================

/**
 * @route   GET /api/messages/search
 * @desc    Search messages across conversations
 * @access  Private
 */
router.get('/search',
  [
    query('q')
      .trim()
      .notEmpty()
      .withMessage('Search query is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Search query must be between 2 and 100 characters'),
    query('conversationType')
      .optional()
      .isIn(['direct', 'group', 'all'])
      .withMessage('Invalid conversation type'),
    query('conversationId')
      .optional()
      .isMongoId()
      .withMessage('Invalid conversation ID'),
    query('messageType')
      .optional()
      .isIn(['text', 'image', 'file', 'study_invite', 'announcement'])
      .withMessage('Invalid message type'),
    query('dateFrom')
      .optional()
      .isISO8601()
      .withMessage('Invalid from date'),
    query('dateTo')
      .optional()
      .isISO8601()
      .withMessage('Invalid to date'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
  ],
  validationMiddleware,
  (req, res) => messageController.searchMessages(req, res)
);

// =============================================================================
// MODERATION & REPORTING ROUTES
// =============================================================================

/**
 * @route   POST /api/messages/:messageId/report
 * @desc    Report a message for inappropriate content
 * @access  Private
 */
router.post('/:messageId/report',
  rateLimitMiddleware.reportLimit,
  [
    param('messageId')
      .isMongoId()
      .withMessage('Invalid message ID'),
    body('reason')
      .isIn(['spam', 'harassment', 'inappropriate', 'fraud', 'other'])
      .withMessage('Invalid report reason'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot exceed 500 characters')
  ],
  validationMiddleware,
  (req, res) => messageController.reportMessage(req, res)
);

/**
 * @route   GET /api/messages/blocked-users
 * @desc    Get list of blocked users
 * @access  Private
 */
router.get('/blocked-users',
  (req, res) => messageController.getBlockedUsers(req, res)
);

/**
 * @route   POST /api/messages/block-user
 * @desc    Block a user from messaging
 * @access  Private
 */
router.post('/block-user',
  [
    body('userId')
      .isMongoId()
      .withMessage('Invalid user ID')
  ],
  validationMiddleware,
  (req, res) => messageController.blockUser(req, res)
);

/**
 * @route   POST /api/messages/unblock-user
 * @desc    Unblock a user
 * @access  Private
 */
router.post('/unblock-user',
  [
    body('userId')
      .isMongoId()
      .withMessage('Invalid user ID')
  ],
  validationMiddleware,
  (req, res) => messageController.unblockUser(req, res)
);

// =============================================================================
// STUDY SESSION INTEGRATION ROUTES
// =============================================================================

/**
 * @route   POST /api/messages/study-invite
 * @desc    Send study session invitation
 * @access  Private
 */
router.post('/study-invite',
  rateLimitMiddleware.inviteLimit,
  [
    body('recipientId')
      .optional()
      .isMongoId()
      .withMessage('Invalid recipient ID'),
    body('groupId')
      .optional()
      .isMongoId()
      .withMessage('Invalid group ID'),
    body('sessionDetails')
      .isObject()
      .withMessage('Session details required'),
    body('sessionDetails.subject')
      .trim()
      .notEmpty()
      .withMessage('Study subject is required')
      .isLength({ max: 100 })
      .withMessage('Subject cannot exceed 100 characters'),
    body('sessionDetails.date')
      .isISO8601()
      .withMessage('Valid session date required'),
    body('sessionDetails.duration')
      .optional()
      .isInt({ min: 30, max: 480 })
      .withMessage('Duration must be between 30 and 480 minutes'),
    body('sessionDetails.location')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Location cannot exceed 200 characters'),
    body('sessionDetails.notes')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Notes cannot exceed 500 characters')
  ],
  validationMiddleware,
  (req, res) => messageController.sendStudyInvite(req, res)
);

/**
 * @route   POST /api/messages/study-invite/:inviteId/respond
 * @desc    Respond to study session invitation
 * @access  Private
 */
router.post('/study-invite/:inviteId/respond',
  [
    param('inviteId')
      .isMongoId()
      .withMessage('Invalid invite ID'),
    body('response')
      .isIn(['accept', 'decline', 'maybe'])
      .withMessage('Invalid response type'),
    body('message')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Response message cannot exceed 200 characters')
  ],
  validationMiddleware,
  (req, res) => messageController.respondToStudyInvite(req, res)
);

// =============================================================================
// ANALYTICS & INSIGHTS ROUTES (Optional)
// =============================================================================

/**
 * @route   GET /api/messages/stats
 * @desc    Get messaging statistics for user
 * @access  Private
 */
router.get('/stats',
  [
    query('period')
      .optional()
      .isIn(['week', 'month', 'semester', 'all'])
      .withMessage('Invalid time period')
  ],
  validationMiddleware,
  (req, res) => messageController.getMessageStats(req, res)
);

module.exports = router;