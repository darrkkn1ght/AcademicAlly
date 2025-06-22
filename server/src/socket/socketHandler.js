const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Group = require('../models/Group');
const Message = require('../models/Message');
const logger = require('../utils/logger');

// Import specialized handlers
const messageHandlers = require('./messageHandlers');
const groupHandlers = require('./groupHandlers');

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // userId -> { socketId, userData, rooms }
    this.userRooms = new Map(); // userId -> Set of room names
    this.roomUsers = new Map(); // roomName -> Set of user IDs
    
    this.setupSocketAuthentication();
    this.setupConnectionHandling();
    this.setupDisconnectionHandling();
    this.setupHeartbeat();
  }

  // Socket authentication middleware
  setupSocketAuthentication() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          logger.warn(`Socket connection rejected: No token provided from ${socket.handshake.address}`);
          return next(new Error('Authentication error: No token provided'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const user = await User.findById(decoded.userId).select('-password');
        if (!user) {
          logger.warn(`Socket connection rejected: User not found for token ${decoded.userId}`);
          return next(new Error('Authentication error: User not found'));
        }

        // Check if user is active/not banned
        if (user.status === 'banned' || user.status === 'suspended') {
          logger.warn(`Socket connection rejected: User ${user._id} is ${user.status}`);
          return next(new Error('Authentication error: Account suspended'));
        }

        // Attach user data to socket
        socket.userId = user._id.toString();
        socket.userData = {
          id: user._id,
          name: user.name,
          university: user.university,
          profilePicture: user.profilePicture,
          status: 'online'
        };

        logger.info(`Socket authenticated: User ${user.name} (${user._id})`);
        next();
      } catch (error) {
        logger.error('Socket authentication error:', error);
        next(new Error('Authentication error: Invalid token'));
      }
    });
  }

  // Handle new socket connections
  setupConnectionHandling() {
    this.io.on('connection', (socket) => {
      this.handleUserConnect(socket);
      this.setupSocketEventHandlers(socket);
    });
  }

  // Handle user connection
  async handleUserConnect(socket) {
    const userId = socket.userId;
    const userData = socket.userData;

    try {
      // Update user's online status
      await User.findByIdAndUpdate(userId, {
        lastSeen: new Date(),
        isOnline: true
      });

      // Store connection info
      this.connectedUsers.set(userId, {
        socketId: socket.id,
        userData: userData,
        rooms: new Set(),
        lastActivity: new Date()
      });

      // Initialize user rooms set
      this.userRooms.set(userId, new Set());

      // Join user to their personal room for direct messages
      const personalRoom = `user_${userId}`;
      socket.join(personalRoom);
      
      // Get user's active groups and join those rooms
      const userGroups = await Group.find({ 
        members: userId, 
        isActive: true 
      }).select('_id name');

      for (const group of userGroups) {
        const groupRoom = `group_${group._id}`;
        socket.join(groupRoom);
        this.addUserToRoom(userId, groupRoom);
        
        // Notify group members that user is online
        socket.to(groupRoom).emit('user_status_change', {
          userId: userId,
          userData: userData,
          status: 'online',
          timestamp: new Date()
        });
      }

      // Get user's active conversations and join those rooms
      const conversations = await Message.distinct('conversationId', {
        $or: [{ sender: userId }, { recipient: userId }],
        messageType: 'direct'
      });

      for (const conversationId of conversations) {
        const conversationRoom = `conversation_${conversationId}`;
        socket.join(conversationRoom);
        this.addUserToRoom(userId, conversationRoom);
      }

      // Emit connection success
      socket.emit('connected', {
        message: 'Connected successfully',
        userId: userId,
        userData: userData,
        rooms: Array.from(this.userRooms.get(userId) || []),
        timestamp: new Date()
      });

      // Notify friends/matches that user is online
      await this.notifyUserStatusChange(userId, 'online');

      logger.info(`User connected: ${userData.name} (${userId}) - Socket: ${socket.id}`);
    } catch (error) {
      logger.error(`Error handling user connection for ${userId}:`, error);
      socket.emit('connection_error', { message: 'Failed to establish connection' });
    }
  }

  // Setup all socket event handlers
  setupSocketEventHandlers(socket) {
    // Message handlers
    messageHandlers.setupMessageHandlers(socket, this);

    // Group handlers  
    groupHandlers.setupGroupHandlers(socket, this);

    // General handlers
    this.setupGeneralHandlers(socket);

    // Error handler
    socket.on('error', (error) => {
      logger.error(`Socket error for user ${socket.userId}:`, error);
      socket.emit('error', { message: 'Socket error occurred' });
    });
  }

  // Setup general socket handlers
  setupGeneralHandlers(socket) {
    // Heartbeat/ping handler
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
      this.updateUserActivity(socket.userId);
    });

    // User typing indicators
    socket.on('typing_start', (data) => {
      this.handleTypingStart(socket, data);
    });

    socket.on('typing_stop', (data) => {
      this.handleTypingStop(socket, data);
    });

    // User status updates
    socket.on('status_update', (data) => {
      this.handleStatusUpdate(socket, data);
    });

    // Join/leave room handlers
    socket.on('join_room', (data) => {
      this.handleJoinRoom(socket, data);
    });

    socket.on('leave_room', (data) => {
      this.handleLeaveRoom(socket, data);
    });

    // User presence
    socket.on('get_online_users', (data) => {
      this.handleGetOnlineUsers(socket, data);
    });
  }

  // Handle user disconnection
  setupDisconnectionHandling() {
    this.io.on('disconnect', (socket) => {
      this.handleUserDisconnect(socket);
    });
  }

  // Handle user disconnect
  async handleUserDisconnect(socket) {
    const userId = socket.userId;
    
    if (!userId) return;

    try {
      // Update user's offline status
      await User.findByIdAndUpdate(userId, {
        lastSeen: new Date(),
        isOnline: false
      });

      // Get user's rooms before cleanup
      const userRooms = this.userRooms.get(userId) || new Set();

      // Notify rooms that user went offline
      for (const room of userRooms) {
        socket.to(room).emit('user_status_change', {
          userId: userId,
          status: 'offline',
          timestamp: new Date()
        });
        
        // Remove user from room tracking
        this.removeUserFromRoom(userId, room);
      }

      // Cleanup user data
      this.connectedUsers.delete(userId);
      this.userRooms.delete(userId);

      // Notify friends/matches that user is offline
      await this.notifyUserStatusChange(userId, 'offline');

      logger.info(`User disconnected: ${userId} - Socket: ${socket.id}`);
    } catch (error) {
      logger.error(`Error handling user disconnection for ${userId}:`, error);
    }
  }

  // Typing indicators
  handleTypingStart(socket, data) {
    const { roomId, conversationId } = data;
    const room = roomId || `conversation_${conversationId}`;
    
    socket.to(room).emit('user_typing', {
      userId: socket.userId,
      userData: socket.userData,
      isTyping: true,
      timestamp: new Date()
    });

    this.updateUserActivity(socket.userId);
  }

  handleTypingStop(socket, data) {
    const { roomId, conversationId } = data;
    const room = roomId || `conversation_${conversationId}`;
    
    socket.to(room).emit('user_typing', {
      userId: socket.userId,
      userData: socket.userData,
      isTyping: false,
      timestamp: new Date()
    });
  }

  // Status updates
  async handleStatusUpdate(socket, data) {
    const { status } = data;
    const allowedStatuses = ['online', 'away', 'busy', 'offline'];
    
    if (!allowedStatuses.includes(status)) {
      socket.emit('error', { message: 'Invalid status' });
      return;
    }

    try {
      // Update user status in database
      await User.findByIdAndUpdate(socket.userId, {
        status: status,
        lastSeen: new Date()
      });

      // Update in memory
      const userConnection = this.connectedUsers.get(socket.userId);
      if (userConnection) {
        userConnection.userData.status = status;
      }

      // Broadcast status change
      await this.notifyUserStatusChange(socket.userId, status);

      socket.emit('status_updated', { status, timestamp: new Date() });
    } catch (error) {
      logger.error(`Error updating status for user ${socket.userId}:`, error);
      socket.emit('error', { message: 'Failed to update status' });
    }
  }

  // Room management
  handleJoinRoom(socket, data) {
    const { roomId } = data;
    
    if (!roomId) {
      socket.emit('error', { message: 'Room ID required' });
      return;
    }

    socket.join(roomId);
    this.addUserToRoom(socket.userId, roomId);
    
    socket.emit('room_joined', { roomId, timestamp: new Date() });
    socket.to(roomId).emit('user_joined_room', {
      userId: socket.userId,
      userData: socket.userData,
      roomId,
      timestamp: new Date()
    });
  }

  handleLeaveRoom(socket, data) {
    const { roomId } = data;
    
    if (!roomId) {
      socket.emit('error', { message: 'Room ID required' });
      return;
    }

    socket.leave(roomId);
    this.removeUserFromRoom(socket.userId, roomId);
    
    socket.emit('room_left', { roomId, timestamp: new Date() });
    socket.to(roomId).emit('user_left_room', {
      userId: socket.userId,
      userData: socket.userData,
      roomId,
      timestamp: new Date()
    });
  }

  // Get online users
  handleGetOnlineUsers(socket, data) {
    const { roomId } = data;
    
    if (roomId) {
      const roomUsers = this.roomUsers.get(roomId) || new Set();
      const onlineUsers = [];
      
      for (const userId of roomUsers) {
        const userConnection = this.connectedUsers.get(userId);
        if (userConnection) {
          onlineUsers.push({
            userId,
            userData: userConnection.userData,
            lastActivity: userConnection.lastActivity
          });
        }
      }
      
      socket.emit('online_users', { roomId, users: onlineUsers });
    } else {
      // Get all online users (for admin or debugging)
      const allOnlineUsers = [];
      for (const [userId, connection] of this.connectedUsers) {
        allOnlineUsers.push({
          userId,
          userData: connection.userData,
          lastActivity: connection.lastActivity
        });
      }
      
      socket.emit('online_users', { users: allOnlineUsers });
    }
  }

  // Utility methods
  addUserToRoom(userId, roomId) {
    const userRooms = this.userRooms.get(userId) || new Set();
    userRooms.add(roomId);
    this.userRooms.set(userId, userRooms);

    const roomUsers = this.roomUsers.get(roomId) || new Set();
    roomUsers.add(userId);
    this.roomUsers.set(roomId, roomUsers);
  }

  removeUserFromRoom(userId, roomId) {
    const userRooms = this.userRooms.get(userId);
    if (userRooms) {
      userRooms.delete(roomId);
    }

    const roomUsers = this.roomUsers.get(roomId);
    if (roomUsers) {
      roomUsers.delete(userId);
      if (roomUsers.size === 0) {
        this.roomUsers.delete(roomId);
      }
    }
  }

  updateUserActivity(userId) {
    const userConnection = this.connectedUsers.get(userId);
    if (userConnection) {
      userConnection.lastActivity = new Date();
    }
  }

  async notifyUserStatusChange(userId, status) {
    try {
      // Get user's matches and group members to notify
      const userGroups = await Group.find({ members: userId }).select('members');
      const notifyUsers = new Set();

      // Add group members
      for (const group of userGroups) {
        for (const memberId of group.members) {
          if (memberId.toString() !== userId) {
            notifyUsers.add(memberId.toString());
          }
        }
      }

      // Notify each user
      for (const targetUserId of notifyUsers) {
        const targetConnection = this.connectedUsers.get(targetUserId);
        if (targetConnection) {
          this.io.to(targetConnection.socketId).emit('friend_status_change', {
            userId: userId,
            status: status,
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      logger.error(`Error notifying status change for user ${userId}:`, error);
    }
  }

  // Heartbeat system to detect inactive connections
  setupHeartbeat() {
    setInterval(() => {
      const now = new Date();
      const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

      for (const [userId, connection] of this.connectedUsers) {
        const timeSinceActivity = now - connection.lastActivity;
        
        if (timeSinceActivity > inactiveThreshold) {
          const socket = this.io.sockets.sockets.get(connection.socketId);
          if (socket) {
            logger.info(`Disconnecting inactive user: ${userId}`);
            socket.disconnect();
          } else {
            // Socket already disconnected, cleanup
            this.connectedUsers.delete(userId);
            this.userRooms.delete(userId);
          }
        }
      }
    }, 60000); // Check every minute
  }

  // Public methods for other parts of the application
  isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }

  getUserSocket(userId) {
    const connection = this.connectedUsers.get(userId);
    return connection ? this.io.sockets.sockets.get(connection.socketId) : null;
  }

  getOnlineUsersCount() {
    return this.connectedUsers.size;
  }

  getRoomUsersCount(roomId) {
    const roomUsers = this.roomUsers.get(roomId);
    return roomUsers ? roomUsers.size : 0;
  }

  // Broadcast message to room
  broadcastToRoom(roomId, event, data) {
    this.io.to(roomId).emit(event, data);
  }

  // Send message to specific user
  sendToUser(userId, event, data) {
    const socket = this.getUserSocket(userId);
    if (socket) {
      socket.emit(event, data);
      return true;
    }
    return false;
  }
}

// Initialize and export
let socketHandlerInstance = null;

module.exports = (io) => {
  if (!socketHandlerInstance) {
    socketHandlerInstance = new SocketHandler(io);
  }
  return socketHandlerInstance;
};