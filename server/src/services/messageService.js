const Message = require('../models/Message');
const User = require('../models/User');
const Group = require('../models/Group');
const logger = require('../utils/logger');

/**
 * Message Service for AcademicAlly
 * Handles all messaging functionality - direct messages and group chats
 */

class MessageService {
  constructor() {
    this.maxMessageLength = 2000;
    this.maxMessagesPerMinute = 30;
    this.messageRetentionDays = 365;
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.allowedFileTypes = [
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf', 'text/plain',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
  }

  /**
   * Send a direct message between two users
   * @param {string} senderId - ID of message sender
   * @param {string} recipientId - ID of message recipient
   * @param {Object} messageData - Message content and metadata
   * @returns {Promise<Object>} Sent message
   */
  async sendDirectMessage(senderId, recipientId, messageData) {
    try {
      logger.message('Sending direct message', { senderId, recipientId });

      // Validate users exist
      const [sender, recipient] = await Promise.all([
        User.findById(senderId),
        User.findById(recipientId)
      ]);

      if (!sender || !recipient) {
        throw new Error('Sender or recipient not found');
      }

      // Check if users can message each other
      await this.validateDirectMessagePermissions(sender, recipient);

      // Rate limiting check
      await this.checkRateLimit(senderId);

      // Validate message content
      this.validateMessageContent(messageData);

      // Create message
      const message = new Message({
        sender: senderId,
        recipient: recipientId,
        content: messageData.content,
        messageType: messageData.type || 'text',
        attachments: messageData.attachments || [],
        timestamp: new Date(),
        isRead: false,
        conversationId: this.generateConversationId(senderId, recipientId)
      });

      const savedMessage = await message.save();

      // Populate sender info for real-time updates
      await savedMessage.populate('sender', 'name profilePicture');

      // Update conversation metadata
      await this.updateConversationMetadata(senderId, recipientId, savedMessage);

      logger.message('Direct message sent successfully', { 
        messageId: savedMessage._id,
        senderId,
        recipientId
      });

      return savedMessage;
    } catch (error) {
      logger.error('Error sending direct message', { 
        senderId, 
        recipientId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Send a message to a group
   * @param {string} senderId - ID of message sender
   * @param {string} groupId - ID of target group
   * @param {Object} messageData - Message content and metadata
   * @returns {Promise<Object>} Sent message
   */
  async sendGroupMessage(senderId, groupId, messageData) {
    try {
      logger.message('Sending group message', { senderId, groupId });

      // Validate sender and group
      const [sender, group] = await Promise.all([
        User.findById(senderId),
        Group.findById(groupId)
      ]);

      if (!sender || !group) {
        throw new Error('Sender or group not found');
      }

      // Check if user is member of the group
      if (!group.members.includes(senderId)) {
        throw new Error('User is not a member of this group');
      }

      // Check if group is active
      if (!group.isActive) {
        throw new Error('Cannot send message to inactive group');
      }

      // Rate limiting check
      await this.checkRateLimit(senderId);

      // Validate message content
      this.validateMessageContent(messageData);

      // Create message
      const message = new Message({
        sender: senderId,
        groupId: groupId,
        content: messageData.content,
        messageType: messageData.type || 'text',
        attachments: messageData.attachments || [],
        timestamp: new Date(),
        readBy: [{ user: senderId, readAt: new Date() }] // Sender has read it
      });

      const savedMessage = await message.save();

      // Populate sender info
      await savedMessage.populate('sender', 'name profilePicture');

      // Update group's last activity
      await Group.findByIdAndUpdate(groupId, {
        lastActivity: new Date(),
        updatedAt: new Date()
      });

      logger.message('Group message sent successfully', { 
        messageId: savedMessage._id,
        senderId,
        groupId,
        memberCount: group.members.length
      });

      return savedMessage;
    } catch (error) {
      logger.error('Error sending group message', { 
        senderId, 
        groupId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get conversation history between two users
   * @param {string} userId1 - First user ID
   * @param {string} userId2 - Second user ID
   * @param {Object} options - Pagination and filtering options
   * @returns {Promise<Object>} Conversation messages with pagination
   */
  async getDirectConversation(userId1, userId2, options = {}) {
    try {
      const { page = 1, limit = 50, before = null } = options;
      const skip = (page - 1) * limit;

      const conversationId = this.generateConversationId(userId1, userId2);
      
      // Build query
      const query = { conversationId };
      if (before) {
        query.timestamp = { $lt: new Date(before) };
      }

      // Get messages with pagination
      const [messages, totalCount] = await Promise.all([
        Message.find(query)
          .populate('sender', 'name profilePicture')
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Message.countDocuments(query)
      ]);

      // Mark messages as read for the requesting user
      await this.markDirectMessagesAsRead(userId1, userId2);

      const result = {
        messages: messages.reverse(), // Reverse to show oldest first
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        },
        conversationId
      };

      logger.message('Retrieved direct conversation', { 
        userId1, 
        userId2, 
        messageCount: messages.length 
      });

      return result;
    } catch (error) {
      logger.error('Error getting direct conversation', { 
        userId1, 
        userId2, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get group conversation messages
   * @param {string} groupId - Group ID
   * @param {string} userId - Requesting user ID
   * @param {Object} options - Pagination and filtering options
   * @returns {Promise<Object>} Group messages with pagination
   */
  async getGroupConversation(groupId, userId, options = {}) {
    try {
      const { page = 1, limit = 50, before = null } = options;
      const skip = (page - 1) * limit;

      // Verify user is group member
      const group = await Group.findById(groupId);
      if (!group || !group.members.includes(userId)) {
        throw new Error('Access denied to group conversation');
      }

      // Build query
      const query = { groupId };
      if (before) {
        query.timestamp = { $lt: new Date(before) };
      }

      // Get messages with pagination
      const [messages, totalCount] = await Promise.all([
        Message.find(query)
          .populate('sender', 'name profilePicture')
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Message.countDocuments(query)
      ]);

      // Mark messages as read for this user
      await this.markGroupMessagesAsRead(groupId, userId);

      const result = {
        messages: messages.reverse(), // Reverse to show oldest first
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        },
        groupId,
        groupName: group.name
      };

      logger.message('Retrieved group conversation', { 
        groupId, 
        userId, 
        messageCount: messages.length 
      });

      return result;
    } catch (error) {
      logger.error('Error getting group conversation', { 
        groupId, 
        userId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get user's conversation list
   * @param {string} userId - User ID
   * @returns {Promise<Array>} List of conversations
   */
  async getUserConversations(userId) {
    try {
      // Get direct conversations
      const directConversations = await Message.aggregate([
        {
          $match: {
            $or: [{ sender: userId }, { recipient: userId }],
            recipient: { $exists: true }
          }
        },
        {
          $sort: { timestamp: -1 }
        },
        {
          $group: {
            _id: '$conversationId',
            lastMessage: { $first: '$$ROOT' },
            unreadCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$recipient', userId] },
                      { $eq: ['$isRead', false] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'lastMessage.sender',
            foreignField: '_id',
            as: 'senderInfo'
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'lastMessage.recipient',
            foreignField: '_id',
            as: 'recipientInfo'
          }
        }
      ]);

      // Get group conversations
      const userGroups = await Group.find({
        members: userId,
        isActive: true
      }).select('_id name lastActivity');

      const groupConversations = await Promise.all(
        userGroups.map(async (group) => {
          const lastMessage = await Message.findOne({ groupId: group._id })
            .sort({ timestamp: -1 })
            .populate('sender', 'name profilePicture')
            .lean();

          const unreadCount = await Message.countDocuments({
            groupId: group._id,
            'readBy.user': { $ne: userId }
          });

          return {
            type: 'group',
            groupId: group._id,
            groupName: group.name,
            lastMessage,
            unreadCount,
            lastActivity: group.lastActivity
          };
        })
      );

      // Format direct conversations
      const formattedDirectConversations = directConversations.map(conv => {
        const otherUser = conv.senderInfo[0]._id.toString() === userId.toString() 
          ? conv.recipientInfo[0] 
          : conv.senderInfo[0];

        return {
          type: 'direct',
          conversationId: conv._id,
          otherUser: {
            _id: otherUser._id,
            name: otherUser.name,
            profilePicture: otherUser.profilePicture
          },
          lastMessage: conv.lastMessage,
          unreadCount: conv.unreadCount,
          lastActivity: conv.lastMessage.timestamp
        };
      });

      // Combine and sort by last activity
      const allConversations = [
        ...formattedDirectConversations,
        ...groupConversations
      ].sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

      logger.message('Retrieved user conversations', { 
        userId, 
        conversationCount: allConversations.length 
      });

      return allConversations;
    } catch (error) {
      logger.error('Error getting user conversations', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Mark direct messages as read
   * @param {string} readerId - User marking messages as read
   * @param {string} senderId - Original sender of messages
   */
  async markDirectMessagesAsRead(readerId, senderId) {
    try {
      const result = await Message.updateMany(
        {
          sender: senderId,
          recipient: readerId,
          isRead: false
        },
        {
          $set: {
            isRead: true,
            readAt: new Date()
          }
        }
      );

      logger.message('Marked direct messages as read', { 
        readerId, 
        senderId, 
        messageCount: result.modifiedCount 
      });

      return result.modifiedCount;
    } catch (error) {
      logger.error('Error marking direct messages as read', { 
        readerId, 
        senderId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Mark group messages as read
   * @param {string} groupId - Group ID
   * @param {string} userId - User marking messages as read
   */
  async markGroupMessagesAsRead(groupId, userId) {
    try {
      const result = await Message.updateMany(
        {
          groupId: groupId,
          'readBy.user': { $ne: userId }
        },
        {
          $addToSet: {
            readBy: {
              user: userId,
              readAt: new Date()
            }
          }
        }
      );

      logger.message('Marked group messages as read', { 
        groupId, 
        userId, 
        messageCount: result.modifiedCount 
      });

      return result.modifiedCount;
    } catch (error) {
      logger.error('Error marking group messages as read', { 
        groupId, 
        userId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Delete a message
   * @param {string} messageId - Message ID
   * @param {string} userId - User requesting deletion
   * @returns {Promise<boolean>} Deletion success
   */
  async deleteMessage(messageId, userId) {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Only sender can delete their message
      if (message.sender.toString() !== userId.toString()) {
        throw new Error('Only message sender can delete the message');
      }

      // Soft delete - mark as deleted instead of removing
      message.isDeleted = true;
      message.deletedAt = new Date();
      message.content = '[Message deleted]';
      message.attachments = [];
      await message.save();

      logger.message('Message deleted', { messageId, userId });

      return true;
    } catch (error) {
      logger.error('Error deleting message', { messageId, userId, error: error.message });
      throw error;
    }
  }

  /**
   * Search messages
   * @param {string} userId - User performing search
   * @param {Object} searchCriteria - Search parameters
   * @returns {Promise<Array>} Search results
   */
  async searchMessages(userId, searchCriteria) {
    try {
      const { query, groupId, conversationId, dateFrom, dateTo, limit = 20 } = searchCriteria;

      // Build search query
      const searchQuery = {
        $or: [
          { sender: userId },
          { recipient: userId },
          { groupId: { $in: await this.getUserGroupIds(userId) } }
        ],
        isDeleted: { $ne: true }
      };

      if (query) {
        searchQuery.content = { $regex: query, $options: 'i' };
      }

      if (groupId) {
        searchQuery.groupId = groupId;
      }

      if (conversationId) {
        searchQuery.conversationId = conversationId;
      }

      if (dateFrom || dateTo) {
        searchQuery.timestamp = {};
        if (dateFrom) searchQuery.timestamp.$gte = new Date(dateFrom);
        if (dateTo) searchQuery.timestamp.$lte = new Date(dateTo);
      }

      const messages = await Message.find(searchQuery)
        .populate('sender', 'name profilePicture')
        .populate('groupId', 'name')
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      logger.message('Message search completed', { 
        userId, 
        query, 
        resultCount: messages.length 
      });

      return messages;
    } catch (error) {
      logger.error('Error searching messages', { userId, error: error.message });
      throw error;
    }
  }

  // Private helper methods

  /**
   * Validate message content
   * @param {Object} messageData - Message data to validate
   */
  validateMessageContent(messageData) {
    if (!messageData.content && (!messageData.attachments || messageData.attachments.length === 0)) {
      throw new Error('Message must have content or attachments');
    }

    if (messageData.content && messageData.content.length > this.maxMessageLength) {
      throw new Error(`Message content exceeds maximum length of ${this.maxMessageLength} characters`);
    }

    if (messageData.attachments) {
      messageData.attachments.forEach(attachment => {
        if (attachment.size > this.maxFileSize) {
          throw new Error('File size exceeds maximum allowed size');
        }

        if (!this.allowedFileTypes.includes(attachment.mimeType)) {
          throw new Error('File type not allowed');
        }
      });
    }
  }

  /**
   * Check rate limiting for user
   * @param {string} userId - User ID to check
   */
  async checkRateLimit(userId) {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentMessageCount = await Message.countDocuments({
      sender: userId,
      timestamp: { $gte: oneMinuteAgo }
    });

    if (recentMessageCount >= this.maxMessagesPerMinute) {
      throw new Error('Rate limit exceeded. Please wait before sending more messages');
    }
  }

  /**
   * Validate direct message permissions
   * @param {Object} sender - Sender user object
   * @param {Object} recipient - Recipient user object
   */
  async validateDirectMessagePermissions(sender, recipient) {
    // Check if recipient has blocked the sender
    if (recipient.blockedUsers && recipient.blockedUsers.includes(sender._id)) {
      throw new Error('Unable to send message to this user');
    }

    // Check if sender has blocked the recipient
    if (sender.blockedUsers && sender.blockedUsers.includes(recipient._id)) {
      throw new Error('Cannot send message to blocked user');
    }
  }

  /**
   * Generate conversation ID for two users
   * @param {string} userId1 - First user ID
   * @param {string} userId2 - Second user ID
   * @returns {string} Conversation ID
   */
  generateConversationId(userId1, userId2) {
    return [userId1, userId2].sort().join('_');
  }

  /**
   * Update conversation metadata
   * @param {string} senderId - Sender ID
   * @param {string} recipientId - Recipient ID
   * @param {Object} message - Message object
   */
  async updateConversationMetadata(senderId, recipientId, message) {
    // Update both users' conversation lists
    await Promise.all([
      User.findByIdAndUpdate(senderId, {
        $addToSet: { conversations: recipientId },
        lastMessageTime: message.timestamp
      }),
      User.findByIdAndUpdate(recipientId, {
        $addToSet: { conversations: senderId },
        lastMessageTime: message.timestamp
      })
    ]);
  }

  /**
   * Get user's group IDs
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of group IDs
   */
  async getUserGroupIds(userId) {
    const user = await User.findById(userId).select('groups');
    return user.groups || [];
  }

  /**
   * Get list of users blocked by the current user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Blocked users
   */
  async getBlockedUsers(userId) {
    try {
      const user = await User.findById(userId).select('blockedUsers').populate('blockedUsers', 'name email profilePicture');
      return {
        success: true,
        blockedUsers: user?.blockedUsers || []
      };
    } catch (error) {
      logger.error('Error in getBlockedUsers service', { userId, error: error.message });
      return {
        success: false,
        message: 'Failed to get blocked users'
      };
    }
  }
/**
   * Edit a message (only by author, within 15 minutes)
   * @param {string} messageId - Message ID
   * @param {string} userId - User editing the message
   * @param {string} newContent - New message content
   * @returns {Promise<Object>} Updated message or error
   */
  async editMessage(messageId, userId, newContent) {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        return { success: false, message: 'Message not found' };
      }
      // Only author can edit
      if (message.sender.toString() !== userId.toString()) {
        return { success: false, message: 'You can only edit your own messages' };
      }
      // Only allow editing within 15 minutes
      const now = new Date();
      const createdAt = message.createdAt || message.timestamp;
      if (now - createdAt > 15 * 60 * 1000) {
        return { success: false, message: 'You can only edit messages within 15 minutes of sending' };
      }
      // Validate new content
      if (!newContent || typeof newContent !== 'string' || newContent.trim().length === 0) {
        return { success: false, message: 'Message content cannot be empty' };
      }
      if (newContent.length > this.maxMessageLength) {
        return { success: false, message: `Message cannot exceed ${this.maxMessageLength} characters` };
      }
      // Save original content if not already saved
      if (!message.originalContent) {
        message.originalContent = message.content;
      }
      message.content = newContent;
      message.isEdited = true;
      message.editedAt = now;
      await message.save();
      return { success: true, message };
    } catch (error) {
      logger.error('Error editing message', { messageId, userId, error: error.message });
      return { success: false, message: 'Failed to edit message' };
    }
  }

  /**
   * Add a reaction to a message
   * @param {string} messageId - Message ID
   * @param {string} userId - User adding the reaction
   * @param {string} emoji - Emoji to add
   * @returns {Promise<Object>} Result
   */
  async addReaction(messageId, userId, emoji) {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        return { success: false, message: 'Message not found' };
      }
      if (!emoji || typeof emoji !== 'string' || emoji.trim().length === 0) {
        return { success: false, message: 'Emoji is required' };
      }
      await message.addReaction(userId, emoji);
      return { success: true, message };
    } catch (error) {
      logger.error('Error adding reaction', { messageId, userId, emoji, error: error.message });
      return { success: false, message: 'Failed to add reaction' };
    }
  }

  /**
   * Remove a reaction from a message
   * @param {string} messageId - Message ID
   * @param {string} userId - User removing the reaction
   * @param {string} emoji - Emoji to remove
   * @returns {Promise<Object>} Result
   */
  async removeReaction(messageId, userId, emoji) {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        return { success: false, message: 'Message not found' };
      }
      if (!emoji || typeof emoji !== 'string' || emoji.trim().length === 0) {
        return { success: false, message: 'Emoji is required' };
      }
      await message.removeReaction(userId, emoji);
      return { success: true, message };
    } catch (error) {
      logger.error('Error removing reaction', { messageId, userId, emoji, error: error.message });
      return { success: false, message: 'Failed to remove reaction' };
    }
  }

  /**
   * Pin a message in a group chat
   * @param {string} messageId - Message ID
   * @param {string} userId - User pinning the message
   * @returns {Promise<Object>} Result
   */
  async pinMessage(messageId, userId) {
    try {
      const message = await Message.findById(messageId).populate('group');
      if (!message) {
        return { success: false, message: 'Message not found' };
      }
      if (message.messageType !== 'group' || !message.group) {
        return { success: false, message: 'Only group messages can be pinned' };
      }
      // Only group admin or creator can pin
      const group = message.group;
      if (!group.admins?.includes(userId) && group.creator.toString() !== userId.toString()) {
        return { success: false, message: 'Only group admin or creator can pin messages' };
      }
      message.pinned = true;
      message.pinnedAt = new Date();
      message.pinnedBy = userId;
      await message.save();
      return { success: true, message };
    } catch (error) {
      logger.error('Error pinning message', { messageId, userId, error: error.message });
      return { success: false, message: 'Failed to pin message' };
    }
  }

  /**
   * Unpin a message in a group chat
   * @param {string} messageId - Message ID
   * @param {string} userId - User unpinning the message
   * @returns {Promise<Object>} Result
   */
  async unpinMessage(messageId, userId) {
    try {
      const message = await Message.findById(messageId).populate('group');
      if (!message) {
        return { success: false, message: 'Message not found' };
      }
      if (message.messageType !== 'group' || !message.group) {
        return { success: false, message: 'Only group messages can be unpinned' };
      }
      // Only group admin or creator can unpin
      const group = message.group;
      if (!group.admins?.includes(userId) && group.creator.toString() !== userId.toString()) {
        return { success: false, message: 'Only group admin or creator can unpin messages' };
      }
      message.pinned = false;
      message.pinnedAt = undefined;
      message.pinnedBy = undefined;
      await message.save();
      return { success: true, message };
    } catch (error) {
      logger.error('Error unpinning message', { messageId, userId, error: error.message });
      return { success: false, message: 'Failed to unpin message' };
    }
  }

  /**
   * Handle typing indicator (placeholder for real-time integration)
   * @param {string} userId - User who is typing
   * @param {string} conversationType - 'direct' or 'group'
   * @param {string} conversationId - ID of the conversation
   * @param {boolean} isTyping - Typing state
   * @returns {Promise<Object>} Result
   */
  async sendTypingIndicator(userId, conversationType, conversationId, isTyping) {
    try {
      // In a real app, this would emit a websocket event to other users
      logger.message('Typing indicator', {
        userId,
        conversationType,
        conversationId,
        isTyping
      });
      // Optionally, store typing state in cache or DB for analytics
      return { success: true, message: 'Typing indicator received' };
    } catch (error) {
      logger.error('Error in sendTypingIndicator', { userId, conversationType, conversationId, error: error.message });
      return { success: false, message: 'Failed to handle typing indicator' };
    }
  }

  /**
   * Send a study session invitation as a message
   * @param {string} senderId - User sending the invite
   * @param {string} recipientId - User or group receiving the invite
   * @param {string} groupId - Group ID (optional)
   * @param {Object} sessionDetails - Details of the study session
   * @returns {Promise<Object>} Result
   */
  async sendStudyInvite(senderId, recipientId, groupId, sessionDetails) {
    try {
      if (!sessionDetails || !sessionDetails.subject || !sessionDetails.date) {
        return { success: false, message: 'Session subject and date are required' };
      }
      let message;
      if (groupId) {
        // Group invite
        const group = await Group.findById(groupId);
        if (!group) {
          return { success: false, message: 'Group not found' };
        }
        if (!group.members.includes(senderId)) {
          return { success: false, message: 'You are not a member of this group' };
        }
        message = new Message({
          sender: senderId,
          group: groupId,
          messageType: 'group',
          contentType: 'study_invite',
          content: `Study Session Invite: ${sessionDetails.subject}`,
          attachments: [],
          sessionDetails,
          timestamp: new Date()
        });
      } else {
        // Direct invite
        const recipient = await User.findById(recipientId);
        if (!recipient) {
          return { success: false, message: 'Recipient not found' };
        }
        message = new Message({
          sender: senderId,
          recipient: recipientId,
          messageType: 'direct',
          contentType: 'study_invite',
          content: `Study Session Invite: ${sessionDetails.subject}`,
          attachments: [],
          sessionDetails,
          timestamp: new Date()
        });
      }
      await message.save();
      return { success: true, message };
    } catch (error) {
      logger.error('Error sending study invite', { senderId, recipientId, groupId, error: error.message });
      return { success: false, message: 'Failed to send study invite' };
    }
  }

  /**
   * Respond to a study session invitation
   * @param {string} userId - User responding
   * @param {string} inviteId - Message ID of the invite
   * @param {string} response - 'accept', 'decline', or 'maybe'
   * @param {string} message - Optional response message
   * @returns {Promise<Object>} Result
   */
  async respondToStudyInvite(userId, inviteId, response, messageText) {
    try {
      const inviteMessage = await Message.findById(inviteId);
      if (!inviteMessage || inviteMessage.contentType !== 'study_invite') {
        return { success: false, message: 'Study invite not found' };
      }
      if (!['accept', 'decline', 'maybe'].includes(response)) {
        return { success: false, message: 'Invalid response type' };
      }
      // Store response as a reply message
      const reply = new Message({
        sender: userId,
        messageType: inviteMessage.messageType,
        group: inviteMessage.group,
        recipient: inviteMessage.recipient,
        contentType: 'study_invite_response',
        content: `Study invite response: ${response}` + (messageText ? ` - ${messageText}` : ''),
        replyTo: inviteId,
        timestamp: new Date()
      });
      await reply.save();
      return { success: true, reply };
    } catch (error) {
      logger.error('Error responding to study invite', { userId, inviteId, error: error.message });
      return { success: false, message: 'Failed to respond to study invite' };
    }
  }

  /**
   * Get messaging statistics for a user
   * @param {string} userId - User ID
   * @param {string} [period] - Optional period (week, month, semester, all)
   * @returns {Promise<Object>} Stats
   */
  async getMessageStats(userId, period) {
    try {
      const now = new Date();
      let fromDate;
      if (period === 'week') {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      } else if (period === 'month') {
        fromDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      } else if (period === 'semester') {
        fromDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      }
      const match = {
        $or: [
          { sender: userId },
          { recipient: userId },
          { 'group.members': userId }
        ]
      };
      if (fromDate) {
        match.createdAt = { $gte: fromDate };
      }
      // Aggregate stats
      const [sentCount, receivedCount, groupCount] = await Promise.all([
        Message.countDocuments({ sender: userId, ...(fromDate && { createdAt: { $gte: fromDate } }) }),
        Message.countDocuments({ recipient: userId, ...(fromDate && { createdAt: { $gte: fromDate } }) }),
        Message.countDocuments({ messageType: 'group', ...(fromDate && { createdAt: { $gte: fromDate } }), 'readBy.user': userId })
      ]);
      return {
        success: true,
        stats: {
          sent: sentCount,
          received: receivedCount,
          group: groupCount,
          period: period || 'all'
        }
      };
    } catch (error) {
      logger.error('Error getting message stats', { userId, error: error.message });
      return { success: false, message: 'Failed to get message stats' };
    }
  }

  /**
   * Block a user from messaging
   * @param {string} userId - User performing the block
   * @param {string} blockUserId - User to block
   * @returns {Promise<Object>} Result
   */
  async blockUser(userId, blockUserId) {
    try {
      if (userId === blockUserId) {
        return { success: false, message: 'You cannot block yourself' };
      }
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, message: 'User not found' };
      }
      if (user.blockedUsers && user.blockedUsers.includes(blockUserId)) {
        return { success: false, message: 'User already blocked' };
      }
      user.blockedUsers = user.blockedUsers || [];
      user.blockedUsers.push(blockUserId);
      await user.save();
      return { success: true, message: 'User blocked successfully' };
    } catch (error) {
      logger.error('Error blocking user', { userId, blockUserId, error: error.message });
      return { success: false, message: 'Failed to block user' };
    }
  }

  /**
   * Unblock a user
   * @param {string} userId - User performing the unblock
   * @param {string} unblockUserId - User to unblock
   * @returns {Promise<Object>} Result
   */
  async unblockUser(userId, unblockUserId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, message: 'User not found' };
      }
      user.blockedUsers = user.blockedUsers || [];
      const index = user.blockedUsers.indexOf(unblockUserId);
      if (index === -1) {
        return { success: false, message: 'User is not blocked' };
      }
      user.blockedUsers.splice(index, 1);
      await user.save();
      return { success: true, message: 'User unblocked successfully' };
    } catch (error) {
      logger.error('Error unblocking user', { userId, unblockUserId, error: error.message });
      return { success: false, message: 'Failed to unblock user' };
    }
  }
}

module.exports = new MessageService();