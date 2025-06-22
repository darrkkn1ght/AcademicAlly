const User = require('../models/User');
const asyncHandler = require('express-async-handler');
const multer = require('multer');
const path = require('path');

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const {
    name,
    university,
    year,
    major,
    bio,
    courses,
    studyPreferences,
    availability,
    location
  } = req.body;

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Update fields if provided
  if (name) user.name = name;
  if (university) user.university = university;
  if (year) user.year = year;
  if (major) user.major = major;
  if (bio) user.bio = bio;
  if (courses) user.courses = courses;
  if (studyPreferences) user.studyPreferences = { ...user.studyPreferences, ...studyPreferences };
  if (availability) user.availability = { ...user.availability, ...availability };
  if (location) user.location = location;

  user.profileCompleted = true;

  const updatedUser = await user.save();

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      university: updatedUser.university,
      year: updatedUser.year,
      major: updatedUser.major,
      bio: updatedUser.bio,
      courses: updatedUser.courses,
      studyPreferences: updatedUser.studyPreferences,
      availability: updatedUser.availability,
      location: updatedUser.location,
      profileCompleted: updatedUser.profileCompleted,
      reputation: updatedUser.reputation
    }
  });
});

// @desc    Upload profile picture
// @route   POST /api/users/profile/picture
// @access  Private
const uploadProfilePicture = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Please upload a file'
    });
  }

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // In production, you would upload to Cloudinary or AWS S3
  // For now, we'll just store the filename
  user.profilePicture = `/uploads/profiles/${req.file.filename}`;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Profile picture uploaded successfully',
    data: {
      profilePicture: user.profilePicture
    }
  });
});

// @desc    Get user by ID (public profile)
// @route   GET /api/users/:id
// @access  Private
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password -email');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Return limited public profile information
  const publicProfile = {
    _id: user._id,
    name: user.name,
    university: user.university,
    year: user.year,
    major: user.major,
    bio: user.bio,
    courses: user.courses,
    profilePicture: user.profilePicture,
    reputation: user.reputation,
    studyPreferences: {
      subjects: user.studyPreferences.subjects,
      groupSize: user.studyPreferences.groupSize,
      studyStyle: user.studyPreferences.studyStyle
    },
    createdAt: user.createdAt
  };

  res.status(200).json({
    success: true,
    data: publicProfile
  });
});

// @desc    Search users by course or university
// @route   GET /api/users/search
// @access  Private
const searchUsers = asyncHandler(async (req, res) => {
  const { course, university, year, major, page = 1, limit = 10 } = req.query;
  
  let query = {
    _id: { $ne: req.user.id }, // Exclude current user
    profileCompleted: true
  };

  // Build search criteria
  if (course) {
    query.courses = { $regex: course, $options: 'i' };
  }
  
  if (university) {
    query.university = { $regex: university, $options: 'i' };
  }
  
  if (year) {
    query.year = year;
  }
  
  if (major) {
    query.major = { $regex: major, $options: 'i' };
  }

  const users = await User.find(query)
    .select('-password -email')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ reputation: -1, createdAt: -1 });

  const total = await User.countDocuments(query);

  res.status(200).json({
    success: true,
    data: users,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private
const getUserStats = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // You can expand this with more detailed statistics
  const stats = {
    reputation: user.reputation,
    totalSessions: user.sessionsCompleted || 0,
    totalGroups: user.groupsJoined || 0,
    joinDate: user.createdAt,
    profileCompleteness: calculateProfileCompleteness(user)
  };

  res.status(200).json({
    success: true,
    data: stats
  });
});

// @desc    Update user preferences
// @route   PUT /api/users/preferences
// @access  Private
const updatePreferences = asyncHandler(async (req, res) => {
  const { studyPreferences, availability, notifications } = req.body;

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  if (studyPreferences) {
    user.studyPreferences = { ...user.studyPreferences, ...studyPreferences };
  }

  if (availability) {
    user.availability = { ...user.availability, ...availability };
  }

  if (notifications) {
    user.notifications = { ...user.notifications, ...notifications };
  }

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Preferences updated successfully',
    data: {
      studyPreferences: user.studyPreferences,
      availability: user.availability,
      notifications: user.notifications
    }
  });
});

// @desc    Delete user account
// @route   DELETE /api/users/account
// @access  Private
const deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // In production, you might want to:
  // 1. Remove user from all groups
  // 2. Delete all messages
  // 3. Clean up any associated data
  // 4. Send confirmation email

  await User.findByIdAndDelete(req.user.id);

  res.status(200).json({
    success: true,
    message: 'Account deleted successfully'
  });
});

// Helper function to calculate profile completeness
const calculateProfileCompleteness = (user) => {
  let completeness = 0;
  const totalFields = 8;

  if (user.name) completeness++;
  if (user.university) completeness++;
  if (user.year) completeness++;
  if (user.major) completeness++;
  if (user.bio) completeness++;
  if (user.courses && user.courses.length > 0) completeness++;
  if (user.profilePicture) completeness++;
  if (user.studyPreferences && Object.keys(user.studyPreferences).length > 0) completeness++;

  return Math.round((completeness / totalFields) * 100);
};

module.exports = {
  getProfile,
  updateProfile,
  uploadProfilePicture,
  getUserById,
  searchUsers,
  getUserStats,
  updatePreferences,
  deleteAccount
};