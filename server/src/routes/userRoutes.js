const express = require('express');
const {
  getProfile,
  updateProfile,
  uploadProfilePicture,
  getUserById,
  searchUsers,
  getUserStats,
  updatePreferences,
  deleteAccount
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { validateProfileUpdate } = require('../middleware/validationMiddleware');
const { uploadSingle } = require('../middleware/uploadMiddleware');

const router = express.Router();

// All user routes are protected
router.use(protect);

// Profile routes
router.route('/profile')
  .get(getProfile)
  .put(validateProfileUpdate, updateProfile);

// Profile picture upload
router.post('/profile/picture', uploadSingle('profilePicture'), uploadProfilePicture);

// User preferences
router.put('/preferences', updatePreferences);

// User statistics
router.get('/stats', getUserStats);

// Search users
router.get('/search', searchUsers);

// Get specific user by ID (public profile)
router.get('/:id', getUserById);

// Delete account
router.delete('/account', deleteAccount);

module.exports = router;