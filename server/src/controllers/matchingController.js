const matchingService = require('../services/matchingService');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * Matching Controller for AcademicAlly
 * Handles all study partner matching HTTP requests
 */

class MatchingController {
  /**
   * Find compatible study partners
   * GET /api/matching/partners
   */
  async findPartners(req, res) {
    try {
      const userId = req.user.id;
      const {
        courses,
        studyStyle,
        location,
        maxDistance,
        timePreference,
        limit = 10,
        minReputation,
        excludeMatched = false
      } = req.query;

      // Build filter options
      const filters = {};
      if (courses) filters.courses = courses.split(',');
      if (studyStyle) filters.studyStyle = studyStyle;
      if (location) filters.location = location;
      if (maxDistance) filters.maxDistance = parseInt(maxDistance);
      if (timePreference) filters.timePreference = timePreference;
      if (minReputation) filters.minReputation = parseFloat(minReputation);
      if (excludeMatched === 'true') filters.excludeMatched = true;

      const matches = await matchingService.findCompatiblePartners(
        userId,
        filters,
        parseInt(limit)
      );

      logger.logMatching('Partners found', {
        userId,
        matchCount: matches.length,
        filters
      });

      res.status(200).json({
        success: true,
        message: `Found ${matches.length} compatible study partners`,
        data: {
          matches,
          total: matches.length,
          filters: filters
        }
      });

    } catch (error) {
      logger.logError('Find partners failed', error, { userId: req.user?.id });
      res.status(500).json({
        success: false,
        message: 'Failed to find study partners'
      });
    }
  }

  /**
   * Get detailed compatibility analysis
   * GET /api/matching/compatibility/:partnerId
   */
  async getCompatibilityAnalysis(req, res) {
    try {
      const userId = req.user.id;
      const { partnerId } = req.params;

      if (!partnerId) {
        return res.status(400).json({
          success: false,
          message: 'Partner ID is required'
        });
      }

      const analysis = await matchingService.calculateCompatibility(userId, partnerId);

      if (!analysis) {
        return res.status(404).json({
          success: false,
          message: 'Partner not found or compatibility cannot be calculated'
        });
      }

      logger.logMatching('Compatibility analysis generated', {
        userId,
        partnerId,
        score: analysis.overallScore
      });

      res.status(200).json({
        success: true,
        message: 'Compatibility analysis generated successfully',
        data: analysis
      });

    } catch (error) {
      logger.logError('Compatibility analysis failed', error, {
        userId: req.user?.id,
        partnerId: req.params?.partnerId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to generate compatibility analysis'
      });
    }
  }

  /**
   * Send match request to potential partner
   * POST /api/matching/request
   */
  async sendMatchRequest(req, res) {
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
      const { partnerId, message, courses } = req.body;

      const result = await matchingService.createMatch(userId, partnerId, {
        message,
        courses: courses || [],
        status: 'pending'
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      // Send notification email to potential partner
      try {
        await emailService.sendMatchNotification(
          result.partner.email,
          result.partner.name,
          req.user.name,
          message,
          courses
        );
      } catch (emailError) {
        logger.logError('Match notification email failed', emailError);
        // Don't fail the request if email fails
      }

      logger.logMatching('Match request sent', {
        fromUserId: userId,
        toUserId: partnerId,
        matchId: result.match._id
      });

      res.status(201).json({
        success: true,
        message: 'Match request sent successfully',
        data: {
          match: result.match,
          partner: {
            id: result.partner._id,
            name: result.partner.name,
            university: result.partner.university,
            major: result.partner.major
          }
        }
      });

    } catch (error) {
      logger.logError('Send match request failed', error, { userId: req.user?.id });
      res.status(500).json({
        success: false,
        message: 'Failed to send match request'
      });
    }
  }

  /**
   * Respond to match request (accept/decline)
   * PUT /api/matching/request/:matchId
   */
  async respondToMatchRequest(req, res) {
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
      const { matchId } = req.params;
      const { action, message } = req.body; // 'accept' or 'decline'

      if (!['accept', 'decline'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Action must be either "accept" or "decline"'
        });
      }

      const result = await matchingService.updateMatchStatus(matchId, userId, action, message);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      // Send response notification email
      try {
        const emailMethod = action === 'accept' 
          ? emailService.sendMatchAcceptedNotification 
          : emailService.sendMatchDeclinedNotification;
        
        await emailMethod(
          result.requester.email,
          result.requester.name,
          req.user.name,
          message
        );
      } catch (emailError) {
        logger.logError('Match response notification email failed', emailError);
      }

      logger.logMatching(`Match request ${action}ed`, {
        matchId,
        responderId: userId,
        requesterId: result.requester._id,
        action
      });

      res.status(200).json({
        success: true,
        message: `Match request ${action}ed successfully`,
        data: {
          match: result.match,
          action
        }
      });

    } catch (error) {
      logger.logError('Respond to match request failed', error, {
        userId: req.user?.id,
        matchId: req.params?.matchId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to respond to match request'
      });
    }
  }

  /**
   * Get all matches for current user
   * GET /api/matching/my-matches
   */
  async getMyMatches(req, res) {
    try {
      const userId = req.user.id;
      const {
        status,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 }
      };

      const filters = {};
      if (status) filters.status = status;

      const result = await matchingService.getUserMatches(userId, filters, options);

      logger.logMatching('User matches retrieved', {
        userId,
        matchCount: result.matches.length,
        status,
        page
      });

      res.status(200).json({
        success: true,
        message: 'Matches retrieved successfully',
        data: {
          matches: result.matches,
          pagination: {
            currentPage: result.currentPage,
            totalPages: result.totalPages,
            totalMatches: result.totalMatches,
            hasNext: result.hasNext,
            hasPrev: result.hasPrev
          }
        }
      });

    } catch (error) {
      logger.logError('Get user matches failed', error, { userId: req.user?.id });
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve matches'
      });
    }
  }

  /**
   * Get match statistics for user
   * GET /api/matching/stats
   */
  async getMatchingStats(req, res) {
    try {
      const userId = req.user.id;

      const stats = await matchingService.getUserMatchingStats(userId);

      logger.logMatching('Matching stats retrieved', { userId });

      res.status(200).json({
        success: true,
        message: 'Matching statistics retrieved successfully',
        data: stats
      });

    } catch (error) {
      logger.logError('Get matching stats failed', error, { userId: req.user?.id });
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve matching statistics'
      });
    }
  }

  /**
   * Update matching preferences
   * PUT /api/matching/preferences
   */
  async updateMatchingPreferences(req, res) {
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
      const preferences = req.body;

      const result = await matchingService.updateUserPreferences(userId, preferences);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      logger.logMatching('Matching preferences updated', { userId });

      res.status(200).json({
        success: true,
        message: 'Matching preferences updated successfully',
        data: {
          preferences: result.preferences
        }
      });

    } catch (error) {
      logger.logError('Update matching preferences failed', error, { userId: req.user?.id });
      res.status(500).json({
        success: false,
        message: 'Failed to update matching preferences'
      });
    }
  }

  /**
   * Block a user from matching
   * POST /api/matching/block
   */
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
      const { blockedUserId, reason } = req.body;

      const result = await matchingService.blockUser(userId, blockedUserId, reason);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      logger.logMatching('User blocked', {
        blockerId: userId,
        blockedUserId,
        reason
      });

      res.status(200).json({
        success: true,
        message: 'User blocked successfully'
      });

    } catch (error) {
      logger.logError('Block user failed', error, { userId: req.user?.id });
      res.status(500).json({
        success: false,
        message: 'Failed to block user'
      });
    }
  }

  /**
   * Unblock a user
   * DELETE /api/matching/block/:blockedUserId
   */
  async unblockUser(req, res) {
    try {
      const userId = req.user.id;
      const { blockedUserId } = req.params;

      const result = await matchingService.unblockUser(userId, blockedUserId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      logger.logMatching('User unblocked', {
        blockerId: userId,
        blockedUserId
      });

      res.status(200).json({
        success: true,
        message: 'User unblocked successfully'
      });

    } catch (error) {
      logger.logError('Unblock user failed', error, { userId: req.user?.id });
      res.status(500).json({
        success: false,
        message: 'Failed to unblock user'
      });
    }
  }

  /**
   * Get blocked users list
   * GET /api/matching/blocked
   */
  async getBlockedUsers(req, res) {
    try {
      const userId = req.user.id;

      const blockedUsers = await matchingService.getBlockedUsers(userId);

      res.status(200).json({
        success: true,
        message: 'Blocked users retrieved successfully',
        data: {
          blockedUsers,
          count: blockedUsers.length
        }
      });

    } catch (error) {
      logger.logError('Get blocked users failed', error, { userId: req.user?.id });
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve blocked users'
      });
    }
  }

  /**
   * Rate a study partner after session
   * POST /api/matching/rate
   */
  async ratePartner(req, res) {
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
      const { partnerId, matchId, rating, feedback } = req.body;

      const result = await matchingService.ratePartner(userId, partnerId, matchId, {
        rating: parseFloat(rating),
        feedback
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      logger.logMatching('Partner rated', {
        raterId: userId,
        partnerId,
        matchId,
        rating
      });

      res.status(200).json({
        success: true,
        message: 'Partner rated successfully',
        data: {
          rating: result.rating,
          newReputation: result.newReputation
        }
      });

    } catch (error) {
      logger.logError('Rate partner failed', error, { userId: req.user?.id });
      res.status(500).json({
        success: false,
        message: 'Failed to rate partner'
      });
    }
  }

  /**
   * Get matching recommendations based on user activity
   * GET /api/matching/recommendations
   */
  async getRecommendations(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 5 } = req.query;

      const recommendations = await matchingService.getPersonalizedRecommendations(
        userId,
        parseInt(limit)
      );

      logger.logMatching('Recommendations generated', {
        userId,
        recommendationCount: recommendations.length
      });

      res.status(200).json({
        success: true,
        message: 'Recommendations generated successfully',
        data: {
          recommendations,
          count: recommendations.length
        }
      });

    } catch (error) {
      logger.logError('Get recommendations failed', error, { userId: req.user?.id });
      res.status(500).json({
        success: false,
        message: 'Failed to generate recommendations'
      });
    }
  }
}

module.exports = new MatchingController();