const User = require('../models/User');
const logger = require('../utils/logger');

class UserService {
  // Get user profile by ID
  async getUserById(userId) {
    try {
      const user = await User.findById(userId).select('-password');
      if (!user) {
        throw new Error('User not found');
      }
      return user;
    } catch (error) {
      logger.error(`Get user by ID error: ${error.message}`);
      throw error;
    }
  }

  // Get user profile by email
  async getUserByEmail(email) {
    try {
      const user = await User.findOne({ email: email.toLowerCase() }).select('-password');
      if (!user) {
        throw new Error('User not found');
      }
      return user;
    } catch (error) {
      logger.error(`Get user by email error: ${error.message}`);
      throw error;
    }
  }

  // Update user profile
  async updateProfile(userId, updateData) {
    try {
      const allowedUpdates = [
        'name', 'university', 'year', 'major', 'courses', 
        'studyPreferences', 'location', 'availability', 
        'profilePicture', 'bio'
      ];

      // Filter out non-allowed fields
      const filteredData = {};
      Object.keys(updateData).forEach(key => {
        if (allowedUpdates.includes(key)) {
          filteredData[key] = updateData[key];
        }
      });

      if (Object.keys(filteredData).length === 0) {
        throw new Error('No valid fields to update');
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: filteredData },
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        throw new Error('User not found');
      }

      logger.info(`User profile updated: ${userId}`);
      return user;
    } catch (error) {
      logger.error(`Update profile error: ${error.message}`);
      throw error;
    }
  }

  // Update study preferences
  async updateStudyPreferences(userId, preferences) {
    try {
      const validPreferences = {
        studyHours: preferences.studyHours,
        environment: preferences.environment,
        groupSize: preferences.groupSize,
        communicationStyle: preferences.communicationStyle,
        subjects: preferences.subjects,
        goals: preferences.goals
      };

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: { studyPreferences: validPreferences } },
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        throw new Error('User not found');
      }

      logger.info(`Study preferences updated: ${userId}`);
      return user;
    } catch (error) {
      logger.error(`Update study preferences error: ${error.message}`);
      throw error;
    }
  }

  // Update availability
  async updateAvailability(userId, availability) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { $set: { availability } },
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        throw new Error('User not found');
      }

      logger.info(`Availability updated: ${userId}`);
      return user;
    } catch (error) {
      logger.error(`Update availability error: ${error.message}`);
      throw error;
    }
  }

  // Add course to user
  async addCourse(userId, courseData) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if course already exists
      const courseExists = user.courses.some(course => 
        course.code === courseData.code && course.semester === courseData.semester
      );

      if (courseExists) {
        throw new Error('Course already added');
      }

      user.courses.push(courseData);
      await user.save();

      const updatedUser = await User.findById(userId).select('-password');
      logger.info(`Course added to user: ${userId}, course: ${courseData.code}`);
      
      return updatedUser;
    } catch (error) {
      logger.error(`Add course error: ${error.message}`);
      throw error;
    }
  }

  // Remove course from user
  async removeCourse(userId, courseId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      user.courses = user.courses.filter(course => course._id.toString() !== courseId);
      await user.save();

      const updatedUser = await User.findById(userId).select('-password');
      logger.info(`Course removed from user: ${userId}, courseId: ${courseId}`);
      
      return updatedUser;
    } catch (error) {
      logger.error(`Remove course error: ${error.message}`);
      throw error;
    }
  }

  // Search users by filters
  async searchUsers(filters, currentUserId, page = 1, limit = 20) {
    try {
      const query = { _id: { $ne: currentUserId } };

      // Apply filters
      if (filters.university) {
        query.university = new RegExp(filters.university, 'i');
      }

      if (filters.major) {
        query.major = new RegExp(filters.major, 'i');
      }

      if (filters.year) {
        query.year = filters.year;
      }

      if (filters.courses && filters.courses.length > 0) {
        query['courses.code'] = { $in: filters.courses };
      }

      if (filters.studyPreferences) {
        if (filters.studyPreferences.environment) {
          query['studyPreferences.environment'] = filters.studyPreferences.environment;
        }
        if (filters.studyPreferences.groupSize) {
          query['studyPreferences.groupSize'] = filters.studyPreferences.groupSize;
        }
      }

      const skip = (page - 1) * limit;

      const users = await User.find(query)
        .select('-password')
        .sort({ reputation: -1, lastSeen: -1 })
        .skip(skip)
        .limit(limit);

      const total = await User.countDocuments(query);

      logger.info(`User search performed by: ${currentUserId}, results: ${users.length}`);

      return {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error(`Search users error: ${error.message}`);
      throw error;
    }
  }

  // Get users by course
  async getUsersByCourse(courseCode, currentUserId, limit = 20) {
    try {
      const users = await User.find({
        'courses.code': courseCode,
        _id: { $ne: currentUserId }
      })
      .select('-password')
      .sort({ reputation: -1, isOnline: -1 })
      .limit(limit);

      logger.info(`Users by course fetched: ${courseCode}, count: ${users.length}`);
      return users;
    } catch (error) {
      logger.error(`Get users by course error: ${error.message}`);
      throw error;
    }
  }

  // Update user online status
  async updateOnlineStatus(userId, isOnline) {
    try {
      const updateData = {
        isOnline,
        lastSeen: new Date()
      };

      await User.findByIdAndUpdate(userId, updateData);
      logger.info(`Online status updated: ${userId}, online: ${isOnline}`);
    } catch (error) {
      logger.error(`Update online status error: ${error.message}`);
      throw error;
    }
  }

  // Update user reputation
  async updateReputation(userId, change) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      user.reputation = Math.max(0, user.reputation + change);
      await user.save();

      logger.info(`Reputation updated: ${userId}, change: ${change}, new: ${user.reputation}`);
      return user.reputation;
    } catch (error) {
      logger.error(`Update reputation error: ${error.message}`);
      throw error;
    }
  }

  // Get user statistics
  async getUserStats(userId) {
    try {
      const user = await User.findById(userId).select('-password');
      if (!user) {
        throw new Error('User not found');
      }

      // Additional stats could be calculated here
      // For now, return basic user info with computed stats
      const stats = {
        profile: user,
        coursesCount: user.courses.length,
        reputation: user.reputation,
        joinedDate: user.createdAt,
        lastActive: user.lastSeen,
        isOnline: user.isOnline
      };

      return stats;
    } catch (error) {
      logger.error(`Get user stats error: ${error.message}`);
      throw error;
    }
  }

  // Delete user account
  async deleteAccount(userId) {
    try {
      const user = await User.findByIdAndDelete(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Here you would also clean up related data:
      // - Remove from groups
      // - Delete messages
      // - Remove matches
      // - etc.

      logger.info(`User account deleted: ${userId}`);
      return { message: 'Account deleted successfully' };
    } catch (error) {
      logger.error(`Delete account error: ${error.message}`);
      throw error;
    }
  }

  // Get recommended users (basic recommendation)
  async getRecommendedUsers(userId, limit = 10) {
    try {
      const currentUser = await User.findById(userId);
      if (!currentUser) {
        throw new Error('User not found');
      }

      // Find users with similar courses or major
      const query = {
        _id: { $ne: userId },
        $or: [
          { 'courses.code': { $in: currentUser.courses.map(c => c.code) } },
          { major: currentUser.major },
          { university: currentUser.university }
        ]
      };

      const recommendedUsers = await User.find(query)
        .select('-password')
        .sort({ reputation: -1, isOnline: -1 })
        .limit(limit);

      logger.info(`Recommended users fetched for: ${userId}, count: ${recommendedUsers.length}`);
      return recommendedUsers;
    } catch (error) {
      logger.error(`Get recommended users error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new UserService();