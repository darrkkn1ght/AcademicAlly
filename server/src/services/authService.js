const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { generateToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const logger = require('../utils/logger');

class AuthService {
  // Register new user
  async register(userData) {
    try {
      const { email, password, name, university, year, major } = userData;

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        throw new Error('User already exists with this email');
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create new user
      const user = new User({
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        university,
        year,
        major,
        isOnline: true,
        lastSeen: new Date()
      });

      const savedUser = await user.save();

      // Generate tokens
      const token = generateToken(savedUser._id);
      const refreshToken = generateRefreshToken(savedUser._id);

      // Remove password from response
      const userResponse = savedUser.toObject();
      delete userResponse.password;

      logger.info(`User registered successfully: ${email}`);

      return {
        user: userResponse,
        token,
        refreshToken
      };
    } catch (error) {
      logger.error(`Registration error: ${error.message}`);
      throw error;
    }
  }

  // Login user
  async login(email, password) {
    try {
      // Find user by email
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Check password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new Error('Invalid credentials');
      }

      // Update user online status
      user.isOnline = true;
      user.lastSeen = new Date();
      await user.save();

      // Generate tokens
      const token = generateToken(user._id);
      const refreshToken = generateRefreshToken(user._id);

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      logger.info(`User logged in successfully: ${email}`);

      return {
        user: userResponse,
        token,
        refreshToken
      };
    } catch (error) {
      logger.error(`Login error: ${error.message}`);
      throw error;
    }
  }

  // Refresh access token
  async refreshToken(refreshToken) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      const newToken = generateToken(user._id);
      const newRefreshToken = generateRefreshToken(user._id);

      logger.info(`Token refreshed for user: ${user.email}`);

      return {
        token: newToken,
        refreshToken: newRefreshToken
      };
    } catch (error) {
      logger.error(`Token refresh error: ${error.message}`);
      throw new Error('Invalid refresh token');
    }
  }

  // Logout user
  async logout(userId) {
    try {
      const user = await User.findById(userId);
      if (user) {
        user.isOnline = false;
        user.lastSeen = new Date();
        await user.save();
        
        logger.info(`User logged out: ${user.email}`);
      }
    } catch (error) {
      logger.error(`Logout error: ${error.message}`);
      throw error;
    }
  }

  // Change password
  async changePassword(userId, currentPassword, newPassword) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const saltRounds = 12;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      user.password = hashedNewPassword;
      await user.save();

      logger.info(`Password changed for user: ${user.email}`);

      return { message: 'Password changed successfully' };
    } catch (error) {
      logger.error(`Change password error: ${error.message}`);
      throw error;
    }
  }

  // Reset password request
  async requestPasswordReset(email) {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        // Don't reveal if email exists or not
        return { message: 'If the email exists, a reset link has been sent' };
      }

      // Generate reset token (expires in 1 hour)
      const resetToken = jwt.sign(
        { userId: user._id, purpose: 'password-reset' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      // In production, send email with reset link
      // For now, just log the token
      logger.info(`Password reset requested for: ${email}, token: ${resetToken}`);

      return { message: 'If the email exists, a reset link has been sent' };
    } catch (error) {
      logger.error(`Password reset request error: ${error.message}`);
      throw error;
    }
  }

  // Reset password with token
  async resetPassword(token, newPassword) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (decoded.purpose !== 'password-reset') {
        throw new Error('Invalid reset token');
      }

      const user = await User.findById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Hash new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      user.password = hashedPassword;
      await user.save();

      logger.info(`Password reset completed for user: ${user.email}`);

      return { message: 'Password reset successfully' };
    } catch (error) {
      logger.error(`Password reset error: ${error.message}`);
      throw new Error('Invalid or expired reset token');
    }
  }

  // Verify email (for future email verification feature)
  async verifyEmail(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (decoded.purpose !== 'email-verification') {
        throw new Error('Invalid verification token');
      }

      const user = await User.findById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      user.isEmailVerified = true;
      await user.save();

      logger.info(`Email verified for user: ${user.email}`);

      return { message: 'Email verified successfully' };
    } catch (error) {
      logger.error(`Email verification error: ${error.message}`);
      throw new Error('Invalid or expired verification token');
    }
  }

  // Get user by token
  async getUserByToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      logger.error(`Get user by token error: ${error.message}`);
      throw new Error('Invalid token');
    }
  }
}

module.exports = new AuthService();