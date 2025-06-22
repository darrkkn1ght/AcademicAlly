const Group = require('../models/Group');
const User = require('../models/User');
const Message = require('../models/Message');
const logger = require('../utils/logger');

/**
 * Group Service for AcademicAlly
 * Handles study group creation, management, and member operations
 */

class GroupService {
  constructor() {
    this.maxGroupSize = 10;
    this.minGroupSize = 2;
    this.maxGroupsPerUser = 5;
    this.defaultGroupExpiration = 90; // days
  }

  /**
   * Create a new study group
   * @param {string} creatorId - ID of user creating the group
   * @param {Object} groupData - Group information
   * @returns {Promise<Object>} Created group
   */
  async createGroup(creatorId, groupData) {
    try {
      logger.group('Creating new group', { creatorId, groupName: groupData.name });

      // Validate creator exists
      const creator = await User.findById(creatorId);
      if (!creator) {
        throw new Error('Creator not found');
      }

      // Check if user has reached group limit
      const userGroupCount = await Group.countDocuments({
        $or: [
          { creator: creatorId },
          { members: creatorId }
        ],
        isActive: true
      });

      if (userGroupCount >= this.maxGroupsPerUser) {
        throw new Error(`Cannot create more than ${this.maxGroupsPerUser} groups`);
      }

      // Validate group data
      this.validateGroupData(groupData);

      // Create group
      const group = new Group({
        name: groupData.name,
        description: groupData.description,
        course: groupData.course,
        subject: groupData.subject,
        creator: creatorId,
        members: [creatorId], // Creator is first member
        maxMembers: Math.min(groupData.maxMembers || 5, this.maxGroupSize),
        meetingType: groupData.meetingType || 'hybrid',
        location: groupData.location,
        schedule: groupData.schedule || {},
        requirements: groupData.requirements || {},
        tags: groupData.tags || [],
        isActive: true,
        isPublic: groupData.isPublic !== false, // Default to public
        expiresAt: new Date(Date.now() + this.defaultGroupExpiration * 24 * 60 * 60 * 1000)
      });

      const savedGroup = await group.save();

      // Update creator's group list
      await User.findByIdAndUpdate(creatorId, {
        $addToSet: { groups: savedGroup._id }
      });

      logger.group('Group created successfully', { 
        groupId: savedGroup._id, 
        creatorId,
        memberCount: 1
      });

      return await this.getGroupDetails(savedGroup._id);
    } catch (error) {
      logger.error('Error creating group', { creatorId, error: error.message });
      throw error;
    }
  }

  /**
   * Get group details with populated member information
   * @param {string} groupId - Group ID
   * @param {string} requesterId - ID of user requesting details
   * @returns {Promise<Object>} Group details
   */
  async getGroupDetails(groupId, requesterId = null) {
    try {
      const group = await Group.findById(groupId)
        .populate('creator', 'name email university major year profilePicture reputation')
        .populate('members', 'name email university major year profilePicture reputation')
        .lean();

      if (!group) {
        throw new Error('Group not found');
      }

      // Check if group is private and requester has access
      if (!group.isPublic && requesterId) {
        const hasAccess = group.members.some(member => 
          member._id.toString() === requesterId.toString()
        );
        if (!hasAccess) {
          throw new Error('Access denied to private group');
        }
      }

      // Add computed fields
      group.memberCount = group.members.length;
      group.spotsAvailable = group.maxMembers - group.members.length;
      group.isFull = group.memberCount >= group.maxMembers;
      group.isExpired = group.expiresAt < new Date();

      return group;
    } catch (error) {
      logger.error('Error getting group details', { groupId, error: error.message });
      throw error;
    }
  }

  /**
   * Join a study group
   * @param {string} groupId - Group to join
   * @param {string} userId - User requesting to join
   * @param {Object} joinData - Optional join message/requirements
   * @returns {Promise<Object>} Updated group
   */
  async joinGroup(groupId, userId, joinData = {}) {
    try {
      logger.group('User requesting to join group', { groupId, userId });

      const [group, user] = await Promise.all([
        Group.findById(groupId),
        User.findById(userId)
      ]);

      if (!group) {
        throw new Error('Group not found');
      }
      if (!user) {
        throw new Error('User not found');
      }

      // Validation checks
      this.validateJoinRequest(group, user, joinData);

      // Add user to group
      group.members.push(userId);
      group.updatedAt = new Date();
      await group.save();

      // Update user's group list
      await User.findByIdAndUpdate(userId, {
        $addToSet: { groups: groupId }
      });

      // Send welcome message to group
      await this.sendWelcomeMessage(groupId, userId, user.name);

      logger.group('User joined group successfully', { 
        groupId, 
        userId,
        newMemberCount: group.members.length
      });

      return await this.getGroupDetails(groupId);
    } catch (error) {
      logger.error('Error joining group', { groupId, userId, error: error.message });
      throw error;
    }
  }

  /**
   * Leave a study group
   * @param {string} groupId - Group to leave
   * @param {string} userId - User leaving
   * @returns {Promise<Object>} Updated group or null if group deleted
   */
  async leaveGroup(groupId, userId) {
    try {
      logger.group('User leaving group', { groupId, userId });

      const group = await Group.findById(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      // Check if user is in group
      if (!group.members.includes(userId)) {
        throw new Error('User is not a member of this group');
      }

      // Remove user from group
      group.members = group.members.filter(memberId => 
        memberId.toString() !== userId.toString()
      );

      // Update user's group list
      await User.findByIdAndUpdate(userId, {
        $pull: { groups: groupId }
      });

      // Handle creator leaving
      if (group.creator.toString() === userId.toString()) {
        if (group.members.length > 0) {
          // Transfer ownership to oldest member
          group.creator = group.members[0];
          logger.group('Group ownership transferred', { 
            groupId, 
            oldCreator: userId, 
            newCreator: group.members[0] 
          });
        } else {
          // Delete empty group
          await Group.findByIdAndDelete(groupId);
          logger.group('Empty group deleted', { groupId });
          return null;
        }
      }

      group.updatedAt = new Date();
      await group.save();

      logger.group('User left group successfully', { 
        groupId, 
        userId,
        remainingMembers: group.members.length
      });

      return await this.getGroupDetails(groupId);
    } catch (error) {
      logger.error('Error leaving group', { groupId, userId, error: error.message });
      throw error;
    }
  }

  /**
   * Search for study groups
   * @param {Object} searchCriteria - Search parameters
   * @param {Object} pagination - Page and limit options
   * @returns {Promise<Object>} Search results with pagination
   */
  async searchGroups(searchCriteria = {}, pagination = {}) {
    try {
      const { page = 1, limit = 20 } = pagination;
      const skip = (page - 1) * limit;

      // Build search query
      const query = this.buildSearchQuery(searchCriteria);

      // Execute search with pagination
      const [groups, totalCount] = await Promise.all([
        Group.find(query)
          .populate('creator', 'name university major year profilePicture')
          .select('-members') // Don't include full member list in search results
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Group.countDocuments(query)
      ]);

      // Add computed fields to each group
      const enrichedGroups = groups.map(group => ({
        ...group,
        memberCount: group.members?.length || 0,
        spotsAvailable: group.maxMembers - (group.members?.length || 0),
        isFull: (group.members?.length || 0) >= group.maxMembers,
        isExpired: group.expiresAt < new Date()
      }));

      const result = {
        groups: enrichedGroups,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        }
      };

      logger.group('Group search completed', { 
        searchCriteria, 
        resultCount: groups.length,
        totalCount
      });

      return result;
    } catch (error) {
      logger.error('Error searching groups', { searchCriteria, error: error.message });
      throw error;
    }
  }

  /**
   * Update group information
   * @param {string} groupId - Group to update
   * @param {string} userId - User making the update
   * @param {Object} updateData - Fields to update
   * @returns {Promise<Object>} Updated group
   */
  async updateGroup(groupId, userId, updateData) {
    try {
      logger.group('Updating group', { groupId, userId });

      const group = await Group.findById(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      // Check permissions (only creator can update)
      if (group.creator.toString() !== userId.toString()) {
        throw new Error('Only group creator can update group details');
      }

      // Validate update data
      this.validateUpdateData(updateData);

      // Apply updates
      Object.assign(group, {
        ...updateData,
        updatedAt: new Date()
      });

      await group.save();

      logger.group('Group updated successfully', { groupId, userId });

      return await this.getGroupDetails(groupId);
    } catch (error) {
      logger.error('Error updating group', { groupId, userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get user's groups
   * @param {string} userId - User ID
   * @returns {Promise<Array>} User's groups
   */
  async getUserGroups(userId) {
    try {
      const groups = await Group.find({
        members: userId,
        isActive: true
      })
      .populate('creator', 'name profilePicture')
      .sort({ updatedAt: -1 })
      .lean();

      return groups.map(group => ({
        ...group,
        memberCount: group.members.length,
        spotsAvailable: group.maxMembers - group.members.length,
        isFull: group.members.length >= group.maxMembers,
        isExpired: group.expiresAt < new Date(),
        isCreator: group.creator._id.toString() === userId.toString()
      }));
    } catch (error) {
      logger.error('Error getting user groups', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Remove member from group (admin action)
   * @param {string} groupId - Group ID
   * @param {string} adminId - Admin performing action
   * @param {string} memberId - Member to remove
   * @param {string} reason - Reason for removal
   * @returns {Promise<Object>} Updated group
   */
  async removeMember(groupId, adminId, memberId, reason = '') {
    try {
      logger.group('Admin removing member from group', { 
        groupId, 
        adminId, 
        memberId, 
        reason 
      });

      const group = await Group.findById(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      // Check admin permissions
      if (group.creator.toString() !== adminId.toString()) {
        throw new Error('Only group creator can remove members');
      }

      // Cannot remove creator
      if (group.creator.toString() === memberId.toString()) {
        throw new Error('Cannot remove group creator');
      }

      // Check if member exists in group
      if (!group.members.includes(memberId)) {
        throw new Error('User is not a member of this group');
      }

      // Remove member
      group.members = group.members.filter(id => 
        id.toString() !== memberId.toString()
      );
      group.updatedAt = new Date();
      await group.save();

      // Update user's group list
      await User.findByIdAndUpdate(memberId, {
        $pull: { groups: groupId }
      });

      logger.group('Member removed successfully', { 
        groupId, 
        adminId, 
        memberId,
        remainingMembers: group.members.length
      });

      return await this.getGroupDetails(groupId);
    } catch (error) {
      logger.error('Error removing member', { 
        groupId, 
        adminId, 
        memberId, 
        error: error.message 
      });
      throw error;
    }
  }

  // Private helper methods

  /**
   * Validate group creation data
   * @param {Object} groupData - Group data to validate
   */
  validateGroupData(groupData) {
    if (!groupData.name || groupData.name.trim().length < 3) {
      throw new Error('Group name must be at least 3 characters long');
    }

    if (!groupData.course || groupData.course.trim().length < 2) {
      throw new Error('Course is required');
    }

    if (groupData.maxMembers && (groupData.maxMembers < this.minGroupSize || groupData.maxMembers > this.maxGroupSize)) {
      throw new Error(`Group size must be between ${this.minGroupSize} and ${this.maxGroupSize} members`);
    }

    const validMeetingTypes = ['online', 'in-person', 'hybrid'];
    if (groupData.meetingType && !validMeetingTypes.includes(groupData.meetingType)) {
      throw new Error('Invalid meeting type');
    }
  }

  /**
   * Validate join request
   * @param {Object} group - Group to join
   * @param {Object} user - User requesting to join
   * @param {Object} joinData - Join request data
   */
  validateJoinRequest(group, user, joinData) {
    if (!group.isActive) {
      throw new Error('Group is not active');
    }

    if (group.expiresAt < new Date()) {
      throw new Error('Group has expired');
    }

    if (group.members.includes(user._id)) {
      throw new Error('User is already a member of this group');
    }

    if (group.members.length >= group.maxMembers) {
      throw new Error('Group is full');
    }

    // Check requirements if any
    if (group.requirements) {
      if (group.requirements.minYear && user.year < group.requirements.minYear) {
        throw new Error(`Minimum year requirement: ${group.requirements.minYear}`);
      }

      if (group.requirements.university && user.university !== group.requirements.university) {
        throw new Error('University requirement not met');
      }

      if (group.requirements.major && !group.requirements.major.includes(user.major)) {
        throw new Error('Major requirement not met');
      }
    }
  }

  /**
   * Validate update data
   * @param {Object} updateData - Data to validate
   */
  validateUpdateData(updateData) {
    const allowedFields = [
      'name', 'description', 'schedule', 'location', 
      'requirements', 'tags', 'isPublic'
    ];

    const invalidFields = Object.keys(updateData).filter(
      field => !allowedFields.includes(field)
    );

    if (invalidFields.length > 0) {
      throw new Error(`Invalid fields: ${invalidFields.join(', ')}`);
    }

    if (updateData.name && updateData.name.trim().length < 3) {
      throw new Error('Group name must be at least 3 characters long');
    }
  }

  /**
   * Build search query from criteria
   * @param {Object} criteria - Search criteria
   * @returns {Object} MongoDB query
   */
  buildSearchQuery(criteria) {
    const query = { isActive: true, isPublic: true };

    if (criteria.course) {
      query.course = new RegExp(criteria.course, 'i');
    }

    if (criteria.subject) {
      query.subject = new RegExp(criteria.subject, 'i');
    }

    if (criteria.university) {
      query['creator.university'] = criteria.university;
    }

    if (criteria.meetingType) {
      query.meetingType = criteria.meetingType;
    }

    if (criteria.tags && criteria.tags.length > 0) {
      query.tags = { $in: criteria.tags };
    }

    if (criteria.hasSpots) {
      query.$expr = { $lt: [{ $size: '$members' }, '$maxMembers'] };
    }

    if (criteria.location) {
      query.location = new RegExp(criteria.location, 'i');
    }

    // Exclude expired groups
    query.expiresAt = { $gt: new Date() };

    return query;
  }

  /**
   * Send welcome message to group
   * @param {string} groupId - Group ID
   * @param {string} userId - New member ID
   * @param {string} userName - New member name
   */
  async sendWelcomeMessage(groupId, userId, userName) {
    try {
      const welcomeMessage = new Message({
        sender: null, // System message
        groupId: groupId,
        content: `${userName} has joined the group!`,
        messageType: 'system',
        timestamp: new Date()
      });

      await welcomeMessage.save();
    } catch (error) {
      logger.error('Error sending welcome message', { groupId, userId, error: error.message });
      // Don't throw error for welcome message failure
    }
  }
}

module.exports = new GroupService();