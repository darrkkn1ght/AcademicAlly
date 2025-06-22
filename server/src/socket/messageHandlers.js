// Real-time message handling for Socket.io - AcademicAlly
const Message = require('../models/Message');
const User = require('../models/User');
const Group = require('../models/Group');
const messageService = require('../services/messageService');
const { SOCKET_CONSTANTS, MESSAGE_CONSTANTS, ERROR_MESSAGES, SUCCESS_MESSAGES } = require('../utils/constants');
const logger = require('../utils/logger');

class MessageHandlers {
  constructor(io) {
    this.io = io;
    this.typingUsers = new Map(); // Track typing users
    this.userConnections = new Map(); // Track user socket connections
  }

  // Initialize message handlers for a socket connection
  initializeHandlers(socket) {
    // Message sending handlers
    socket.on(SOCKET_CONSTANTS.EVENTS.SEND_MESSAGE, (data) => this.handleSendMessage(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.MESSAGE_DELIVERED, (data) => this.handleMessageDelivered(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.MESSAGE_READ, (data) => this.handleMessageRead(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.MESSAGE_EDITED, (data) => this.handleEditMessage(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.MESSAGE_DELETED, (data) => this.handleDeleteMessage(socket, data));

    // Typing indicators
    socket.on(SOCKET_CONSTANTS.EVENTS.USER_TYPING, (data) => this.handleUserTyping(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.USER_STOPPED_TYPING, (data) => this.handleUserStoppedTyping(socket, data));

    // Conversation management
    socket.on('join_conversation', (data) => this.handleJoinConversation(socket, data));
    socket.on('leave_conversation', (data) => this.handleLeaveConversation(socket, data));

    // Message history and pagination
    socket.on('get_message_history', (data) => this.handleGetMessageHistory(socket, data));
    socket.on('mark_conversation_read', (data) => this.handleMarkConversationRead(socket, data));

    // File attachments
    socket.on('send_file_message', (data) => this.handleSendFileMessage(socket, data));

    // Message reactions
    socket.on('add_reaction', (data) => this.handleAddReaction(socket, data));
    socket.on('remove_reaction', (data) => this.handleRemoveReaction(socket, data));

    // Connection tracking
    this.trackUserConnection(socket);
  }

  // Track user connections for presence and delivery
  trackUserConnection(socket) {
    const userId = socket.user.id;
    
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId).add(socket.id);

    socket.on('disconnect', () => {
      this.handleUserDisconnect(socket);
    });
  }

  // Handle user disconnect
  handleUserDisconnect(socket) {
    const userId = socket.user.id;
    
    if (this.userConnections.has(userId)) {
      this.userConnections.get(userId).delete(socket.id);
      
      // If no more connections, remove user from tracking
      if (this.userConnections.get(userId).size === 0) {
        this.userConnections.delete(userId);
        
        // Clear any typing indicators
        this.clearUserTyping(userId);
      }
    }
  }

  // Handle sending a message
  async handleSendMessage(socket, data) {
    try {
      const { recipientId, groupId, content, messageType = MESSAGE_CONSTANTS.TYPES.TEXT, attachments = [] } = data;
      const senderId = socket.user.id;

      // Validate input
      if (!content || content.trim().length === 0) {
        socket.emit('message_error', { error: ERROR_MESSAGES.MESSAGE.EMPTY_MESSAGE });
        return;
      }

      if (content.length > MESSAGE_CONSTANTS.CONSTRAINTS.CONTENT_MAX_LENGTH) {
        socket.emit('message_error', { error: ERROR_MESSAGES.MESSAGE.TOO_LONG });
        return;
      }

      // Validate recipient or group
      let isGroupMessage = false;
      let conversationId;
      
      if (groupId) {
        // Group message
        const group = await Group.findById(groupId);
        if (!group) {
          socket.emit('message_error', { error: ERROR_MESSAGES.GROUP.NOT_FOUND });
          return;
        }

        // Check if user is member of group
        if (!group.members.includes(senderId)) {
          socket.emit('message_error', { error: ERROR_MESSAGES.GROUP.NOT_AUTHORIZED });
          return;
        }

        isGroupMessage = true;
        conversationId = `group_${groupId}`;
      } else if (recipientId) {
        // Direct message
        const recipient = await User.findById(recipientId);
        if (!recipient) {
          socket.emit('message_error', { error: ERROR_MESSAGES.USER.NOT_FOUND });
          return;
        }

        // Generate conversation ID (consistent ordering)
        const ids = [senderId, recipientId].sort();
        conversationId = `dm_${ids[0]}_${ids[1]}`;
      } else {
        socket.emit('message_error', { error: 'Either recipientId or groupId is required' });
        return;
      }

      // Create message using service
      const messageData = {
        sender: senderId,
        recipient: recipientId,
        groupId: groupId,
        content: content.trim(),
        messageType,
        attachments,
        conversationId
      };

      const message = await messageService.createMessage(messageData);
      
      // Populate sender info
      await message.populate('sender', 'name profilePicture university major');
      
      const messageResponse = {
        _id: message._id,
        sender: message.sender,
        recipient: message.recipient,
        groupId: message.groupId,
        content: message.content,
        messageType: message.messageType,
        attachments: message.attachments,
        conversationId: message.conversationId,
        timestamp: message.timestamp,
        status: MESSAGE_CONSTANTS.STATUS.SENT,
        isRead: message.isRead
      };

      // Emit to sender (confirmation)
      socket.emit(SOCKET_CONSTANTS.EVENTS.NEW_MESSAGE, {
        ...messageResponse,
        status: MESSAGE_CONSTANTS.STATUS.SENT
      });

      // Emit to recipients
      if (isGroupMessage) {
        // Group message - emit to all group members except sender
        const group = await Group.findById(groupId).populate('members', '_id');
        const memberIds = group.members.map(member => member._id.toString()).filter(id => id !== senderId);
        
        memberIds.forEach(memberId => {
          this.emitToUser(memberId, SOCKET_CONSTANTS.EVENTS.NEW_MESSAGE, {
            ...messageResponse,
            status: MESSAGE_CONSTANTS.STATUS.DELIVERED
          });
        });

        // Emit to group room
        socket.to(`${SOCKET_CONSTANTS.ROOMS.GROUP}${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.GROUP_MESSAGE, messageResponse);
        
      } else {
        // Direct message - emit to recipient
        this.emitToUser(recipientId, SOCKET_CONSTANTS.EVENTS.NEW_MESSAGE, {
          ...messageResponse,
          status: MESSAGE_CONSTANTS.STATUS.DELIVERED
        });
      }

      // Clear typing indicator
      this.clearUserTyping(senderId, conversationId);

      logger.info(`Message sent: ${message._id} from ${senderId} to ${recipientId || `group ${groupId}`}`);

    } catch (error) {
      logger.error('Error sending message:', error);
      socket.emit('message_error', { error: ERROR_MESSAGES.GENERAL.SERVER_ERROR });
    }
  }

  // Handle message delivered confirmation
  async handleMessageDelivered(socket, data) {
    try {
      const { messageId } = data;
      const userId = socket.user.id;

      const message = await messageService.markAsDelivered(messageId, userId);
      
      if (message) {
        // Notify sender about delivery
        this.emitToUser(message.sender.toString(), SOCKET_CONSTANTS.EVENTS.MESSAGE_DELIVERED, {
          messageId,
          deliveredTo: userId,
          timestamp: new Date()
        });
      }

    } catch (error) {
      logger.error('Error marking message as delivered:', error);
    }
  }

  // Handle message read confirmation
  async handleMessageRead(socket, data) {
    try {
      const { messageId, conversationId } = data;
      const userId = socket.user.id;

      const message = await messageService.markAsRead(messageId, userId);
      
      if (message) {
        // Notify sender about read receipt
        this.emitToUser(message.sender.toString(), SOCKET_CONSTANTS.EVENTS.MESSAGE_READ, {
          messageId,
          readBy: userId,
          timestamp: new Date()
        });

        // If it's a conversation, mark all previous messages as read too
        if (conversationId) {
          await messageService.markConversationAsRead(conversationId, userId);
        }
      }

    } catch (error) {
      logger.error('Error marking message as read:', error);
    }
  }

  // Handle message editing
  async handleEditMessage(socket, data) {
    try {
      const { messageId, newContent } = data;
      const userId = socket.user.id;

      if (!newContent || newContent.trim().length === 0) {
        socket.emit('message_error', { error: ERROR_MESSAGES.MESSAGE.EMPTY_MESSAGE });
        return;
      }

      if (newContent.length > MESSAGE_CONSTANTS.CONSTRAINTS.CONTENT_MAX_LENGTH) {
        socket.emit('message_error', { error: ERROR_MESSAGES.MESSAGE.TOO_LONG });
        return;
      }

      const message = await messageService.editMessage(messageId, userId, newContent.trim());
      
      if (!message) {
        socket.emit('message_error', { error: ERROR_MESSAGES.MESSAGE.NOT_FOUND });
        return;
      }

      await message.populate('sender', 'name profilePicture');

      const editedMessage = {
        _id: message._id,
        sender: message.sender,
        content: message.content,
        isEdited: true,
        editedAt: message.editedAt,
        conversationId: message.conversationId
      };

      // Emit to sender
      socket.emit(SOCKET_CONSTANTS.EVENTS.MESSAGE_EDITED, editedMessage);

      // Emit to recipients
      if (message.groupId) {
        socket.to(`${SOCKET_CONSTANTS.ROOMS.GROUP}${message.groupId}`).emit(SOCKET_CONSTANTS.EVENTS.MESSAGE_EDITED, editedMessage);
      } else if (message.recipient) {
        this.emitToUser(message.recipient.toString(), SOCKET_CONSTANTS.EVENTS.MESSAGE_EDITED, editedMessage);
      }

      logger.info(`Message edited: ${messageId} by ${userId}`);

    } catch (error) {
      logger.error('Error editing message:', error);
      
      if (error.message === 'Edit time expired') {
        socket.emit('message_error', { error: ERROR_MESSAGES.MESSAGE.EDIT_TIME_EXPIRED });
      } else if (error.message === 'Unauthorized') {
        socket.emit('message_error', { error: ERROR_MESSAGES.MESSAGE.CANNOT_EDIT });
      } else {
        socket.emit('message_error', { error: ERROR_MESSAGES.GENERAL.SERVER_ERROR });
      }
    }
  }

  // Handle message deletion
  async handleDeleteMessage(socket, data) {
    try {
      const { messageId } = data;
      const userId = socket.user.id;

      const message = await messageService.deleteMessage(messageId, userId);
      
      if (!message) {
        socket.emit('message_error', { error: ERROR_MESSAGES.MESSAGE.NOT_FOUND });
        return;
      }

      const deletedMessage = {
        _id: messageId,
        conversationId: message.conversationId,
        deletedAt: new Date()
      };

      // Emit to sender
      socket.emit(SOCKET_CONSTANTS.EVENTS.MESSAGE_DELETED, deletedMessage);

      // Emit to recipients
      if (message.groupId) {
        socket.to(`${SOCKET_CONSTANTS.ROOMS.GROUP}${message.groupId}`).emit(SOCKET_CONSTANTS.EVENTS.MESSAGE_DELETED, deletedMessage);
      } else if (message.recipient) {
        this.emitToUser(message.recipient.toString(), SOCKET_CONSTANTS.EVENTS.MESSAGE_DELETED, deletedMessage);
      }

      logger.info(`Message deleted: ${messageId} by ${userId}`);

    } catch (error) {
      logger.error('Error deleting message:', error);
      
      if (error.message === 'Unauthorized') {
        socket.emit('message_error', { error: ERROR_MESSAGES.MESSAGE.CANNOT_EDIT });
      } else {
        socket.emit('message_error', { error: ERROR_MESSAGES.GENERAL.SERVER_ERROR });
      }
    }
  }

  // Handle user typing indicator
  handleUserTyping(socket, data) {
    try {
      const { conversationId, recipientId, groupId } = data;
      const userId = socket.user.id;
      const userName = socket.user.name;

      const typingKey = `${conversationId}_${userId}`;
      
      // Set typing indicator
      this.typingUsers.set(typingKey, {
        userId,
        userName,
        conversationId,
        timestamp: Date.now()
      });

      // Emit typing indicator
      if (groupId) {
        socket.to(`${SOCKET_CONSTANTS.ROOMS.GROUP}${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.USER_TYPING, {
          userId,
          userName,
          conversationId
        });
      } else if (recipientId) {
        this.emitToUser(recipientId, SOCKET_CONSTANTS.EVENTS.USER_TYPING, {
          userId,
          userName,
          conversationId
        });
      }

      // Auto-clear after timeout
      setTimeout(() => {
        this.clearUserTyping(userId, conversationId);
      }, SOCKET_CONSTANTS.TYPING.TIMEOUT);

    } catch (error) {
      logger.error('Error handling typing indicator:', error);
    }
  }

  // Handle user stopped typing
  handleUserStoppedTyping(socket, data) {
    try {
      const { conversationId, recipientId, groupId } = data;
      const userId = socket.user.id;

      this.clearUserTyping(userId, conversationId);

      // Emit stopped typing
      if (groupId) {
        socket.to(`${SOCKET_CONSTANTS.ROOMS.GROUP}${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.USER_STOPPED_TYPING, {
          userId,
          conversationId
        });
      } else if (recipientId) {
        this.emitToUser(recipientId, SOCKET_CONSTANTS.EVENTS.USER_STOPPED_TYPING, {
          userId,
          conversationId
        });
      }

    } catch (error) {
      logger.error('Error handling stopped typing:', error);
    }
  }

  // Clear typing indicator for user
  clearUserTyping(userId, conversationId = null) {
    if (conversationId) {
      const typingKey = `${conversationId}_${userId}`;
      this.typingUsers.delete(typingKey);
    } else {
      // Clear all typing indicators for user
      for (const [key, value] of this.typingUsers.entries()) {
        if (value.userId === userId) {
          this.typingUsers.delete(key);
        }
      }
    }
  }

  // Handle joining a conversation
  async handleJoinConversation(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.user.id;

      // Join the conversation room
      socket.join(`${SOCKET_CONSTANTS.ROOMS.CONVERSATION}${conversationId}`);
      
      socket.emit('conversation_joined', { conversationId });
      
      logger.info(`User ${userId} joined conversation ${conversationId}`);

    } catch (error) {
      logger.error('Error joining conversation:', error);
      socket.emit('conversation_error', { error: ERROR_MESSAGES.GENERAL.SERVER_ERROR });
    }
  }

  // Handle leaving a conversation
  handleLeaveConversation(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.user.id;

      // Leave the conversation room
      socket.leave(`${SOCKET_CONSTANTS.ROOMS.CONVERSATION}${conversationId}`);
      
      // Clear typing indicators
      this.clearUserTyping(userId, conversationId);
      
      socket.emit('conversation_left', { conversationId });
      
      logger.info(`User ${userId} left conversation ${conversationId}`);

    } catch (error) {
      logger.error('Error leaving conversation:', error);
    }
  }

  // Handle getting message history
  async handleGetMessageHistory(socket, data) {
    try {
      const { conversationId, page = 1, limit = 20, before = null } = data;
      const userId = socket.user.id;

      const messages = await messageService.getMessageHistory(conversationId, userId, { page, limit, before });
      
      socket.emit('message_history', {
        conversationId,
        messages,
        page,
        hasMore: messages.length === limit
      });

    } catch (error) {
      logger.error('Error getting message history:', error);
      socket.emit('message_history_error', { error: ERROR_MESSAGES.GENERAL.SERVER_ERROR });
    }
  }

  // Handle marking entire conversation as read
  async handleMarkConversationRead(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.user.id;

      await messageService.markConversationAsRead(conversationId, userId);
      
      socket.emit('conversation_marked_read', { conversationId });

    } catch (error) {
      logger.error('Error marking conversation as read:', error);
    }
  }

  // Handle sending file message
  async handleSendFileMessage(socket, data) {
    try {
      const { recipientId, groupId, fileData, caption = '' } = data;
      
      // Validate file data
      if (!fileData || !fileData.url || !fileData.type) {
        socket.emit('message_error', { error: 'Invalid file data' });
        return;
      }

      // Create message with file attachment
      const messageData = {
        recipientId,
        groupId,
        content: caption,
        messageType: MESSAGE_CONSTANTS.TYPES.FILE,
        attachments: [fileData]
      };

      await this.handleSendMessage(socket, messageData);

    } catch (error) {
      logger.error('Error sending file message:', error);
      socket.emit('message_error', { error: ERROR_MESSAGES.GENERAL.SERVER_ERROR });
    }
  }

  // Handle adding reaction to message
  async handleAddReaction(socket, data) {
    try {
      const { messageId, emoji } = data;
      const userId = socket.user.id;

      const message = await messageService.addReaction(messageId, userId, emoji);
      
      if (message) {
        const reactionData = {
          messageId,
          emoji,
          userId,
          userName: socket.user.name
        };

        // Emit to conversation participants
        if (message.groupId) {
          this.io.to(`${SOCKET_CONSTANTS.ROOMS.GROUP}${message.groupId}`).emit('reaction_added', reactionData);
        } else {
          this.emitToUser(message.sender.toString(), 'reaction_added', reactionData);
          if (message.recipient) {
            this.emitToUser(message.recipient.toString(), 'reaction_added', reactionData);
          }
        }
      }

    } catch (error) {
      logger.error('Error adding reaction:', error);
    }
  }

  // Handle removing reaction from message
  async handleRemoveReaction(socket, data) {
    try {
      const { messageId, emoji } = data;
      const userId = socket.user.id;

      const message = await messageService.removeReaction(messageId, userId, emoji);
      
      if (message) {
        const reactionData = {
          messageId,
          emoji,
          userId
        };

        // Emit to conversation participants
        if (message.groupId) {
          this.io.to(`${SOCKET_CONSTANTS.ROOMS.GROUP}${message.groupId}`).emit('reaction_removed', reactionData);
        } else {
          this.emitToUser(message.sender.toString(), 'reaction_removed', reactionData);
          if (message.recipient) {
            this.emitToUser(message.recipient.toString(), 'reaction_removed', reactionData);
          }
        }
      }

    } catch (error) {
      logger.error('Error removing reaction:', error);
    }
  }

  // Emit event to specific user (all their connections)
  emitToUser(userId, event, data) {
    if (this.userConnections.has(userId)) {
      const userSockets = this.userConnections.get(userId);
      userSockets.forEach(socketId => {
        this.io.to(socketId).emit(event, data);
      });
    }
  }

  // Clean up expired typing indicators
  cleanupTypingIndicators() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, value] of this.typingUsers.entries()) {
      if (now - value.timestamp > SOCKET_CONSTANTS.TYPING.TIMEOUT) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.typingUsers.delete(key));
  }

  // Get active typing users for a conversation
  getTypingUsers(conversationId) {
    const typingUsers = [];
    
    for (const [key, value] of this.typingUsers.entries()) {
      if (value.conversationId === conversationId) {
        typingUsers.push({
          userId: value.userId,
          userName: value.userName
        });
      }
    }

    return typingUsers;
  }
}

module.exports = MessageHandlers;