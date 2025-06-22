const User = require('../models/User');
const Match = require('../models/Match');
const logger = require('../utils/logger');

/**
 * Matching Service for AcademicAlly
 * Handles finding compatible study partners based on courses, preferences, and compatibility factors
 */

class MatchingService {
  constructor() {
    this.compatibilityWeights = {
      courseOverlap: 0.4,        // 40% - Most important factor
      studyStyle: 0.2,           // 20% - Learning preference compatibility
      availability: 0.15,        // 15% - Time availability overlap
      location: 0.15,            // 15% - Location preference compatibility
      academicGoals: 0.1         // 10% - Academic goals alignment
    };
  }

  /**
   * Find potential study partners for a user
   * @param {string} userId - User ID looking for matches
   * @param {Object} filters - Optional filters for matching
   * @param {number} limit - Maximum number of matches to return
   * @returns {Array} Array of potential matches with compatibility scores
   */
  async findMatches(userId, filters = {}, limit = 20) {
    try {
      logger.matching('find_matches_started', userId, null, { filters, limit });

      // Get the user requesting matches
      const currentUser = await User.findById(userId).select('-password');
      if (!currentUser) {
        throw new Error('User not found');
      }

      // Get all potential matches (exclude current user and blocked users)
      const excludeUsers = [userId, ...currentUser.blockedUsers, ...currentUser.blockedBy];
      
      const query = {
        _id: { $nin: excludeUsers },
        isActive: true,
        verified: true
      };

      // Apply filters
      if (filters.university) {
        query.university = filters.university;
      }
      if (filters.year) {
        query.year = filters.year;
      }
      if (filters.major) {
        query.major = { $regex: filters.major, $options: 'i' };
      }
      if (filters.courses && filters.courses.length > 0) {
        query.courses = { $in: filters.courses };
      }

      const potentialMatches = await User.find(query)
        .select('-password -blockedUsers -blockedBy')
        .limit(limit * 3); // Get more candidates to ensure quality matches

      // Calculate compatibility scores
      const matchesWithScores = await Promise.all(
        potentialMatches.map(async (candidate) => {
          const compatibility = await this.calculateCompatibility(currentUser, candidate);
          return {
            user: candidate,
            compatibilityScore: compatibility.totalScore,
            compatibilityBreakdown: compatibility.breakdown,
            commonCourses: compatibility.commonCourses,
            matchReason: compatibility.reason
          };
        })
      );

      // Sort by compatibility score and take top matches
      const topMatches = matchesWithScores
        .filter(match => match.compatibilityScore >= 0.3) // Minimum 30% compatibility
        .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
        .slice(0, limit);

      // Check for existing matches to avoid duplicates
      const existingMatches = await Match.find({
        $or: [
          { user1: userId, user2: { $in: topMatches.map(m => m.user._id) } },
          { user2: userId, user1: { $in: topMatches.map(m => m.user._id) } }
        ]
      });

      const existingMatchUserIds = new Set();
      existingMatches.forEach(match => {
        existingMatchUserIds.add(match.user1.toString());
        existingMatchUserIds.add(match.user2.toString());
      });

      // Filter out existing matches
      const newMatches = topMatches.filter(match => 
        !existingMatchUserIds.has(match.user._id.toString())
      );

      logger.matching('find_matches_completed', userId, null, {
        totalCandidates: potentialMatches.length,
        qualifiedMatches: topMatches.length,
        newMatches: newMatches.length
      });

      return newMatches;

    } catch (error) {
      logger.error('Error finding matches', error, { userId, filters });
      throw error;
    }
  }

  /**
   * Calculate compatibility score between two users
   * @param {Object} user1 - First user object
   * @param {Object} user2 - Second user object
   * @returns {Object} Compatibility analysis with scores and breakdown
   */
  async calculateCompatibility(user1, user2) {
    try {
      const breakdown = {};
      let totalScore = 0;

      // 1. Course Overlap Score (40% weight)
      const courseScore = this.calculateCourseOverlap(user1.courses, user2.courses);
      breakdown.courseOverlap = courseScore;
      totalScore += courseScore * this.compatibilityWeights.courseOverlap;

      // 2. Study Style Compatibility (20% weight)
      const studyStyleScore = this.calculateStudyStyleCompatibility(
        user1.studyPreferences, 
        user2.studyPreferences
      );
      breakdown.studyStyle = studyStyleScore;
      totalScore += studyStyleScore * this.compatibilityWeights.studyStyle;

      // 3. Availability Overlap (15% weight)
      const availabilityScore = this.calculateAvailabilityOverlap(
        user1.availability, 
        user2.availability
      );
      breakdown.availability = availabilityScore;
      totalScore += availabilityScore * this.compatibilityWeights.availability;

      // 4. Location Compatibility (15% weight)
      const locationScore = this.calculateLocationCompatibility(
        user1.location, 
        user2.location,
        user1.studyPreferences,
        user2.studyPreferences
      );
      breakdown.location = locationScore;
      totalScore += locationScore * this.compatibilityWeights.location;

      // 5. Academic Goals Alignment (10% weight)
      const goalsScore = this.calculateGoalsAlignment(
        user1.studyPreferences?.academicGoals,
        user2.studyPreferences?.academicGoals
      );
      breakdown.academicGoals = goalsScore;
      totalScore += goalsScore * this.compatibilityWeights.academicGoals;

      // Find common courses for display
      const commonCourses = user1.courses.filter(course => 
        user2.courses.includes(course)
      );

      // Generate match reason
      const reason = this.generateMatchReason(breakdown, commonCourses);

      return {
        totalScore: Math.round(totalScore * 100) / 100, // Round to 2 decimal places
        breakdown,
        commonCourses,
        reason
      };

    } catch (error) {
      logger.error('Error calculating compatibility', error, {
        user1Id: user1._id,
        user2Id: user2._id
      });
      return {
        totalScore: 0,
        breakdown: {},
        commonCourses: [],
        reason: 'Unable to calculate compatibility'
      };
    }
  }

  /**
   * Calculate course overlap score
   * @param {Array} courses1 - First user's courses
   * @param {Array} courses2 - Second user's courses
   * @returns {number} Score between 0 and 1
   */
  calculateCourseOverlap(courses1, courses2) {
    if (!courses1?.length || !courses2?.length) return 0;

    const commonCourses = courses1.filter(course => courses2.includes(course));
    const totalUniqueCourses = new Set([...courses1, ...courses2]).size;
    
    // Jaccard similarity with bonus for high overlap
    const jaccardSimilarity = commonCourses.length / totalUniqueCourses;
    const overlapBonus = Math.min(commonCourses.length / 3, 0.3); // Bonus up to 0.3 for 3+ common courses
    
    return Math.min(jaccardSimilarity + overlapBonus, 1);
  }

  /**
   * Calculate study style compatibility
   * @param {Object} prefs1 - First user's study preferences
   * @param {Object} prefs2 - Second user's study preferences
   * @returns {number} Score between 0 and 1
   */
  calculateStudyStyleCompatibility(prefs1, prefs2) {
    if (!prefs1 || !prefs2) return 0.5; // Neutral score if preferences not set

    let score = 0;
    let factors = 0;

    // Study intensity compatibility
    if (prefs1.studyIntensity && prefs2.studyIntensity) {
      const intensityDiff = Math.abs(prefs1.studyIntensity - prefs2.studyIntensity);
      score += Math.max(0, 1 - intensityDiff / 4); // Scale 1-5, perfect match = 1, opposite = 0
      factors++;
    }

    // Group size preference compatibility
    if (prefs1.preferredGroupSize && prefs2.preferredGroupSize) {
      const sizeDiff = Math.abs(prefs1.preferredGroupSize - prefs2.preferredGroupSize);
      score += Math.max(0, 1 - sizeDiff / 3); // Scale typically 1-4
      factors++;
    }

    // Study environment preference
    if (prefs1.studyEnvironment && prefs2.studyEnvironment) {
      const envMatch = prefs1.studyEnvironment === prefs2.studyEnvironment ? 1 : 0.3;
      score += envMatch;
      factors++;
    }

    // Study method compatibility
    if (prefs1.studyMethods && prefs2.studyMethods) {
      const commonMethods = prefs1.studyMethods.filter(method => 
        prefs2.studyMethods.includes(method)
      );
      const methodScore = commonMethods.length / Math.max(prefs1.studyMethods.length, prefs2.studyMethods.length);
      score += methodScore;
      factors++;
    }

    return factors > 0 ? score / factors : 0.5;
  }

  /**
   * Calculate availability overlap
   * @param {Object} avail1 - First user's availability
   * @param {Object} avail2 - Second user's availability
   * @returns {number} Score between 0 and 1
   */
  calculateAvailabilityOverlap(avail1, avail2) {
    if (!avail1 || !avail2) return 0.5; // Neutral if availability not set

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    let totalOverlap = 0;
    let totalPossible = 0;

    days.forEach(day => {
      if (avail1[day] && avail2[day]) {
        const overlap = this.calculateTimeOverlap(avail1[day], avail2[day]);
        totalOverlap += overlap;
        totalPossible += Math.max(avail1[day].length, avail2[day].length);
      }
    });

    return totalPossible > 0 ? totalOverlap / totalPossible : 0;
  }

  /**
   * Calculate time overlap for a specific day
   * @param {Array} times1 - First user's time slots
   * @param {Array} times2 - Second user's time slots
   * @returns {number} Number of overlapping time slots
   */
  calculateTimeOverlap(times1, times2) {
    if (!Array.isArray(times1) || !Array.isArray(times2)) return 0;
    
    return times1.filter(time => times2.includes(time)).length;
  }

  /**
   * Calculate location compatibility
   * @param {Object} loc1 - First user's location
   * @param {Object} loc2 - Second user's location
   * @param {Object} prefs1 - First user's study preferences
   * @param {Object} prefs2 - Second user's study preferences
   * @returns {number} Score between 0 and 1
   */
  calculateLocationCompatibility(loc1, loc2, prefs1, prefs2) {
    // If both prefer online study, location doesn't matter
    if (prefs1?.studyLocation === 'online' && prefs2?.studyLocation === 'online') {
      return 1;
    }

    // If one prefers online and other doesn't, partial compatibility
    if ((prefs1?.studyLocation === 'online') !== (prefs2?.studyLocation === 'online')) {
      return 0.6;
    }

    // For in-person preferences, check location proximity
    if (!loc1 || !loc2) return 0.5;

    // Same campus/university
    if (loc1.campus === loc2.campus) return 1;

    // Same city
    if (loc1.city === loc2.city) return 0.8;

    // Same state/region
    if (loc1.state === loc2.state) return 0.4;

    return 0.2; // Different regions but same country
  }

  /**
   * Calculate academic goals alignment
   * @param {Array} goals1 - First user's academic goals
   * @param {Array} goals2 - Second user's academic goals
   * @returns {number} Score between 0 and 1
   */
  calculateGoalsAlignment(goals1, goals2) {
    if (!goals1?.length || !goals2?.length) return 0.5;

    const commonGoals = goals1.filter(goal => goals2.includes(goal));
    const totalUniqueGoals = new Set([...goals1, ...goals2]).size;
    
    return commonGoals.length / totalUniqueGoals;
  }

  /**
   * Generate a human-readable match reason
   * @param {Object} breakdown - Compatibility breakdown
   * @param {Array} commonCourses - Common courses
   * @returns {string} Match reason
   */
  generateMatchReason(breakdown, commonCourses) {
    const reasons = [];

    if (breakdown.courseOverlap > 0.7) {
      reasons.push(`${commonCourses.length} courses in common`);
    } else if (breakdown.courseOverlap > 0.4) {
      reasons.push('Some shared courses');
    }

    if (breakdown.studyStyle > 0.8) {
      reasons.push('Very compatible study styles');
    } else if (breakdown.studyStyle > 0.6) {
      reasons.push('Similar study preferences');
    }

    if (breakdown.availability > 0.7) {
      reasons.push('Great schedule compatibility');
    } else if (breakdown.availability > 0.5) {
      reasons.push('Some overlapping availability');
    }

    if (breakdown.location > 0.8) {
      reasons.push('Same location/campus');
    }

    if (reasons.length === 0) {
      reasons.push('Potential study compatibility');
    }

    return reasons.slice(0, 2).join(' and '); // Take top 2 reasons
  }

  /**
   * Create a match between two users
   * @param {string} userId1 - First user ID
   * @param {string} userId2 - Second user ID
   * @returns {Object} Created match object
   */
  async createMatch(userId1, userId2) {
    try {
      // Check if match already exists
      const existingMatch = await Match.findOne({
        $or: [
          { user1: userId1, user2: userId2 },
          { user1: userId2, user2: userId1 }
        ]
      });

      if (existingMatch) {
        throw new Error('Match already exists');
      }

      // Get both users to calculate compatibility
      const [user1, user2] = await Promise.all([
        User.findById(userId1).select('-password'),
        User.findById(userId2).select('-password')
      ]);

      if (!user1 || !user2) {
        throw new Error('One or both users not found');
      }

      // Calculate compatibility
      const compatibility = await this.calculateCompatibility(user1, user2);

      // Create match
      const match = new Match({
        user1: userId1,
        user2: userId2,
        compatibilityScore: compatibility.totalScore,
        status: 'pending',
        courses: compatibility.commonCourses,
        reason: compatibility.reason,
        createdAt: new Date()
      });

      await match.save();

      logger.matching('match_created', userId1, userId2, {
        matchId: match._id,
        compatibilityScore: compatibility.totalScore
      });

      return match;

    } catch (error) {
      logger.error('Error creating match', error, { userId1, userId2 });
      throw error;
    }
  }

  /**
   * Update match status (accept, reject, etc.)
   * @param {string} matchId - Match ID
   * @param {string} userId - User ID performing the action
   * @param {string} status - New status (accepted, rejected, blocked)
   * @returns {Object} Updated match
   */
  async updateMatchStatus(matchId, userId, status) {
    try {
      const match = await Match.findById(matchId);
      if (!match) {
        throw new Error('Match not found');
      }

      // Verify user is part of this match
      if (match.user1.toString() !== userId && match.user2.toString() !== userId) {
        throw new Error('Unauthorized to update this match');
      }

      match.status = status;
      match.updatedAt = new Date();

      // Set who performed the action
      if (match.user1.toString() === userId) {
        match.user1Status = status;
      } else {
        match.user2Status = status;
      }

      await match.save();

      logger.matching('match_status_updated', userId, null, {
        matchId,
        newStatus: status
      });

      return match;

    } catch (error) {
      logger.error('Error updating match status', error, { matchId, userId, status });
      throw error;
    }
  }

  /**
   * Get matches for a user
   * @param {string} userId - User ID
   * @param {string} status - Optional status filter
   * @returns {Array} User's matches
   */
  async getUserMatches(userId, status = null) {
    try {
      const query = {
        $or: [
          { user1: userId },
          { user2: userId }
        ]
      };

      if (status) {
        query.status = status;
      }

      const matches = await Match.find(query)
        .populate('user1', 'name university major profilePicture')
        .populate('user2', 'name university major profilePicture')
        .sort({ createdAt: -1 });

      return matches;

    } catch (error) {
      logger.error('Error getting user matches', error, { userId, status });
      throw error;
    }
  }
}

module.exports = new MatchingService();