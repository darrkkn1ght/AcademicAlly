const Group = require('../models/Group');
const User = require('../models/User');
const Message = require('../models/Message');
const logger = require('../utils/logger');
const {
  SOCKET_CONSTANTS,
  MESSAGE_CONSTANTS,
  GROUP_CONSTANTS,
  NOTIFICATION_CONSTANTS
} = require('../utils/constants');

/**
 * Real-time Group Event Handlers
 * Manages all Socket.io events related to study groups
 */
class GroupHandlers {
  constructor(io) {
    this.io = io;
  }

  /**
   * Initialize all group-related socket event handlers
   */
  initializeHandlers(socket) {
    // Group joining and leaving
    socket.on(SOCKET_CONSTANTS.EVENTS.JOIN_GROUP, (data) => this.handleJoinGroup(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.LEAVE_GROUP, (data) => this.handleLeaveGroup(socket, data));
    
    // Group management
    socket.on(SOCKET_CONSTANTS.EVENTS.CREATE_GROUP, (data) => this.handleCreateGroup(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.UPDATE_GROUP, (data) => this.handleUpdateGroup(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.DELETE_GROUP, (data) => this.handleDeleteGroup(socket, data));
    
    // Member management
    socket.on(SOCKET_CONSTANTS.EVENTS.INVITE_MEMBER, (data) => this.handleInviteMember(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.ACCEPT_INVITATION, (data) => this.handleAcceptInvitation(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.DECLINE_INVITATION, (data) => this.handleDeclineInvitation(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.REMOVE_MEMBER, (data) => this.handleRemoveMember(socket, data));
    
    // Role management
    socket.on(SOCKET_CONSTANTS.EVENTS.CHANGE_ROLE, (data) => this.handleChangeRole(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.TRANSFER_OWNERSHIP, (data) => this.handleTransferOwnership(socket, data));
    
    // Group activities
    socket.on(SOCKET_CONSTANTS.EVENTS.START_STUDY_SESSION, (data) => this.handleStartStudySession(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.END_STUDY_SESSION, (data) => this.handleEndStudySession(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.SCHEDULE_MEETING, (data) => this.handleScheduleMeeting(socket, data));
    
    // Group messaging
    socket.on(SOCKET_CONSTANTS.EVENTS.SEND_GROUP_MESSAGE, (data) => this.handleSendGroupMessage(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.TYPING_START, (data) => this.handleTypingStart(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.TYPING_STOP, (data) => this.handleTypingStop(socket, data));
    
    // Group status updates
    socket.on(SOCKET_CONSTANTS.EVENTS.UPDATE_STATUS, (data) => this.handleUpdateStatus(socket, data));
    socket.on(SOCKET_CONSTANTS.EVENTS.SET_AVAILABILITY, (data) => this.handleSetAvailability(socket, data));
  }

  /**
   * Handle user joining a group room
   */
  async handleJoinGroup(socket, { groupId }) {
    try {
      const userId = socket.userId;
      
      // Verify user is member of the group
      const group = await Group.findById(groupId).populate('members.user', 'name profilePicture');
      if (!group) {
        socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Group not found' });
        return;
      }

      const membership = group.members.find(m => m.user._id.toString() === userId);
      if (!membership) {
        socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Not a member of this group' });
        return;
      }

      // Join the group room
      socket.join(`group_${groupId}`);
      
      // Update user's online status in group
      await Group.findOneAndUpdate(
        { _id: groupId, 'members.user': userId },
        { 'members.$.isOnline': true, 'members.$.lastSeen': new Date() }
      );

      // Notify other group members
      socket.to(`group_${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.MEMBER_ONLINE, {
        groupId,
        userId,
        user: membership.user,
        timestamp: new Date()
      });

      // Send current group status to joining user
      const updatedGroup = await Group.findById(groupId)
        .populate('members.user', 'name profilePicture isOnline lastSeen')
        .populate('creator', 'name profilePicture');
      
      socket.emit(SOCKET_CONSTANTS.EVENTS.GROUP_STATUS, {
        group: updatedGroup,
        onlineMembers: updatedGroup.members.filter(m => m.isOnline).length
      });

      logger.info(`User ${userId} joined group ${groupId}`);
    } catch (error) {
      logger.error('Error joining group:', error);
      socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Failed to join group' });
    }
  }

  /**
   * Handle user leaving a group room
   */
  async handleLeaveGroup(socket, { groupId }) {
    try {
      const userId = socket.userId;
      
      // Leave the group room
      socket.leave(`group_${groupId}`);
      
      // Update user's online status in group
      await Group.findOneAndUpdate(
        { _id: groupId, 'members.user': userId },
        { 'members.$.isOnline': false, 'members.$.lastSeen': new Date() }
      );

      // Notify other group members
      socket.to(`group_${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.MEMBER_OFFLINE, {
        groupId,
        userId,
        timestamp: new Date()
      });

      logger.info(`User ${userId} left group ${groupId}`);
    } catch (error) {
      logger.error('Error leaving group:', error);
    }
  }

  /**
   * Handle new group creation notification
   */
  async handleCreateGroup(socket, { groupData }) {
    try {
      const userId = socket.userId;
      
      // Create the group (this would typically be done via API first)
      const group = new Group({
        ...groupData,
        creator: userId,
        members: [{ user: userId, role: GROUP_CONSTANTS.ROLES.OWNER, joinedAt: new Date() }]
      });
      
      await group.save();
      
      // Join creator to group room
      socket.join(`group_${group._id}`);
      
      // Emit group created event
      socket.emit(SOCKET_CONSTANTS.EVENTS.GROUP_CREATED, {
        group: await group.populate('creator', 'name profilePicture')
      });

      logger.info(`Group ${group._id} created by user ${userId}`);
    } catch (error) {
      logger.error('Error creating group:', error);
      socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Failed to create group' });
    }
  }

  /**
   * Handle group updates
   */
  async handleUpdateGroup(socket, { groupId, updates }) {
    try {
      const userId = socket.userId;
      
      // Verify user has permission to update group
      const group = await Group.findById(groupId);
      const membership = group.members.find(m => m.user.toString() === userId);
      
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Insufficient permissions' });
        return;
      }

      // Update group
      const updatedGroup = await Group.findByIdAndUpdate(
        groupId,
        { ...updates, updatedAt: new Date() },
        { new: true }
      ).populate('creator', 'name profilePicture');

      // Notify all group members
      this.io.to(`group_${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.GROUP_UPDATED, {
        group: updatedGroup,
        updatedBy: userId,
        changes: Object.keys(updates),
        timestamp: new Date()
      });

      logger.info(`Group ${groupId} updated by user ${userId}`);
    } catch (error) {
      logger.error('Error updating group:', error);
      socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Failed to update group' });
    }
  }

  /**
   * Handle member invitation
   */
  async handleInviteMember(socket, { groupId, invitedUserId, message }) {
    try {
      const userId = socket.userId;
      
      // Verify permissions and group capacity
      const group = await Group.findById(groupId);
      const membership = group.members.find(m => m.user.toString() === userId);
      
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Insufficient permissions' });
        return;
      }

      if (group.members.length >= group.maxMembers) {
        socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Group is full' });
        return;
      }

      // Check if user is already a member or invited
      const alreadyMember = group.members.some(m => m.user.toString() === invitedUserId);
      if (alreadyMember) {
        socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'User is already a member' });
        return;
      }

      // Get invited user details
      const invitedUser = await User.findById(invitedUserId, 'name profilePicture');
      const inviter = await User.findById(userId, 'name profilePicture');

      // Send invitation to invited user if they're online
      const invitationData = {
        groupId,
        group: {
          name: group.name,
          course: group.course,
          memberCount: group.members.length
        },
        inviter,
        message,
        timestamp: new Date()
      };

      // Find invited user's socket and send invitation
      const invitedUserSockets = await this.io.fetchSockets();
      const invitedUserSocket = invitedUserSockets.find(s => s.userId === invitedUserId);
      
      if (invitedUserSocket) {
        invitedUserSocket.emit(SOCKET_CONSTANTS.EVENTS.INVITATION_RECEIVED, invitationData);
      }

      // Notify group members about the invitation
      this.io.to(`group_${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.MEMBER_INVITED, {
        groupId,
        invitedUser,
        inviter,
        timestamp: new Date()
      });

      logger.info(`User ${invitedUserId} invited to group ${groupId} by ${userId}`);
    } catch (error) {
      logger.error('Error inviting member:', error);
      socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Failed to send invitation' });
    }
  }

  /**
   * Handle invitation acceptance
   */
  async handleAcceptInvitation(socket, { groupId, inviterId }) {
    try {
      const userId = socket.userId;
      
      // Add user to group
      const group = await Group.findByIdAndUpdate(
        groupId,
        {
          $push: {
            members: {
              user: userId,
              role: GROUP_CONSTANTS.ROLES.MEMBER,
              joinedAt: new Date(),
              invitedBy: inviterId
            }
          }
        },
        { new: true }
      ).populate('members.user', 'name profilePicture');

      if (!group) {
        socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Group not found' });
        return;
      }

      // Join user to group room
      socket.join(`group_${groupId}`);

      // Get new member details
      const newMember = await User.findById(userId, 'name profilePicture');

      // Notify all group members
      this.io.to(`group_${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.MEMBER_JOINED, {
        groupId,
        member: newMember,
        memberCount: group.members.length,
        timestamp: new Date()
      });

      // Send welcome message
      socket.emit(SOCKET_CONSTANTS.EVENTS.INVITATION_ACCEPTED, {
        group: group,
        message: `Welcome to ${group.name}!`
      });

      logger.info(`User ${userId} joined group ${groupId}`);
    } catch (error) {
      logger.error('Error accepting invitation:', error);
      socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Failed to join group' });
    }
  }

  /**
   * Handle study session start
   */
  async handleStartStudySession(socket, { groupId, sessionData }) {
    try {
      const userId = socket.userId;
      
      // Verify user is group member
      const group = await Group.findById(groupId);
      const membership = group.members.find(m => m.user.toString() === userId);
      
      if (!membership) {
        socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Not a group member' });
        return;
      }

      // Update group with active session
      await Group.findByIdAndUpdate(groupId, {
        'currentSession.isActive': true,
        'currentSession.startedBy': userId,
        'currentSession.startedAt': new Date(),
        'currentSession.topic': sessionData.topic,
        'currentSession.participants': [userId]
      });

      // Notify all group members
      this.io.to(`group_${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.STUDY_SESSION_STARTED, {
        groupId,
        session: {
          topic: sessionData.topic,
          startedBy: userId,
          startedAt: new Date()
        },
        startedByUser: await User.findById(userId, 'name profilePicture')
      });

      logger.info(`Study session started in group ${groupId} by user ${userId}`);
    } catch (error) {
      logger.error('Error starting study session:', error);
      socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Failed to start study session' });
    }
  }

  /**
   * Handle group message sending
   */
  async handleSendGroupMessage(socket, { groupId, content, messageType = MESSAGE_CONSTANTS.TYPES.TEXT }) {
    try {
      const userId = socket.userId;
      
      // Verify user is group member
      const group = await Group.findById(groupId);
      const membership = group.members.find(m => m.user.toString() === userId);
      
      if (!membership) {
        socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Not a group member' });
        return;
      }

      // Create message
      const message = new Message({
        sender: userId,
        groupId: groupId,
        content,
        messageType,
        timestamp: new Date()
      });

      await message.save();
      await message.populate('sender', 'name profilePicture');

      // Send message to all group members
      this.io.to(`group_${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.GROUP_MESSAGE_RECEIVED, {
        message,
        groupId
      });

      // Update group's last activity
      await Group.findByIdAndUpdate(groupId, { lastActivity: new Date() });

      logger.info(`Message sent to group ${groupId} by user ${userId}`);
    } catch (error) {
      logger.error('Error sending group message:', error);
      socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Failed to send message' });
    }
  }

  /**
   * Handle typing indicators
   */
  async handleTypingStart(socket, { groupId }) {
    try {
      const userId = socket.userId;
      const user = await User.findById(userId, 'name');
      
      socket.to(`group_${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.USER_TYPING, {
        groupId,
        userId,
        userName: user.name,
        isTyping: true
      });
    } catch (error) {
      logger.error('Error handling typing start:', error);
    }
  }

  async handleTypingStop(socket, { groupId }) {
    try {
      const userId = socket.userId;
      
      socket.to(`group_${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.USER_TYPING, {
        groupId,
        userId,
        isTyping: false
      });
    } catch (error) {
      logger.error('Error handling typing stop:', error);
    }
  }

  /**
   * Handle member removal
   */
  async handleRemoveMember(socket, { groupId, memberUserId, reason }) {
    try {
      const userId = socket.userId;
      
      // Verify permissions
      const group = await Group.findById(groupId);
      const adminMembership = group.members.find(m => m.user.toString() === userId);
      const targetMembership = group.members.find(m => m.user.toString() === memberUserId);
      
      if (!adminMembership || !['owner', 'admin'].includes(adminMembership.role)) {
        socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Insufficient permissions' });
        return;
      }

      if (!targetMembership) {
        socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'User is not a member' });
        return;
      }

      // Can't remove owner
      if (targetMembership.role === GROUP_CONSTANTS.ROLES.OWNER) {
        socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Cannot remove group owner' });
        return;
      }

      // Remove member from group
      await Group.findByIdAndUpdate(groupId, {
        $pull: { members: { user: memberUserId } }
      });

      // Get removed user details
      const removedUser = await User.findById(memberUserId, 'name profilePicture');

      // Force disconnect removed user from group room
      const allSockets = await this.io.fetchSockets();
      const removedUserSocket = allSockets.find(s => s.userId === memberUserId);
      if (removedUserSocket) {
        removedUserSocket.leave(`group_${groupId}`);
        removedUserSocket.emit(SOCKET_CONSTANTS.EVENTS.REMOVED_FROM_GROUP, {
          groupId,
          reason,
          removedBy: userId
        });
      }

      // Notify remaining group members
      this.io.to(`group_${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.MEMBER_REMOVED, {
        groupId,
        removedUser,
        removedBy: userId,
        reason,
        timestamp: new Date()
      });

      logger.info(`User ${memberUserId} removed from group ${groupId} by ${userId}`);
    } catch (error) {
      logger.error('Error removing member:', error);
      socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Failed to remove member' });
    }
  }

  /**
   * Handle role changes
   */
  async handleChangeRole(socket, { groupId, memberUserId, newRole }) {
    try {
      const userId = socket.userId;
      
      // Verify permissions (only owner can change roles)
      const group = await Group.findById(groupId);
      const adminMembership = group.members.find(m => m.user.toString() === userId);
      
      if (!adminMembership || adminMembership.role !== GROUP_CONSTANTS.ROLES.OWNER) {
        socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Only group owner can change roles' });
        return;
      }

      // Update member role
      await Group.findOneAndUpdate(
        { _id: groupId, 'members.user': memberUserId },
        { 'members.$.role': newRole }
      );

      // Get updated member details
      const updatedMember = await User.findById(memberUserId, 'name profilePicture');

      // Notify all group members
      this.io.to(`group_${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.ROLE_CHANGED, {
        groupId,
        member: updatedMember,
        newRole,
        changedBy: userId,
        timestamp: new Date()
      });

      logger.info(`Role changed for user ${memberUserId} in group ${groupId} to ${newRole}`);
    } catch (error) {
      logger.error('Error changing role:', error);
      socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Failed to change role' });
    }
  }

  /**
   * Handle group deletion
   */
  async handleDeleteGroup(socket, { groupId, reason }) {
    try {
      const userId = socket.userId;
      
      // Verify user is group owner
      const group = await Group.findById(groupId);
      if (group.creator.toString() !== userId) {
        socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Only group owner can delete group' });
        return;
      }

      // Notify all members before deletion
      this.io.to(`group_${groupId}`).emit(SOCKET_CONSTANTS.EVENTS.GROUP_DELETED, {
        groupId,
        reason,
        deletedBy: userId,
        timestamp: new Date()
      });

      // Remove all members from room
      const allSockets = await this.io.fetchSockets();
      allSockets.forEach(socket => {
        socket.leave(`group_${groupId}`);
      });

      // Delete group and related messages
      await Group.findByIdAndDelete(groupId);
      await Message.deleteMany({ groupId });

      logger.info(`Group ${groupId} deleted by owner ${userId}`);
    } catch (error) {
      logger.error('Error deleting group:', error);
      socket.emit(SOCKET_CONSTANTS.EVENTS.ERROR, { message: 'Failed to delete group' });
    }
  }

  /**
   * Handle socket disconnect for group cleanup
   */
  async handleDisconnect(socket) {
    try {
      const userId = socket.userId;
      if (!userId) return;

      // Update user's offline status in all groups
      await Group.updateMany(
        { 'members.user': userId },
        { 
          'members.$.isOnline': false, 
          'members.$.lastSeen': new Date() 
        }
      );

      // Get all groups user was in
      const userGroups = await Group.find({ 'members.user': userId }, '_id');
      
      // Notify all groups about user going offline
      userGroups.forEach(group => {
        socket.to(`group_${group._id}`).emit(SOCKET_CONSTANTS.EVENTS.MEMBER_OFFLINE, {
          groupId: group._id,
          userId,
          timestamp: new Date()
        });
      });

      logger.info(`User ${userId} disconnected from all groups`);
    } catch (error) {
      logger.error('Error handling group disconnect:', error);
    }
  }
}

module.exports = GroupHandlers;