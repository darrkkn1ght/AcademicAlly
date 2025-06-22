/**
 * AcademicAlly - Cloudinary Configuration
 * 
 * Comprehensive file storage and image processing configuration for AcademicAlly.
 * Handles profile pictures, message attachments, and document uploads with
 * security, optimization, and validation features.
 * 
 * Features:
 * - Secure file upload with validation
 * - Image optimization and transformations
 * - Environment-specific configurations
 * - File type restrictions and security
 * - Automatic resizing and format conversion
 * - CDN delivery optimization
 * - Storage quota management
 * - Error handling and retry logic
 */

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const logger = require('../utils/logger');

// Environment variables validation
const requiredEnvVars = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET'
];

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    logger.error(`Missing required environment variable: ${varName}`);
    throw new Error(`Environment variable ${varName} is required`);
  }
});

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
  upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET || 'academically_default'
});

// File type configurations
const FILE_TYPES = {
  PROFILE_PICTURES: {
    folder: 'academically/profiles',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    maxSize: 5 * 1024 * 1024, // 5MB
    transformations: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto', fetch_format: 'auto' }
    ]
  },
  MESSAGE_ATTACHMENTS: {
    folder: 'academically/messages',
    allowedFormats: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 'txt'],
    maxSize: 10 * 1024 * 1024, // 10MB
    transformations: [
      { quality: 'auto', fetch_format: 'auto' }
    ]
  },
  STUDY_MATERIALS: {
    folder: 'academically/materials',
    allowedFormats: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt'],
    maxSize: 25 * 1024 * 1024, // 25MB
    transformations: []
  },
  GROUP_COVERS: {
    folder: 'academically/groups',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    maxSize: 3 * 1024 * 1024, // 3MB
    transformations: [
      { width: 800, height: 400, crop: 'fill' },
      { quality: 'auto', fetch_format: 'auto' }
    ]
  }
};

// Environment-specific configurations
const ENV_CONFIG = {
  development: {
    quality: 'auto:good',
    compression: 'auto',
    timeout: 30000,
    folder_prefix: 'dev_'
  },
  test: {
    quality: 'auto:low',
    compression: 'auto',
    timeout: 15000,
    folder_prefix: 'test_'
  },
  production: {
    quality: 'auto:best',
    compression: 'auto',
    timeout: 60000,
    folder_prefix: ''
  }
};

const currentEnv = process.env.NODE_ENV || 'development';
const envConfig = ENV_CONFIG[currentEnv];

/**
 * Generate unique filename with timestamp and random hash
 */
const generateUniqueFilename = (originalName, userId) => {
  const timestamp = Date.now();
  const randomHash = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalName);
  const baseName = path.basename(originalName, extension);
  
  return `${userId}_${baseName}_${timestamp}_${randomHash}${extension}`;
};

/**
 * Validate file against allowed types and size limits
 */
const validateFile = (file, fileType) => {
  const config = FILE_TYPES[fileType];
  if (!config) {
    throw new Error(`Invalid file type configuration: ${fileType}`);
  }

  // Check file size
  if (file.size > config.maxSize) {
    throw new Error(`File size exceeds limit of ${config.maxSize / 1024 / 1024}MB`);
  }

  // Check file format
  const fileExtension = path.extname(file.originalname).toLowerCase().slice(1);
  if (!config.allowedFormats.includes(fileExtension)) {
    throw new Error(`File format '${fileExtension}' not allowed. Allowed formats: ${config.allowedFormats.join(', ')}`);
  }

  return true;
};

/**
 * Create Cloudinary storage configuration for specific file type
 */
const createStorage = (fileType) => {
  const config = FILE_TYPES[fileType];
  
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: `${envConfig.folder_prefix}${config.folder}`,
      allowed_formats: config.allowedFormats,
      transformation: config.transformations,
      public_id: (req, file) => {
        const userId = req.user?.id || 'anonymous';
        return generateUniqueFilename(file.originalname, userId);
      },
      resource_type: 'auto',
      use_filename: false,
      unique_filename: true,
      overwrite: false,
      quality: envConfig.quality,
      timeout: envConfig.timeout
    }
  });
};

/**
 * Upload file to Cloudinary with validation and error handling
 */
const uploadFile = async (fileBuffer, options = {}) => {
  try {
    const {
      fileType = 'MESSAGE_ATTACHMENTS',
      userId = 'anonymous',
      originalName = 'file',
      transformation = []
    } = options;

    const config = FILE_TYPES[fileType];
    const filename = generateUniqueFilename(originalName, userId);
    
    const uploadOptions = {
      folder: `${envConfig.folder_prefix}${config.folder}`,
      public_id: filename,
      resource_type: 'auto',
      transformation: [...config.transformations, ...transformation],
      quality: envConfig.quality,
      timeout: envConfig.timeout,
      allowed_formats: config.allowedFormats,
      use_filename: false,
      unique_filename: true,
      overwrite: false,
      invalidate: true,
      notification_url: process.env.CLOUDINARY_WEBHOOK_URL,
      context: {
        userId: userId,
        uploadType: fileType,
        environment: currentEnv
      }
    };

    logger.info(`Uploading file to Cloudinary: ${filename}`, {
      userId,
      fileType,
      folder: uploadOptions.folder
    });

    const result = await cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          logger.error('Cloudinary upload error:', error);
          throw error;
        }
        return result;
      }
    ).end(fileBuffer);

    logger.info(`File uploaded successfully: ${result.public_id}`, {
      userId,
      fileType,
      url: result.secure_url,
      size: result.bytes
    });

    return {
      public_id: result.public_id,
      secure_url: result.secure_url,
      url: result.url,
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      created_at: result.created_at,
      resource_type: result.resource_type
    };

  } catch (error) {
    logger.error('File upload failed:', error);
    throw new Error(`Upload failed: ${error.message}`);
  }
};

/**
 * Delete file from Cloudinary
 */
const deleteFile = async (publicId, resourceType = 'image') => {
  try {
    logger.info(`Deleting file from Cloudinary: ${publicId}`);
    
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true
    });

    if (result.result === 'ok') {
      logger.info(`File deleted successfully: ${publicId}`);
      return { success: true, result };
    } else {
      logger.warn(`File deletion failed: ${publicId}`, result);
      return { success: false, result };
    }

  } catch (error) {
    logger.error('File deletion error:', error);
    throw new Error(`Deletion failed: ${error.message}`);
  }
};

/**
 * Generate optimized URL with transformations
 */
const generateOptimizedUrl = (publicId, options = {}) => {
  try {
    const {
      width = null,
      height = null,
      crop = 'fill',
      quality = 'auto',
      format = 'auto',
      gravity = 'auto',
      radius = null,
      effect = null
    } = options;

    const transformations = [];
    
    if (width || height) {
      transformations.push({
        width,
        height,
        crop,
        gravity
      });
    }
    
    if (radius) {
      transformations.push({ radius });
    }
    
    if (effect) {
      transformations.push({ effect });
    }
    
    transformations.push({
      quality,
      fetch_format: format
    });

    return cloudinary.url(publicId, {
      transformation: transformations,
      secure: true
    });

  } catch (error) {
    logger.error('URL generation error:', error);
    throw new Error(`URL generation failed: ${error.message}`);
  }
};

/**
 * Get storage usage statistics
 */
const getStorageStats = async () => {
  try {
    const usage = await cloudinary.api.usage();
    
    return {
      credits_used: usage.credits,
      bandwidth_used: usage.bandwidth,
      storage_used: usage.storage,
      requests: usage.requests,
      transformations: usage.transformations,
      last_updated: new Date().toISOString()
    };

  } catch (error) {
    logger.error('Storage stats error:', error);
    throw new Error(`Failed to get storage stats: ${error.message}`);
  }
};

/**
 * Clean up old files (maintenance function)
 */
const cleanupOldFiles = async (folderPath, daysOld = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const resources = await cloudinary.api.resources({
      type: 'upload',
      prefix: folderPath,
      max_results: 500,
      created_at: { to: cutoffDate.toISOString() }
    });

    const deletions = await Promise.allSettled(
      resources.resources.map(resource => 
        cloudinary.uploader.destroy(resource.public_id)
      )
    );

    const successful = deletions.filter(result => result.status === 'fulfilled').length;
    const failed = deletions.filter(result => result.status === 'rejected').length;

    logger.info(`Cleanup completed: ${successful} deleted, ${failed} failed`);
    
    return { successful, failed, total: resources.resources.length };

  } catch (error) {
    logger.error('Cleanup error:', error);
    throw new Error(`Cleanup failed: ${error.message}`);
  }
};

/**
 * Health check for Cloudinary connection
 */
const healthCheck = async () => {
  try {
    const ping = await cloudinary.api.ping();
    const usage = await cloudinary.api.usage();
    
    return {
      status: 'healthy',
      connection: ping.status === 'ok',
      credits_remaining: usage.plan?.credits - usage.credits,
      last_checked: new Date().toISOString()
    };

  } catch (error) {
    logger.error('Cloudinary health check failed:', error);
    return {
      status: 'unhealthy',
      error: error.message,
      last_checked: new Date().toISOString()
    };
  }
};

// Multer configurations for different file types
const multerConfigs = {
  profilePictures: multer({
    storage: createStorage('PROFILE_PICTURES'),
    fileFilter: (req, file, cb) => {
      try {
        validateFile(file, 'PROFILE_PICTURES');
        cb(null, true);
      } catch (error) {
        cb(error, false);
      }
    },
    limits: { fileSize: FILE_TYPES.PROFILE_PICTURES.maxSize }
  }),

  messageAttachments: multer({
    storage: createStorage('MESSAGE_ATTACHMENTS'),
    fileFilter: (req, file, cb) => {
      try {
        validateFile(file, 'MESSAGE_ATTACHMENTS');
        cb(null, true);
      } catch (error) {
        cb(error, false);
      }
    },
    limits: { fileSize: FILE_TYPES.MESSAGE_ATTACHMENTS.maxSize }
  }),

  studyMaterials: multer({
    storage: createStorage('STUDY_MATERIALS'),
    fileFilter: (req, file, cb) => {
      try {
        validateFile(file, 'STUDY_MATERIALS');
        cb(null, true);
      } catch (error) {
        cb(error, false);
      }
    },
    limits: { fileSize: FILE_TYPES.STUDY_MATERIALS.maxSize }
  }),

  groupCovers: multer({
    storage: createStorage('GROUP_COVERS'),
    fileFilter: (req, file, cb) => {
      try {
        validateFile(file, 'GROUP_COVERS');
        cb(null, true);
      } catch (error) {
        cb(error, false);
      }
    },
    limits: { fileSize: FILE_TYPES.GROUP_COVERS.maxSize }
  })
};

// Initialize cloudinary on startup
const initializeCloudinary = async () => {
  try {
    logger.info('Initializing Cloudinary configuration...');
    
    // Test connection
    const health = await healthCheck();
    if (health.status === 'healthy') {
      logger.info('Cloudinary connection established successfully', {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        environment: currentEnv
      });
    } else {
      throw new Error(`Cloudinary health check failed: ${health.error}`);
    }

    return true;

  } catch (error) {
    logger.error('Cloudinary initialization failed:', error);
    throw error;
  }
};

module.exports = {
  cloudinary,
  FILE_TYPES,
  multerConfigs,
  uploadFile,
  deleteFile,
  generateOptimizedUrl,
  getStorageStats,
  cleanupOldFiles,
  healthCheck,
  initializeCloudinary,
  validateFile,
  generateUniqueFilename
};