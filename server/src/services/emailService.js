const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

/**
 * Email Service for AcademicAlly
 * Handles all email communications including verification, notifications, and marketing
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.emailTemplates = new Map();
    this.rateLimits = new Map(); // Simple rate limiting
    // Do not call this.init() here!
  }

  /**
   * Initialize email service with transporter
   */
  async init() {
    try {
      // Configure email transporter based on environment
      if (process.env.NODE_ENV === 'production') {
        // Production: Use service like SendGrid, AWS SES, etc.
        this.transporter = nodemailer.createTransport({
          service: 'gmail', // or 'sendgrid', 'ses', etc.
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
      } else {
        // Development: Use Ethereal for testing
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass
          }
        });
      }

      // Verify transporter configuration
      await this.transporter.verify();
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      throw new Error('Email service initialization failed');
    }
  }

  /**
   * Send email verification
   */
  async sendVerificationEmail(user, verificationToken) {
    try {
      const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
      
      const mailOptions = {
        from: `"AcademicAlly" <${process.env.EMAIL_FROM}>`,
        to: user.email,
        subject: 'Verify Your AcademicAlly Account',
        html: this.getEmailTemplate('verification', {
          name: user.name,
          verificationUrl,
          university: user.university
        })
      };

      const result = await this.sendEmail(mailOptions);
      logger.auth(`Verification email sent to ${user.email}`);
      return result;
    } catch (error) {
      logger.error('Failed to send verification email:', error);
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user, resetToken) {
    try {
      const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
      
      const mailOptions = {
        from: `"AcademicAlly Support" <${process.env.EMAIL_FROM}>`,
        to: user.email,
        subject: 'Reset Your AcademicAlly Password',
        html: this.getEmailTemplate('password-reset', {
          name: user.name,
          resetUrl,
          expiresIn: '1 hour'
        })
      };

      const result = await this.sendEmail(mailOptions);
      logger.auth(`Password reset email sent to ${user.email}`);
      return result;
    } catch (error) {
      logger.error('Failed to send password reset email:', error);
      throw error;
    }
  }

  /**
   * Send welcome email to new users
   */
  async sendWelcomeEmail(user) {
    try {
      const mailOptions = {
        from: `"AcademicAlly Team" <${process.env.EMAIL_FROM}>`,
        to: user.email,
        subject: 'Welcome to AcademicAlly! 🎓',
        html: this.getEmailTemplate('welcome', {
          name: user.name,
          university: user.university,
          dashboardUrl: `${process.env.CLIENT_URL}/dashboard`,
          profileUrl: `${process.env.CLIENT_URL}/profile`
        })
      };

      const result = await this.sendEmail(mailOptions);
      logger.profile(`Welcome email sent to ${user.email}`);
      return result;
    } catch (error) {
      logger.error('Failed to send welcome email:', error);
      throw error;
    }
  }

  /**
   * Send study match notification
   */
  async sendMatchNotification(user, match) {
    try {
      if (!user.preferences?.emailNotifications?.matches) {
        return { skipped: true, reason: 'User disabled match notifications' };
      }

      const mailOptions = {
        from: `"AcademicAlly" <${process.env.EMAIL_FROM}>`,
        to: user.email,
        subject: 'New Study Partner Match Found! 📚',
        html: this.getEmailTemplate('match-notification', {
          name: user.name,
          matchName: match.name,
          courses: match.commonCourses.join(', '),
          compatibilityScore: match.compatibilityScore,
          viewMatchUrl: `${process.env.CLIENT_URL}/matches/${match._id}`
        })
      };

      const result = await this.sendEmail(mailOptions);
      logger.matching(`Match notification sent to ${user.email}`);
      return result;
    } catch (error) {
      logger.error('Failed to send match notification:', error);
      throw error;
    }
  }

  /**
   * Send group invitation
   */
  async sendGroupInvitation(user, group, inviter) {
    try {
      if (!user.preferences?.emailNotifications?.groups) {
        return { skipped: true, reason: 'User disabled group notifications' };
      }

      const mailOptions = {
        from: `"AcademicAlly" <${process.env.EMAIL_FROM}>`,
        to: user.email,
        subject: `Invitation to Join "${group.name}" Study Group`,
        html: this.getEmailTemplate('group-invitation', {
          name: user.name,
          groupName: group.name,
          inviterName: inviter.name,
          course: group.course,
          description: group.description,
          joinUrl: `${process.env.CLIENT_URL}/groups/${group._id}/join`
        })
      };

      const result = await this.sendEmail(mailOptions);
      logger.group(`Group invitation sent to ${user.email}`);
      return result;
    } catch (error) {
      logger.error('Failed to send group invitation:', error);
      throw error;
    }
  }

  /**
   * Send new message notification
   */
  async sendMessageNotification(recipient, sender, message, isGroup = false) {
    try {
      const notificationKey = isGroup ? 'groupMessages' : 'directMessages';
      if (!recipient.preferences?.emailNotifications?.[notificationKey]) {
        return { skipped: true, reason: 'User disabled message notifications' };
      }

      // Rate limiting: max 1 notification per hour per conversation
      const rateLimitKey = `${recipient._id}-${isGroup ? message.groupId : sender._id}`;
      if (this.isRateLimited(rateLimitKey, 3600000)) { // 1 hour
        return { skipped: true, reason: 'Rate limited' };
      }

      const subject = isGroup 
        ? `New message in "${message.groupName}" group`
        : `New message from ${sender.name}`;

      const mailOptions = {
        from: `"AcademicAlly" <${process.env.EMAIL_FROM}>`,
        to: recipient.email,
        subject,
        html: this.getEmailTemplate('message-notification', {
          recipientName: recipient.name,
          senderName: sender.name,
          messagePreview: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
          isGroup,
          groupName: message.groupName,
          viewUrl: `${process.env.CLIENT_URL}/messages${isGroup ? `/groups/${message.groupId}` : `/${sender._id}`}`
        })
      };

      const result = await this.sendEmail(mailOptions);
      logger.message(`Message notification sent to ${recipient.email}`);
      return result;
    } catch (error) {
      logger.error('Failed to send message notification:', error);
      throw error;
    }
  }

  /**
   * Send weekly activity digest
   */
  async sendWeeklyDigest(user, activityData) {
    try {
      if (!user.preferences?.emailNotifications?.weeklyDigest) {
        return { skipped: true, reason: 'User disabled weekly digest' };
      }

      const mailOptions = {
        from: `"AcademicAlly Weekly" <${process.env.EMAIL_FROM}>`,
        to: user.email,
        subject: 'Your Weekly Study Summary 📊',
        html: this.getEmailTemplate('weekly-digest', {
          name: user.name,
          newMatches: activityData.newMatches,
          studySessions: activityData.studySessions,
          groupActivity: activityData.groupActivity,
          upcomingEvents: activityData.upcomingEvents,
          dashboardUrl: `${process.env.CLIENT_URL}/dashboard`
        })
      };

      const result = await this.sendEmail(mailOptions);
      logger.info(`Weekly digest sent to ${user.email}`);
      return result;
    } catch (error) {
      logger.error('Failed to send weekly digest:', error);
      throw error;
    }
  }

  /**
   * Core email sending method with error handling
   */
  async sendEmail(mailOptions) {
    try {
      const info = await this.transporter.sendMail(mailOptions);
      
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      }

      return {
        messageId: info.messageId,
        success: true,
        previewUrl: process.env.NODE_ENV !== 'production' ? nodemailer.getTestMessageUrl(info) : null
      };
    } catch (error) {
      logger.error('Email sending failed:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Get email template by type
   */
  getEmailTemplate(templateType, data) {
    const templates = {
      verification: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to AcademicAlly! 🎓</h1>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e5e5; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Hi ${data.name}!</h2>
            <p style="color: #666; line-height: 1.6;">
              Thanks for joining AcademicAlly at ${data.university}! You're one step away from connecting with amazing study partners.
            </p>
            <p style="color: #666; line-height: 1.6;">
              Please verify your email address to activate your account:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${data.verificationUrl}" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Verify Email Address
              </a>
            </div>
            <p style="color: #999; font-size: 14px;">
              If you didn't create this account, you can safely ignore this email.
            </p>
          </div>
        </div>
      `,
      
      'password-reset': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #f8f9fa; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #333; margin: 0; font-size: 24px;">Password Reset Request</h1>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e5e5; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Hi ${data.name}!</h2>
            <p style="color: #666; line-height: 1.6;">
              We received a request to reset your AcademicAlly password. Click the button below to create a new password:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${data.resetUrl}" style="background: #dc3545; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #666; line-height: 1.6;">
              This link will expire in ${data.expiresIn}. If you didn't request this reset, please ignore this email.
            </p>
          </div>
        </div>
      `,
      
      welcome: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to AcademicAlly! 🎉</h1>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e5e5; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Hi ${data.name}!</h2>
            <p style="color: #666; line-height: 1.6;">
              Your account at ${data.university} is now active! You're ready to start finding amazing study partners and groups.
            </p>
            <h3 style="color: #333;">Get Started:</h3>
            <ul style="color: #666; line-height: 1.8;">
              <li>Complete your profile to get better matches</li>
              <li>Browse study groups in your courses</li>
              <li>Connect with compatible study partners</li>
              <li>Start collaborating and succeed together!</li>
            </ul>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${data.dashboardUrl}" style="background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-right: 10px;">
                Go to Dashboard
              </a>
              <a href="${data.profileUrl}" style="background: #6c757d; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Complete Profile
              </a>
            </div>
          </div>
        </div>
      `,

      'match-notification': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #17a2b8; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">New Study Match Found! 📚</h1>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e5e5; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Hi ${data.name}!</h2>
            <p style="color: #666; line-height: 1.6;">
              Great news! We found a compatible study partner for you:
            </p>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333; margin: 0 0 10px 0;">${data.matchName}</h3>
              <p style="color: #666; margin: 5px 0;"><strong>Common courses:</strong> ${data.courses}</p>
              <p style="color: #666; margin: 5px 0;"><strong>Compatibility:</strong> ${data.compatibilityScore}% match</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${data.viewMatchUrl}" style="background: #17a2b8; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                View Match Details
              </a>
            </div>
          </div>
        </div>
      `,

      'group-invitation': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #fd7e14; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Study Group Invitation 👥</h1>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e5e5; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Hi ${data.name}!</h2>
            <p style="color: #666; line-height: 1.6;">
              ${data.inviterName} has invited you to join their study group:
            </p>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333; margin: 0 0 10px 0;">${data.groupName}</h3>
              <p style="color: #666; margin: 5px 0;"><strong>Course:</strong> ${data.course}</p>
              <p style="color: #666; margin: 5px 0;">${data.description}</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${data.joinUrl}" style="background: #fd7e14; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Join Group
              </a>
            </div>
          </div>
        </div>
      `,

      'message-notification': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #6f42c1; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">New Message 💬</h1>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e5e5; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Hi ${data.recipientName}!</h2>
            <p style="color: #666; line-height: 1.6;">
              You have a new message from ${data.senderName}${data.isGroup ? ` in "${data.groupName}" group` : ''}:
            </p>
            <div style="background: #f8f9fa; padding: 15px; border-left: 4px solid #6f42c1; margin: 20px 0;">
              <p style="color: #666; margin: 0; font-style: italic;">"${data.messagePreview}"</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${data.viewUrl}" style="background: #6f42c1; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                View Message
              </a>
            </div>
          </div>
        </div>
      `,

      'weekly-digest': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #e83e8c 0%, #fd7e14 100%); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Your Weekly Study Summary 📊</h1>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e5e5; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Hi ${data.name}!</h2>
            <p style="color: #666; line-height: 1.6;">Here's what happened in your AcademicAlly world this week:</p>
            
            <div style="display: flex; flex-wrap: wrap; gap: 20px; margin: 20px 0;">
              <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; text-align: center; min-width: 120px;">
                <h3 style="color: #0066cc; margin: 0; font-size: 24px;">${data.newMatches}</h3>
                <p style="color: #666; margin: 5px 0; font-size: 14px;">New Matches</p>
              </div>
              <div style="background: #f0fff4; padding: 15px; border-radius: 8px; text-align: center; min-width: 120px;">
                <h3 style="color: #28a745; margin: 0; font-size: 24px;">${data.studySessions}</h3>
                <p style="color: #666; margin: 5px 0; font-size: 14px;">Study Sessions</p>
              </div>
              <div style="background: #fff8e1; padding: 15px; border-radius: 8px; text-align: center; min-width: 120px;">
                <h3 style="color: #ff9800; margin: 0; font-size: 24px;">${data.groupActivity}</h3>
                <p style="color: #666; margin: 5px 0; font-size: 14px;">Group Messages</p>
              </div>
            </div>
            
            ${data.upcomingEvents && data.upcomingEvents.length > 0 ? `
            <h3 style="color: #333;">Upcoming This Week:</h3>
            <ul style="color: #666; line-height: 1.8;">
              ${data.upcomingEvents.map(event => `<li>${event}</li>`).join('')}
            </ul>
            ` : ''}
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${data.dashboardUrl}" style="background: #e83e8c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                View Dashboard
              </a>
            </div>
          </div>
        </div>
      `
    };

    return templates[templateType] || '<p>Email template not found</p>';
  }

  /**
   * Simple rate limiting check
   */
  isRateLimited(key, windowMs) {
    const now = Date.now();
    const lastSent = this.rateLimits.get(key);
    
    if (!lastSent || (now - lastSent) > windowMs) {
      this.rateLimits.set(key, now);
      return false;
    }
    
    return true;
  }

  /**
   * Clean up old rate limit entries
   */
  cleanupRateLimits() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [key, timestamp] of this.rateLimits.entries()) {
      if ((now - timestamp) > maxAge) {
        this.rateLimits.delete(key);
      }
    }
  }

  /**
   * Health check for email service
   */
  async healthCheck() {
    try {
      await this.transporter.verify();
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      logger.error('Email service health check failed:', error);
      return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
    }
  }
}

// Singleton instance
const emailService = new EmailService();

// Cleanup rate limits every hour
setInterval(() => {
  emailService.cleanupRateLimits();
}, 60 * 60 * 1000);

module.exports = emailService;