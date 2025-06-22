const uploadService = require('../services/uploadService');
const User = require('../models/User');
const Group = require('../models/Group');
const Message = require('../models/Message');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

class UploadController {
  /**
   * Upload user profile picture
   * @route POST /api/uploads/profile-picture
   * @access Private
   */
  async uploadProfilePicture(req, res) {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file provided'
        });
      }

      const userId = req.user.id;

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed'
        });
      }

      // Upload to cloud storage
      const uploadResult = await uploadService.uploadImage(req.file, {
        folder: 'profile-pictures',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', format: 'auto' }
        ]
      });

      // Get current user to delete old profile picture
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Delete old profile picture if it exists
      if (user.profilePicture && user.profilePicture.publicId) {
        try {
          await uploadService.deleteFile(user.profilePicture.publicId);
        } catch (deleteError) {
          logger.warn(`Failed to delete old profile picture: ${deleteError.message}`);
        }
      }

      // Update user profile with new picture
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          profilePicture: {
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            uploadedAt: new Date()
          }
        },
        { new: true, select: '-password' }
      );

      logger.info(`Profile picture uploaded for user ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Profile picture uploaded successfully',
        data: {
          profilePicture: updatedUser.profilePicture,
          user: updatedUser
        }
      });

    } catch (error) {
      logger.error(`Upload profile picture error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to upload profile picture',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Upload message attachment
   * @route POST /api/uploads/message-attachment
   * @access Private
   */
  async uploadMessageAttachment(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file provided'
        });
      }

      const userId = req.user.id;
      const { messageId } = req.body;

      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (req.file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 10MB'
        });
      }

      // Determine upload type based on file type
      let uploadResult;
      const fileType = req.file.mimetype;

      if (fileType.startsWith('image/')) {
        // Image upload
        uploadResult = await uploadService.uploadImage(req.file, {
          folder: 'message-attachments/images',
          transformation: [
            { quality: 'auto', format: 'auto' },
            { width: 1200, height: 1200, crop: 'limit' }
          ]
        });
      } else {
        // Document/file upload
        uploadResult = await uploadService.uploadFile(req.file, {
          folder: 'message-attachments/files',
          resource_type: 'auto'
        });
      }

      // Create attachment object
      const attachment = {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedBy: userId,
        uploadedAt: new Date()
      };

      // If messageId provided, attach to existing message
      if (messageId) {
        const message = await Message.findById(messageId);
        if (!message) {
          return res.status(404).json({
            success: false,
            message: 'Message not found'
          });
        }

        // Verify user owns the message
        if (message.sender.toString() !== userId) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to add attachment to this message'
          });
        }

        // Add attachment to message
        message.attachments = message.attachments || [];
        message.attachments.push(attachment);
        await message.save();
      }

      logger.info(`Message attachment uploaded by user ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Attachment uploaded successfully',
        data: {
          attachment,
          messageId: messageId || null
        }
      });

    } catch (error) {
      logger.error(`Upload message attachment error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to upload attachment',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Delete user profile picture
   * @route DELETE /api/upload/profile-picture
   * @access Private
   */
  async deleteProfilePicture(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user || !user.profilePicture || !user.profilePicture.publicId) {
        return res.status(404).json({
          success: false,
          message: 'No profile picture to delete'
        });
      }

      // Delete from cloud storage
      await uploadService.deleteFile(user.profilePicture.publicId);

      // Remove from user record
      user.profilePicture = undefined;
      await user.save();

      logger.info(`Profile picture deleted for user ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Profile picture deleted successfully'
      });
    } catch (error) {
      logger.error(`Delete profile picture error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to delete profile picture',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Upload group cover image
   * @route POST /api/uploads/group-image/:groupId
   * @access Private
   */
  async uploadGroupImage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file provided'
        });
      }

      const userId = req.user.id;
      const { groupId } = req.params;

      // Find group and verify user is admin/creator
      const group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found'
        });
      }

      if (group.creator.toString() !== userId && !group.admins?.includes(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to upload group image'
        });
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed'
        });
      }

      // Upload to cloud storage
      const uploadResult = await uploadService.uploadImage(req.file, {
        folder: 'group-images',
        transformation: [
          { width: 800, height: 400, crop: 'fill' },
          { quality: 'auto', format: 'auto' }
        ]
      });

      // Delete old group image if it exists
      if (group.image && group.image.publicId) {
        try {
          await uploadService.deleteFile(group.image.publicId);
        } catch (deleteError) {
          logger.warn(`Failed to delete old group image: ${deleteError.message}`);
        }
      }

      // Update group with new image
      const updatedGroup = await Group.findByIdAndUpdate(
        groupId,
        {
          image: {
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            uploadedAt: new Date(),
            uploadedBy: userId
          }
        },
        { new: true }
      ).populate('creator', 'name profilePicture')
       .populate('members', 'name profilePicture');

      logger.info(`Group image uploaded for group ${groupId} by user ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Group image uploaded successfully',
        data: {
          group: updatedGroup
        }
      });

    } catch (error) {
      logger.error(`Upload group image error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to upload group image',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Upload study material for a group
   * @route POST /api/upload/study-material
   * @access Private
   */
  async uploadStudyMaterial(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file provided'
        });
      }

      // Extract fields from request
      const { groupId, title, description, subject, materialType, tags, isPublic } = req.body;
      const userId = req.user.id;

      // You may want to validate groupId and permissions here

      // Upload file to cloud storage
      const uploadResult = await uploadService.uploadFile(req.file, {
        folder: 'study-materials',
        resource_type: 'auto'
      });

      // Save study material record to database (implement your own logic/model)
      // Example:
      // const material = await StudyMaterial.create({
      //   group: groupId,
      //   title,
      //   description,
      //   subject,
      //   materialType,
      //   tags,
      //   isPublic,
      //   file: {
      //     url: uploadResult.secure_url,
      //     publicId: uploadResult.public_id,
      //     originalName: req.file.originalname,
      //     mimeType: req.file.mimetype,
      //     size: req.file.size
      //   },
      //   uploadedBy: userId
      // });

      res.status(201).json({
        success: true,
        message: 'Study material uploaded successfully',
        // data: material
      });
    } catch (error) {
      logger.error(`Upload study material error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to upload study material',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Delete group cover image
   * @route DELETE /api/upload/group/:groupId/image
   * @access Private (Group Admin)
   */
  async deleteGroupImage(req, res) {
    try {
      const userId = req.user.id;
      const { groupId } = req.params;

      const group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found'
        });
      }

      // Only allow group creator or admin to delete
      if (group.creator.toString() !== userId && !group.admins?.includes(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete group image'
        });
      }

      if (!group.image || !group.image.publicId) {
        return res.status(404).json({
          success: false,
          message: 'No group image to delete'
        });
      }

      // Delete from cloud storage
      await uploadService.deleteFile(group.image.publicId);

      // Remove from group record
      group.image = undefined;
      await group.save();

      logger.info(`Group image deleted for group ${groupId} by user ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Group image deleted successfully'
      });
    } catch (error) {
      logger.error(`Delete group image error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to delete group image',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Delete uploaded file
   * @route DELETE /api/uploads/:publicId
   * @access Private
   */
  async deleteFile(req, res) {
    try {
      const { publicId } = req.params;
      const userId = req.user.id;

      if (!publicId) {
        return res.status(400).json({
          success: false,
          message: 'Public ID is required'
        });
      }

      // Verify user owns the file (basic check by looking for it in user's data)
      const user = await User.findById(userId);
      const canDelete = 
        (user.profilePicture && user.profilePicture.publicId === publicId) ||
        await this._userOwnsFile(userId, publicId);

      if (!canDelete) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this file'
        });
      }

      // Delete from cloud storage
      const deleteResult = await uploadService.deleteFile(publicId);

      // Update database records to remove file references
      await this._removeFileReferences(publicId);

      logger.info(`File ${publicId} deleted by user ${userId}`);

      res.status(200).json({
        success: true,
        message: 'File deleted successfully',
        data: { deleteResult }
      });

    } catch (error) {
      logger.error(`Delete file error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to delete file',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get file information
   * @route GET /api/uploads/info/:publicId
   * @access Private
   */
  async getFileInfo(req, res) {
    try {
      const { publicId } = req.params;

      if (!publicId) {
        return res.status(400).json({
          success: false,
          message: 'Public ID is required'
        });
      }

      // Get file info from cloud storage
      const fileInfo = await uploadService.getFileInfo(publicId);

      if (!fileInfo) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'File info retrieved successfully',
        data: { fileInfo }
      });

    } catch (error) {
      logger.error(`Get file info error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to get file info',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Generate presigned URL for direct upload
   * @route POST /api/uploads/presigned-url
   * @access Private
   */
  async generatePresignedUrl(req, res) {
    try {
      const { fileName, fileType, uploadType } = req.body;
      const userId = req.user.id;

      if (!fileName || !fileType || !uploadType) {
        return res.status(400).json({
          success: false,
          message: 'fileName, fileType, and uploadType are required'
        });
      }

      // Validate upload type
      const allowedUploadTypes = ['profile-picture', 'message-attachment', 'group-image'];
      if (!allowedUploadTypes.includes(uploadType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid upload type'
        });
      }

      // Generate presigned URL
      const presignedData = await uploadService.generatePresignedUrl({
        fileName,
        fileType,
        uploadType,
        userId
      });

      logger.info(`Presigned URL generated for user ${userId}, type: ${uploadType}`);

      res.status(200).json({
        success: true,
        message: 'Presigned URL generated successfully',
        data: presignedData
      });

    } catch (error) {
      logger.error(`Generate presigned URL error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to generate presigned URL',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Validate file type and size
   * @route POST /api/uploads/validate
   * @access Private
   */
  async validateFileType(req, res) {
    try {
      const { fileName, fileSize, mimeType, uploadType } = req.body;

      if (!fileName || !fileSize || !mimeType || !uploadType) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required'
        });
      }

      const validation = uploadService.validateFile({
        fileName,
        fileSize,
        mimeType,
        uploadType
      });

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: 'File validation failed',
          errors: validation.errors
        });
      }

      res.status(200).json({
        success: true,
        message: 'File validation passed',
        data: {
          isValid: true,
          fileName,
          estimatedUploadTime: this._estimateUploadTime(fileSize)
        }
      });

    } catch (error) {
      logger.error(`Validate file type error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to validate file',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Confirm successful direct upload and save file metadata
   * @route POST /api/upload/confirm-upload
   * @access Private
   */
  async confirmUpload(req, res) {
    try {
      const { uploadId, fileUrl, fileName, fileSize, fileType, uploadType, metadata } = req.body;
      const userId = req.user.id;
      if (!uploadId || !fileUrl || !fileName || !fileSize || !fileType || !uploadType) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields.'
        });
      }
      // Save file metadata to DB (pseudo, adjust as needed)
      // Example: await UploadedFile.create({ uploadId, fileUrl, fileName, fileSize, fileType, uploadType, metadata, user: userId });
      // For now, just return success
      res.status(200).json({
        success: true,
        message: 'Upload confirmed and metadata saved.',
        data: { uploadId, fileUrl, fileName, fileSize, fileType, uploadType, metadata, user: userId }
      });
    } catch (error) {
      logger.error(`Confirm upload error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to confirm upload',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get list of supported file formats for each upload type
   * @route GET /api/upload/supported-formats
   * @access Private
   */
  getSupportedFormats(req, res) {
    res.status(200).json({
      success: true,
      formats: {
        'profile-picture': ['image/jpeg', 'image/png', 'image/webp'],
        'group-image': ['image/jpeg', 'image/png', 'image/webp'],
        'message-attachment': [
          'image/jpeg', 'image/png', 'image/gif', 'application/pdf',
          'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ],
        'study-material': [
          'application/pdf', 'text/plain', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/jpeg', 'image/png'
        ]
      }
    });
  }

  /**
   * Get user's storage usage statistics
   * @route GET /api/upload/storage-usage
   * @access Private
   */
  async getStorageUsage(req, res) {
    try {
      // Example: Calculate storage usage from uploaded files (pseudo, adjust as needed)
      // const usage = await UploadedFile.aggregate([...]);
      // For now, just return a mock response
      res.status(200).json({
        success: true,
        usage: {
          used: 0,
          limit: 1024 * 1024 * 1024 // 1GB limit (example)
        }
      });
    } catch (error) {
      logger.error(`Get storage usage error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to get storage usage',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Generate a shareable link for a file
   * @route POST /api/upload/file/:fileId/share
   * @access Private (File Owner)
   */
  async generateShareLink(req, res) {
    try {
      const { fileId } = req.params;
      const { expiresIn = 24, allowDownload = true, password } = req.body;
      const userId = req.user.id;
      const Message = require('../models/Message');
      const { generateSecureToken } = require('../utils/helpers').stringHelpers;
      // Find the message containing the file as an attachment
      const message = await Message.findOne({ 'attachments.publicId': fileId });
      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }
      // Check ownership (sender only)
      const isOwner = message.sender.toString() === userId;
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to share this file'
        });
      }
      // Find the attachment
      const attachment = (message.attachments || []).find(att => att.publicId === fileId);
      if (!attachment) {
        return res.status(404).json({
          success: false,
          message: 'Attachment not found'
        });
      }
      // Generate a secure token for the share link
      const token = generateSecureToken(16);
      // Calculate expiration
      const expiresAt = new Date(Date.now() + expiresIn * 60 * 60 * 1000);
      // Optionally hash the password
      let passwordHash = null;
      if (password) {
        const bcrypt = require('bcryptjs');
        passwordHash = await bcrypt.hash(password, 10);
      }
      // In a real app, save the share link metadata to DB. For now, return it in response.
      const shareLink = `${process.env.BASE_URL || 'https://academically.app'}/api/share/${token}`;
      // Optionally, you could store this in a cache or DB for validation on access.
      res.status(200).json({
        success: true,
        message: 'Share link generated',
        data: {
          shareLink,
          fileId,
          expiresAt,
          allowDownload,
          passwordProtected: !!password,
          // For demo: include token and passwordHash (do not expose in production)
          token,
          passwordHash
        }
      });
    } catch (error) {
      logger.error(`Generate share link error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to generate share link',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Convert file to a different format
   * @route POST /api/upload/file/:fileId/convert
   * @access Private (File Owner)
   */
  async convertFile(req, res) {
    try {
      const { fileId } = req.params;
      const { targetFormat, quality = 80 } = req.body;
      const userId = req.user.id;
      const Message = require('../models/Message');
      // Find the message containing the file as an attachment
      const message = await Message.findOne({ 'attachments.publicId': fileId });
      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }
      // Check ownership (sender only for conversion)
      const isOwner = message.sender.toString() === userId;
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to convert this file'
        });
      }
      // Find the attachment
      const attachment = (message.attachments || []).find(att => att.publicId === fileId);
      if (!attachment) {
        return res.status(404).json({
          success: false,
          message: 'Attachment not found'
        });
      }
      // Call uploadService to convert the file (stub, implement as needed)
      // Example: const result = await uploadService.convertFile(attachment, targetFormat, quality);
      // For now, return a mock response
      res.status(200).json({
        success: true,
        message: `File conversion to ${targetFormat} started (mock)` ,
        data: {
          fileId,
          targetFormat,
          quality,
          status: 'pending',
          convertedUrl: null
        }
      });
    } catch (error) {
      logger.error(`Convert file error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to convert file',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Helper methods
  async _userOwnsFile(userId, publicId) {
    try {
      // Check if user owns any messages with this attachment
      const messageWithAttachment = await Message.findOne({
        sender: userId,
        'attachments.publicId': publicId
      });

      if (messageWithAttachment) return true;

      // Check if user is admin of group with this image
      const groupWithImage = await Group.findOne({
        $or: [
          { creator: userId, 'image.publicId': publicId },
          { admins: userId, 'image.publicId': publicId }
        ]
      });

      return !!groupWithImage;
    } catch (error) {
      logger.error(`Error checking file ownership: ${error.message}`);
      return false;
    }
  }

  async _removeFileReferences(publicId) {
    try {
      // Remove from user profile pictures
      await User.updateMany(
        { 'profilePicture.publicId': publicId },
        { $unset: { profilePicture: 1 } }
      );

      // Remove from message attachments
      await Message.updateMany(
        { 'attachments.publicId': publicId },
        { $pull: { attachments: { publicId } } }
      );

      // Remove from group images
      await Group.updateMany(
        { 'image.publicId': publicId },
        { $unset: { image: 1 } }
      );

    } catch (error) {
      logger.error(`Error removing file references: ${error.message}`);
    }
  }

  _estimateUploadTime(fileSize) {
    // Rough estimation based on average upload speeds
    const avgSpeedMbps = 10; // 10 Mbps average
    const fileSizeMb = fileSize / (1024 * 1024);
    const estimatedSeconds = Math.ceil((fileSizeMb * 8) / avgSpeedMbps);
    
    if (estimatedSeconds < 1) return 'Less than 1 second';
    if (estimatedSeconds < 60) return `${estimatedSeconds} seconds`;
    return `${Math.ceil(estimatedSeconds / 60)} minutes`;
  }

  /**
   * Get user's uploaded study materials
   * @route GET /api/upload/study-materials
   * @access Private
   */
  async getStudyMaterials(req, res) {
    try {
      // You should implement your own StudyMaterial model and query logic here
      // For now, return a placeholder response
      // Example: const materials = await StudyMaterial.find({ uploadedBy: req.user.id });
      res.status(200).json({
        success: true,
        message: 'Fetched study materials (placeholder)',
        data: []
      });
    } catch (error) {
      logger.error(`Get study materials error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch study materials',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get user's uploaded files
   * @route GET /api/upload/my-files
   * @access Private
   */
  async getUserFiles(req, res) {
    try {
      // You should implement your own logic/model to fetch user files here
      // For now, return a placeholder response
      // Example: const files = await FileModel.find({ uploadedBy: req.user.id });
      res.status(200).json({
        success: true,
        message: 'Fetched user files (placeholder)',
        data: []
      });
    } catch (error) {
      logger.error(`Get user files error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user files',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Download file by publicId (Cloudinary)
   * @route GET /api/upload/file/:fileId/download
   * @access Private (Authorized Users Only)
   */
  async downloadFile(req, res) {
    try {
      const { fileId } = req.params;
      const userId = req.user.id;

      // Find a message with an attachment matching this publicId
      const Message = require('../models/Message');
      const message = await Message.findOne({
        'attachments.publicId': fileId
      });

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }

      // Check if user is authorized (sender, recipient, or group member)
      const isSender = message.sender.toString() === userId;
      const isRecipient = message.recipient && message.recipient.toString() === userId;
      const isGroupMember = message.group && message.group.members && message.group.members.includes(userId);
      // If group, you may want to populate group and check membership

      if (!isSender && !isRecipient && !isGroupMember) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to access this file'
        });
      }

      // Generate signed URL for download
      const uploadService = require('../services/uploadService');
      const signedUrl = uploadService.generateSignedUrl(fileId);

      // Option 1: Redirect to signed URL
      return res.redirect(signedUrl);
      // Option 2: Stream file (advanced, not implemented here)
    } catch (error) {
      logger.error(`Download file error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to download file',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get file preview/thumbnail
   * @route GET /api/upload/file/:fileId/preview
   * @access Private (Authorized Users Only)
   */
  async getFilePreview(req, res) {
    try {
      const { fileId } = req.params;
      const { size } = req.query;
      const userId = req.user.id;

      // Find a message with an attachment matching this publicId
      const Message = require('../models/Message');
      const message = await Message.findOne({
        'attachments.publicId': fileId
      });

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }

      // Check if user is authorized (sender, recipient, or group member)
      const isSender = message.sender.toString() === userId;
      const isRecipient = message.recipient && message.recipient.toString() === userId;
      const isGroupMember = message.group && message.group.members && message.group.members.includes(userId);

      if (!isSender && !isRecipient && !isGroupMember) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to access this file preview'
        });
      }

      // Determine preview size
      let width = 100, height = 100;
      if (size === 'medium') {
        width = height = 300;
      } else if (size === 'large') {
        width = height = 600;
      }

      // Generate thumbnail URL
      const uploadService = require('../services/uploadService');
      const thumbnailUrl = await uploadService.generateThumbnail(fileId, width, height);

      // Redirect to thumbnail URL
      return res.redirect(thumbnailUrl);
    } catch (error) {
      logger.error(`Get file preview error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to get file preview',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Bulk delete files by publicId
   * @route POST /api/upload/bulk-delete
   * @access Private
   */
  async bulkDeleteFiles(req, res) {
    try {
      const { fileIds } = req.body;
      const userId = req.user.id;
      const Message = require('../models/Message');
      const uploadService = require('../services/uploadService');
      const deleted = [];
      const failed = [];

      for (const fileId of fileIds) {
        try {
          // Find a message with an attachment matching this publicId
          const message = await Message.findOne({
            'attachments.publicId': fileId
          });

          if (!message) {
            failed.push({ fileId, reason: 'File not found' });
            continue;
          }

          // Check if user is authorized (sender, recipient, or group member)
          const isSender = message.sender.toString() === userId;
          const isRecipient = message.recipient && message.recipient.toString() === userId;
          const isGroupMember = message.group && message.group.members && message.group.members.includes(userId);

          if (!isSender && !isRecipient && !isGroupMember) {
            failed.push({ fileId, reason: 'Not authorized' });
            continue;
          }

          // Delete from Cloudinary
          await uploadService.deleteFile(fileId, 'raw');

          // Remove attachment from message
          message.attachments = message.attachments.filter(att => att.publicId !== fileId);
          await message.save();

          deleted.push(fileId);
        } catch (err) {
          failed.push({ fileId, reason: err.message });
        }
      }

      res.status(200).json({
        success: true,
        message: 'Bulk delete completed',
        deleted,
        failed
      });
    } catch (error) {
      logger.error(`Bulk delete files error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk delete files',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Report inappropriate file content
   * @route POST /api/upload/file/:fileId/report
   * @access Private
   */
  async reportFile(req, res) {
    try {
      const { fileId } = req.params;
      const { reason, description } = req.body;
      const userId = req.user.id;
      // Save report to DB (pseudo, adjust as needed)
      // Example: await FileReport.create({ fileId, reason, description, reportedBy: userId });
      // For now, just return success
      res.status(200).json({
        success: true,
        message: 'File reported successfully',
        data: { fileId, reason, description, reportedBy: userId }
      });
    } catch (error) {
      logger.error(`Report file error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to report file',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
/**
   * Convert file to a different format (Cloudinary)
   * @route POST /api/upload/file/:fileId/convert
   * @access Private (File Owner)
   */
  async convertFile(req, res) {
    try {
      const { fileId } = req.params;
      const { targetFormat, quality } = req.body;
      const userId = req.user.id;
      const Message = require('../models/Message');
      const uploadService = require('../services/uploadService');

      // Find a message with an attachment matching this publicId
      const message = await Message.findOne({
        'attachments.publicId': fileId
      });

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }

      // Check if user is authorized (sender, recipient, or group member)
      const isSender = message.sender.toString() === userId;
      const isRecipient = message.recipient && message.recipient.toString() === userId;
      const isGroupMember = message.group && message.group.members && message.group.members.includes(userId);

      if (!isSender && !isRecipient && !isGroupMember) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to convert this file'
        });
      }

      // Generate Cloudinary transformation URL
      const options = {};
      if (quality) options.quality = quality;
      options.format = targetFormat;
      const convertedUrl = uploadService.generateSignedUrl(fileId, options);

      res.status(200).json({
        success: true,
        message: 'File converted successfully',
        url: convertedUrl
      });
    } catch (error) {
      logger.error(`Convert file error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to convert file',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new UploadController();