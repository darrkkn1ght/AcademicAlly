const groupService = require('../services/groupService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * Group Controller for AcademicAlly
 * Handles all HTTP requests related to study groups
 */

class GroupController {
  /**
   * Create a new study group
   * POST /api/groups
   */
  async createGroup(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.logGroup('Group creation failed - validation errors', {
          userId: req.user.id,
          errors: errors.array()
        });
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const groupData = req.body;

      logger.logGroup('Group creation attempt', {
        userId,
        groupName: groupData.name,
        course: groupData.course
      });

      const result = await groupService.createGroup(userId, groupData);

      if (!result.success) {
        return res.status(400).json(result);
      }

      logger.logGroup('Group created successfully', {
        userId,
        groupId: result.group._id,
        groupName: result.group.name
      });

      res.status(201).json(result);
    } catch (error) {
      logger.error('Error in createGroup controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to create group',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get all groups (with filtering)
   * GET /api/groups
   */
  async getGroups(req, res) {
    try {
      const userId = req.user.id;
      const filters = {
        course: req.query.course,
        university: req.query.university,
        meetingType: req.query.meetingType,
        location: req.query.location,
        hasSpace: req.query.hasSpace === 'true',
        search: req.query.search,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined || filters[key] === '') {
          delete filters[key];
        }
      });

      logger.logGroup('Groups search request', {
        userId,
        filters
      });

      const result = await groupService.searchGroups(filters, userId);

      res.json(result);
    } catch (error) {
      logger.error('Error in getGroups controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch groups',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get user's groups
   * GET /api/groups/my-groups
   */
  async getMyGroups(req, res) {
    try {
      const userId = req.user.id;

      logger.logGroup('User groups request', { userId });

      const result = await groupService.getUserGroups(userId);

      res.json(result);
    } catch (error) {
      logger.error('Error in getMyGroups controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch your groups',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get group details
   * GET /api/groups/:id
   */
  async getGroupById(req, res) {
    try {
      const userId = req.user.id;
      const groupId = req.params.groupId;

      logger.logGroup('Group details request', {
        userId,
        groupId
      });

      const result = await groupService.getGroupById(groupId, userId);

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error) {
      logger.error('Error in getGroupById controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        groupId: req.params.groupId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch group details',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Join a group
   * POST /api/groups/:id/join
   */
  async joinGroup(req, res) {
    try {
      const userId = req.user.id;
      const groupId = req.params.groupId;

      logger.logGroup('Group join attempt', {
        userId,
        groupId
      });

      const result = await groupService.joinGroup(groupId, userId);

      if (!result.success) {
        return res.status(400).json(result);
      }

      logger.logGroup('User joined group successfully', {
        userId,
        groupId,
        groupName: result.group?.name
      });

      res.json(result);
    } catch (error) {
      logger.error('Error in joinGroup controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        groupId: req.params.groupId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to join group',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Leave a group
   * POST /api/groups/:id/leave
   */
  async leaveGroup(req, res) {
    try {
      const userId = req.user.id;
      const groupId = req.params.groupId;

      logger.logGroup('Group leave attempt', {
        userId,
        groupId
      });

      const result = await groupService.leaveGroup(groupId, userId);

      if (!result.success) {
        return res.status(400).json(result);
      }

      logger.logGroup('User left group successfully', {
        userId,
        groupId
      });

      res.json(result);
    } catch (error) {
      logger.error('Error in leaveGroup controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        groupId: req.params.groupId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to leave group',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Update group details
   * PUT /api/groups/:id
   */
  async updateGroup(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const groupId = req.params.groupId;
      const updates = req.body;

      logger.logGroup('Group update attempt', {
        userId,
        groupId,
        updates: Object.keys(updates)
      });

      const result = await groupService.updateGroup(groupId, userId, updates);

      if (!result.success) {
        return res.status(result.message.includes('not found') ? 404 : 403).json(result);
      }

      logger.logGroup('Group updated successfully', {
        userId,
        groupId
      });

      res.json(result);
    } catch (error) {
      logger.error('Error in updateGroup controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        groupId: req.params.groupId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to update group',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Delete a group
   * DELETE /api/groups/:id
   */
  async deleteGroup(req, res) {
    try {
      const userId = req.user.id;
      const groupId = req.params.groupId;

      logger.logGroup('Group deletion attempt', {
        userId,
        groupId
      });

      const result = await groupService.deleteGroup(groupId, userId);

      if (!result.success) {
        return res.status(result.message.includes('not found') ? 404 : 403).json(result);
      }

      logger.logGroup('Group deleted successfully', {
        userId,
        groupId
      });

      res.json(result);
    } catch (error) {
      logger.error('Error in deleteGroup controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        groupId: req.params.groupId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to delete group',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Remove member from group
   * DELETE /api/groups/:id/members/:memberId
   */
  async removeMember(req, res) {
    try {
      const userId = req.user.id;
      const groupId = req.params.groupId;
      const memberId = req.params.memberId;

      logger.logGroup('Member removal attempt', {
        userId,
        groupId,
        memberId
      });

      const result = await groupService.removeMember(groupId, userId, memberId);

      if (!result.success) {
        return res.status(result.message.includes('not found') ? 404 : 403).json(result);
      }

      logger.logGroup('Member removed successfully', {
        userId,
        groupId,
        memberId
      });

      res.json(result);
    } catch (error) {
      logger.error('Error in removeMember controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        groupId: req.params.groupId,
        memberId: req.params.memberId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to remove member',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get group statistics for admin/creator
   * GET /api/groups/:id/stats
   */
  async getGroupStats(req, res) {
    try {
      const userId = req.user.id;
      const groupId = req.params.groupId;

      logger.logGroup('Group stats request', {
        userId,
        groupId
      });

      const result = await groupService.getGroupStats(groupId, userId);

      if (!result.success) {
        return res.status(result.message.includes('not found') ? 404 : 403).json(result);
      }

      res.json(result);
    } catch (error) {
      logger.error('Error in getGroupStats controller', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        groupId: req.params.groupId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch group statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new GroupController();