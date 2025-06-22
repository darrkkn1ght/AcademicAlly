const express = require('express');
const {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  refreshToken,
  getMe,
  updatePassword
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { validateRegistration, validateLogin } = require('../middleware/validationMiddleware');

const router = express.Router();

// Public routes
router.post('/register', validateRegistration, register);
router.post('/login', validateLogin, login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/refresh-token', refreshToken);

// Protected routes (require authentication)
router.use(protect); // All routes after this middleware require authentication

router.get('/me', getMe);
router.post('/logout', logout);
router.put('/update-password', updatePassword);

module.exports = router;