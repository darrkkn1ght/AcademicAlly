const messageService = require('../services/messageService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

// DEBUG: Check if dependencies are loaded correctly
console.log('DEBUG messageService:', messageService);
console.log('DEBUG logger:', logger);

/**
 * Message Controller for AcademicAlly
 * Handles all HTTP requests related to messaging (direct messages and group chat)
 */

class MessageController {
  /**
   * Send a direct message between users
   * POST /api/messages/direct
   */
  async sendDirectMessage(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.logMessage('Direct message send failed - validation errors', {
          senderId: req.user.id,
          errors: errors.array()
        });
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const senderId = req.user.id;
      const { recipientId, content, attachments } = req.body;

      logger.logMessage('Direct message send attempt', {
        senderId,
        recipientId,
        hasAttachments: !!attachments?.length
      });

      const result = await messageService.sendDirectMessage(
        senderId,
        recipientId,
        content,
        attachments
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      logger.logMessage('Direct message sent successfully', {
        senderId,
        recipientId,
        messageId: result.message._id
      });

      res.status(201).json(result);
    } catch (error) {
      logger.error('Error in sendDirectMessage controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to send message',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async sendGroupMessage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      const senderId = req.user.id;
      const { groupId, content, attachments } = req.body;
      logger.logMessage('Group message send attempt', {
        senderId,
        groupId,
        hasAttachments: !!attachments?.length
      });
      const result = await messageService.sendGroupMessage(
        senderId,
        groupId,
        { content, attachments }
      );
      if (!result.success) {
        return res.status(400).json(result);
      }
      logger.logMessage('Group message sent successfully', {
        senderId,
        groupId,
        messageId: result.message._id
      });
      res.status(201).json(result);
    } catch (error) {
      logger.error('Error in sendGroupMessage controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to send group message',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  
  /**
   * Get user's conversations list
   * GET /api/messages/conversations
   */
  async getConversations(req, res) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;

      logger.logMessage('Conversations list request', {
        userId,
        page,
        limit
      });

      const result = await messageService.getConversations(userId, page, limit);

      res.json(result);
    } catch (error) {
      logger.error('Error in getConversations controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch conversations',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get messages for a specific conversation
   * GET /api/messages/conversation/:type/:id
   */
  async getMessages(req, res) {
    try {
      const userId = req.user.id;
      const { type, id } = req.params; // type: 'direct' or 'group', id: userId or groupId
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;

      if (!['direct', 'group'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid conversation type. Must be "direct" or "group"'
        });
      }

      logger.logMessage('Messages fetch request', {
        userId,
        conversationType: type,
        conversationId: id,
        page,
        limit
      });

      let result;
      if (type === 'direct') {
        result = await messageService.getDirectMessages(userId, id, page, limit);
      } else {
        result = await messageService.getGroupMessages(userId, id, page, limit);
      }

      if (!result.success) {
        return res.status(403).json(result);
      }

      res.json(result);
    } catch (error) {
      logger.error('Error in getMessages controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        conversationType: req.params.type,
        conversationId: req.params.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch messages',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Mark messages as read
   * PUT /api/messages/mark-read
   */
  async markMessagesAsRead(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const { messageIds, conversationType, conversationId } = req.body;

      logger.logMessage('Mark as read request', {
        userId,
        messageCount: messageIds?.length,
        conversationType,
        conversationId
      });

      let result;
      if (messageIds && messageIds.length > 0) {
        // Mark specific messages as read
        result = await messageService.markMessagesAsRead(userId, messageIds);
      } else if (conversationType && conversationId) {
        // Mark all messages in conversation as read
        if (conversationType === 'direct') {
          result = await messageService.markDirectConversationAsRead(userId, conversationId);
        } else if (conversationType === 'group') {
          result = await messageService.markGroupConversationAsRead(userId, conversationId);
        } else {
          return res.status(400).json({
            success: false,
            message: 'Invalid conversation type'
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Either messageIds or conversation details must be provided'
        });
      }

      if (!result.success) {
        return res.status(400).json(result);
      }

      logger.logMessage('Messages marked as read successfully', {
        userId,
        markedCount: result.markedCount
      });

      res.json(result);
    } catch (error) {
      logger.error('Error in markMessagesAsRead controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to mark messages as read',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Search messages across conversations
   * GET /api/messages/search
   */
  async searchMessages(req, res) {
    try {
      const userId = req.user.id;
      const {
        query,
        conversationType,
        conversationId,
        dateFrom,
        dateTo,
        page = 1,
        limit = 20
      } = req.query;

      if (!query || query.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search query must be at least 2 characters long'
        });
      }

      const searchOptions = {
        query: query.trim(),
        conversationType,
        conversationId,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        page: parseInt(page),
        limit: parseInt(limit)
      };

      logger.logMessage('Message search request', {
        userId,
        searchQuery: query,
        options: searchOptions
      });

      const result = await messageService.searchMessages(userId, searchOptions);

      res.json(result);
    } catch (error) {
      logger.error('Error in searchMessages controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to search messages',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Delete a message (soft delete)
   * DELETE /api/messages/:messageId
   */
  async deleteMessage(req, res) {
    try {
      const userId = req.user.id;
      const messageId = req.params.messageId;

      logger.logMessage('Message deletion attempt', {
        userId,
        messageId
      });

      const result = await messageService.deleteMessage(messageId, userId);

      if (!result.success) {
        return res.status(result.message.includes('not found') ? 404 : 403).json(result);
      }

      logger.logMessage('Message deleted successfully', {
        userId,
        messageId
      });

      res.json(result);
    } catch (error) {
      logger.error('Error in deleteMessage controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        messageId: req.params.messageId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to delete message',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get unread message count
   * GET /api/messages/unread-count
   */
  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;

      logger.logMessage('Unread count request', { userId });

      const result = await messageService.getUnreadCount(userId);

      res.json(result);
    } catch (error) {
      logger.error('Error in getUnreadCount controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to get unread count',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get message delivery status (for real-time features)
   * GET /api/messages/:messageId/status
   */
  async getMessageStatus(req, res) {
    try {
      const userId = req.user.id;
      const messageId = req.params.messageId;

      logger.logMessage('Message status request', {
        userId,
        messageId
      });

      const result = await messageService.getMessageStatus(messageId, userId);

      if (!result.success) {
        return res.status(result.message.includes('not found') ? 404 : 403).json(result);
      }

      res.json(result);
    } catch (error) {
      logger.error('Error in getMessageStatus controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        messageId: req.params.messageId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to get message status',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Report a message for inappropriate content
   * POST /api/messages/:messageId/report
   */
  async reportMessage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const messageId = req.params.messageId;
      const { reason, description } = req.body;

      logger.logMessage('Message report attempt', {
        reporterId: userId,
        messageId,
        reason
      });

      const result = await messageService.reportMessage(messageId, userId, reason, description);

      if (!result.success) {
        return res.status(400).json(result);
      }

      logger.logMessage('Message reported successfully', {
        reporterId: userId,
        messageId,
        reportId: result.report._id
      });

      res.status(201).json(result);
    } catch (error) {
      logger.error('Error in reportMessage controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        messageId: req.params.messageId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to report message',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
/**
   * Get list of blocked users
   * GET /api/messages/blocked-users
   */
  async getBlockedUsers(req, res) {
    try {
      const userId = req.user.id;
      const result = await messageService.getBlockedUsers(userId);
      res.json(result);
    } catch (error) {
      logger.error('Error in getBlockedUsers controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to get blocked users',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  /**
   * Respond to a study invite
   * POST /api/messages/invites/:inviteId/respond
   */
  async respondToStudyInvite(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      const userId = req.user.id;
      const { inviteId } = req.params;
      const { response, message } = req.body;
      const result = await messageService.respondToStudyInvite(userId, inviteId, response, message);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error) {
      logger.error('Error in respondToStudyInvite controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        inviteId: req.params.inviteId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to respond to study invite',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
// STUBS FOR MISSING METHODS
   async getGroupMessages(req, res) {
    try {
      const userId = req.user.id;
      const groupId = req.params.groupId;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;

      logger.logMessage('Group messages fetch request', {
        userId,
        groupId,
        page,
        limit
      });

      const result = await messageService.getGroupMessages(userId, groupId, page, limit);

      if (!result.success) {
        return res.status(403).json(result);
      }

      res.json(result);
    } catch (error) {
      logger.error('Error in getGroupMessages controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        groupId: req.params.groupId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch group messages',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async editMessage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      const userId = req.user.id;
      const messageId = req.params.messageId;
      const { content } = req.body;
      const result = await messageService.editMessage(messageId, userId, content);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error) {
      logger.error('Error in editMessage controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        messageId: req.params.messageId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to edit message',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  async addReaction(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      const userId = req.user.id;
      const messageId = req.params.messageId;
      const { emoji } = req.body;
      const result = await messageService.addReaction(messageId, userId, emoji);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error) {
      logger.error('Error in addReaction controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        messageId: req.params.messageId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to add reaction',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  async removeReaction(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      const userId = req.user.id;
      const messageId = req.params.messageId;
      const { emoji } = req.body;
      const result = await messageService.removeReaction(messageId, userId, emoji);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error) {
      logger.error('Error in removeReaction controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        messageId: req.params.messageId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to remove reaction',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  async pinMessage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      const userId = req.user.id;
      const messageId = req.params.messageId;
      const result = await messageService.pinMessage(messageId, userId);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error) {
      logger.error('Error in pinMessage controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        messageId: req.params.messageId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to pin message',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  async unpinMessage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      const userId = req.user.id;
      const messageId = req.params.messageId;
      const result = await messageService.unpinMessage(messageId, userId);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error) {
      logger.error('Error in unpinMessage controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        messageId: req.params.messageId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to unpin message',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  async sendTypingIndicator(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      const userId = req.user.id;
      const { conversationType, conversationId, isTyping } = req.body;
      const result = await messageService.sendTypingIndicator(userId, conversationType, conversationId, isTyping);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error) {
      logger.error('Error in sendTypingIndicator controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to handle typing indicator',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  async sendStudyInvite(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      const senderId = req.user.id;
      const { recipientId, groupId, sessionDetails } = req.body;
      const result = await messageService.sendStudyInvite(senderId, recipientId, groupId, sessionDetails);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.status(201).json(result);
    } catch (error) {
      logger.error('Error in sendStudyInvite controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to send study invite',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  async getMessageStats(req, res) {
    try {
      const userId = req.user.id;
      const period = req.query.period;
      const result = await messageService.getMessageStats(userId, period);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error) {
      logger.error('Error in getMessageStats controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to get message stats',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  async blockUser(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      const userId = req.user.id;
      const { userId: blockUserId } = req.body;
      const result = await messageService.blockUser(userId, blockUserId);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error) {
      logger.error('Error in blockUser controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to block user',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  async unblockUser(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      const userId = req.user.id;
      const { userId: unblockUserId } = req.body;
      const result = await messageService.unblockUser(userId, unblockUserId);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error) {
      logger.error('Error in unblockUser controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to unblock user',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new MessageController();