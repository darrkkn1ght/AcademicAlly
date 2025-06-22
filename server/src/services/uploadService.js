const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const logger = require('../utils/logger');

/**
 * Upload Service for AcademicAlly
 * Handles file uploads including profile pictures, message attachments, and documents
 */
class UploadService {
  constructor() {
    this.initCloudinary();
    this.initMulter();
    this.allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    this.allowedDocTypes = ['application/pdf', 'text/plain', 'application/msword', 
                           'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.maxImageSize = 5 * 1024 * 1024; // 5MB
  }

  /**
   * Initialize Cloudinary configuration
   */
  initCloudinary() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    logger.info('Cloudinary initialized for file uploads');
  }

  /**
   * Initialize Multer for file handling
   */
  initMulter() {
    // Memory storage for processing before cloud upload
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: this.maxFileSize,
        files: 5 // Maximum 5 files per request
      },
      fileFilter: (req, file, cb) => {
        try {
          const isValidType = this.isValidFileType(file);
          if (isValidType.valid) {
            cb(null, true);
          } else {
            cb(new Error(isValidType.message), false);
          }
        } catch (error) {
          cb(error, false);
        }
      }
    });

    // Specific configurations for different upload types
    this.profileUpload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: this.maxImageSize,
        files: 1
      },
      fileFilter: (req, file, cb) => {
        if (this.allowedImageTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed for profile pictures'), false);
        }
      }
    });
  }

  /**
   * Upload profile picture
   */
  async uploadProfilePicture(userId, fileBuffer, originalName) {
    try {
      // Process image with Sharp
      const processedImage = await sharp(fileBuffer)
        .resize(400, 400, { 
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      // Upload to Cloudinary
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: 'academically/profiles',
            public_id: `profile_${userId}_${Date.now()}`,
            resource_type: 'image',
            transformation: [
              { width: 400, height: 400, crop: 'fill' },
              { quality: 'auto:good' }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(processedImage);
      });

      const uploadData = {
        url: result.secure_url,
        publicId: result.public_id,
        size: result.bytes,
        format: result.format,
        uploadedAt: new Date(),
        type: 'profile_picture'
      };

      logger.profile(`Profile picture uploaded for user ${userId}: ${result.secure_url}`);
      return uploadData;
    } catch (error) {
      logger.error('Profile picture upload failed:', error);
      throw new Error(`Failed to upload profile picture: ${error.message}`);
    }
  }

  /**
   * Upload message attachment
   */
  async uploadMessageAttachment(userId, fileBuffer, originalName, mimetype) {
    try {
      const fileExtension = path.extname(originalName).toLowerCase();
      const fileName = `${userId}_${Date.now()}${fileExtension}`;
      
      let uploadResult;
      
      if (this.allowedImageTypes.includes(mimetype)) {
        // Handle image attachments
        const processedImage = await sharp(fileBuffer)
          .resize(1200, 1200, { 
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 80 })
          .toBuffer();

        uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              folder: 'academically/messages/images',
              public_id: fileName,
              resource_type: 'image'
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(processedImage);
        });
      } else {
        // Handle document attachments
        uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              folder: 'academically/messages/documents',
              public_id: fileName,
              resource_type: 'raw'
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(fileBuffer);
        });
      }

      const uploadData = {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        originalName,
        size: uploadResult.bytes,
        format: uploadResult.format || path.extname(originalName).slice(1),
        mimetype,
        uploadedAt: new Date(),
        type: 'message_attachment'
      };

      logger.message(`Message attachment uploaded for user ${userId}: ${originalName}`);
      return uploadData;
    } catch (error) {
      logger.error('Message attachment upload failed:', error);
      throw new Error(`Failed to upload attachment: ${error.message}`);
    }
  }

  /**
   * Upload study materials (documents, notes, etc.)
   */
  async uploadStudyMaterial(userId, fileBuffer, originalName, mimetype, category = 'general') {
    try {
      const fileExtension = path.extname(originalName).toLowerCase();
      const fileName = `study_${userId}_${Date.now()}${fileExtension}`;

      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: `academically/study-materials/${category}`,
            public_id: fileName,
            resource_type: this.allowedImageTypes.includes(mimetype) ? 'image' : 'raw'
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(fileBuffer);
      });

      const uploadData = {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        originalName,
        size: uploadResult.bytes,
        format: uploadResult.format || fileExtension.slice(1),
        mimetype,
        category,
        uploadedAt: new Date(),
        type: 'study_material'
      };

      logger.info(`Study material uploaded for user ${userId}: ${originalName}`);
      return uploadData;
    } catch (error) {
      logger.error('Study material upload failed:', error);
      throw new Error(`Failed to upload study material: ${error.message}`);
    }
  }

  /**
   * Delete file from Cloudinary
   */
  async deleteFile(publicId, resourceType = 'image') {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType
      });

      if (result.result === 'ok') {
        logger.info(`File deleted successfully: ${publicId}`);
        return { success: true, publicId };
      } else {
        throw new Error(`Deletion failed: ${result.result}`);
      }
    } catch (error) {
      logger.error('File deletion failed:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Generate signed URL for secure file access
   */
  generateSignedUrl(publicId, options = {}) {
    try {
      const signedUrl = cloudinary.url(publicId, {
        sign_url: true,
        ...options
      });

      logger.info(`Signed URL generated for: ${publicId}`);
      return signedUrl;
    } catch (error) {
      logger.error('Signed URL generation failed:', error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Get file metadata from Cloudinary
   */
  async getFileMetadata(publicId) {
    try {
      const result = await cloudinary.api.resource(publicId);
      return {
        publicId: result.public_id,
        url: result.secure_url,
        size: result.bytes,
        format: result.format,
        width: result.width,
        height: result.height,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      };
    } catch (error) {
      logger.error('Failed to get file metadata:', error);
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  /**
   * Batch upload multiple files
   */
  async batchUpload(userId, files, uploadType = 'message_attachment') {
    try {
      const uploadPromises = files.map(async (file) => {
        try {
          switch (uploadType) {
            case 'profile_picture':
              return await this.uploadProfilePicture(userId, file.buffer, file.originalname);
            case 'message_attachment':
              return await this.uploadMessageAttachment(userId, file.buffer, file.originalname, file.mimetype);
            case 'study_material':
              return await this.uploadStudyMaterial(userId, file.buffer, file.originalname, file.mimetype);
            default:
              throw new Error(`Unknown upload type: ${uploadType}`);
          }
        } catch (error) {
          return { error: error.message, filename: file.originalname };
        }
      });

      const results = await Promise.all(uploadPromises);
      const successful = results.filter(r => !r.error);
      const failed = results.filter(r => r.error);

      logger.info(`Batch upload completed: ${successful.length} successful, ${failed.length} failed`);
      
      return {
        successful,
        failed,
        total: files.length
      };
    } catch (error) {
      logger.error('Batch upload failed:', error);
      throw new Error(`Batch upload failed: ${error.message}`);
    }
  }

  /**
   * Clean up old temporary files
   */
  async cleanupOldFiles(folderPath, maxAgeHours = 24) {
    try {
      const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
      const cutoffDate = new Date(Date.now() - maxAge);

      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: folderPath,
        max_results: 500
      });

      const oldFiles = result.resources.filter(file => 
        new Date(file.created_at) < cutoffDate
      );

      if (oldFiles.length > 0) {
        const deletePromises = oldFiles.map(file => 
          this.deleteFile(file.public_id, file.resource_type)
        );

        await Promise.all(deletePromises);
        logger.info(`Cleaned up ${oldFiles.length} old files from ${folderPath}`);
      }

      return { cleaned: oldFiles.length, total: result.resources.length };
    } catch (error) {
      logger.error('File cleanup failed:', error);
      throw new Error(`File cleanup failed: ${error.message}`);
    }
  }

  /**
   * Validate file type and size
   */
  isValidFileType(file) {
    const allAllowedTypes = [...this.allowedImageTypes, ...this.allowedDocTypes];
    
    if (!allAllowedTypes.includes(file.mimetype)) {
      return {
        valid: false,
        message: `File type ${file.mimetype} is not allowed. Allowed types: ${allAllowedTypes.join(', ')}`
      };
    }

    if (file.size > this.maxFileSize) {
      return {
        valid: false,
        message: `File size exceeds maximum limit of ${this.maxFileSize / (1024 * 1024)}MB`
      };
    }

    return { valid: true };
  }

  /**
   * Generate thumbnail for images
   */
  async generateThumbnail(publicId, width = 150, height = 150) {
    try {
      const thumbnailUrl = cloudinary.url(publicId, {
        width,
        height,
        crop: 'fill',
        quality: 'auto:low',
        format: 'webp'
      });

      return thumbnailUrl;
    } catch (error) {
      logger.error('Thumbnail generation failed:', error);
      throw new Error(`Failed to generate thumbnail: ${error.message}`);
    }
  }

  /**
   * Get upload statistics
   */
  async getUploadStats(userId, timeframe = '7d') {
    try {
      // This would typically query your database for upload statistics
      // For now, we'll return a basic structure
      const stats = {
        totalFiles: 0,
        totalSize: 0,
        fileTypes: {},
        recentUploads: [],
        storageUsed: 0,
        storageLimit: 100 * 1024 * 1024, // 100MB default limit
        timeframe
      };

      // In a real implementation, you'd query your database here
      // SELECT COUNT(*), SUM(size), type FROM uploads WHERE userId = ? AND createdAt > ?

      return stats;
    } catch (error) {
      logger.error('Failed to get upload stats:', error);
      throw new Error(`Failed to get upload statistics: ${error.message}`);
    }
  }

  /**
   * Health check for upload service
   */
  async healthCheck() {
    try {
      // Test Cloudinary connection
      const result = await cloudinary.api.ping();
      
      return {
        status: 'healthy',
        cloudinary: result.status === 'ok' ? 'connected' : 'error',
        timestamp: new Date().toISOString(),
        maxFileSize: `${this.maxFileSize / (1024 * 1024)}MB`,
        allowedTypes: [...this.allowedImageTypes, ...this.allowedDocTypes]
      };
    } catch (error) {
      logger.error('Upload service health check failed:', error);
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get Multer middleware for different upload types
   */
  getUploadMiddleware(type = 'single') {
    switch (type) {
      case 'profile':
        return this.profileUpload.single('profilePicture');
      case 'single':
        return this.upload.single('file');
      case 'multiple':
        return this.upload.array('files', 5);
      case 'message':
        return this.upload.array('attachments', 3);
      default:
        return this.upload.single('file');
    }
  }
}

// Singleton instance
const uploadService = new UploadService();

// Schedule cleanup of old temporary files (run daily)
setInterval(() => {
  uploadService.cleanupOldFiles('academically/temp', 24)
    .catch(error => logger.error('Scheduled cleanup failed:', error));
}, 24 * 60 * 60 * 1000); // 24 hours

module.exports = uploadService;