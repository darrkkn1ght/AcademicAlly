console.log('UPLOAD ROUTES FILE LOADED');
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const authMiddleware = require('../middleware/authMiddleware');
const { validationMiddleware } = require('../middleware/validationMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimitMiddleware');
const uploadMiddleware = require('../middleware/uploadMiddleware');
const uploadController = require('../controllers/uploadController');

// Apply authentication to all upload routes
router.use(authMiddleware.protect);

// =============================================================================
// PROFILE PICTURE UPLOAD ROUTES
// =============================================================================

/**
 * @route   POST /api/upload/profile-picture
 * @desc    Upload user profile picture
 * @access  Private
 */
router.post('/profile-picture',
  rateLimitMiddleware.uploadLimit, // Rate limit uploads
  uploadMiddleware.uploadSingle('profilePicture', 'profile'), // Multer middleware for profile pics
  [
    body('cropData')
    .optional()
    .custom(value => typeof value === 'object' && value !== null && !Array.isArray(value))
    .withMessage('Crop data must be an object'),
    body('cropData.x')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Crop X must be a positive number'),
    body('cropData.y')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Crop Y must be a positive number'),
    body('cropData.width')
      .optional()
      .isFloat({ min: 1 })
      .withMessage('Crop width must be positive'),
    body('cropData.height')
      .optional()
      .isFloat({ min: 1 })
      .withMessage('Crop height must be positive')
  ],
  validationMiddleware,
  uploadController.uploadProfilePicture
);

/**
 * @route   DELETE /api/upload/profile-picture
 * @desc    Delete user profile picture
 * @access  Private
 */
router.delete('/profile-picture',
  uploadController.deleteProfilePicture
);

// =============================================================================
// GROUP IMAGE UPLOAD ROUTES
// =============================================================================

/**
 * @route   POST /api/upload/group/:groupId/image
 * @desc    Upload group cover image
 * @access  Private (Group Admin)
 */
router.post('/group/:groupId/image',
  rateLimitMiddleware.uploadLimit,
  uploadMiddleware.uploadSingle('groupImage', 'group'), // Multer middleware for group images
  [
  param('groupId')
  .isMongoId()
  .withMessage('Invalid group ID'),
  body('cropData')
  .optional()
  .custom(value => typeof value === 'object' && value !== null && !Array.isArray(value))
  .withMessage('Crop data must be an object'),
  body('cropData.x')
  .optional()
  .isFloat({ min: 0 })
  .withMessage('Crop X must be a positive number'),
  body('cropData.y')
  .optional()
  .isFloat({ min: 0 })
  .withMessage('Crop Y must be a positive number'),
  body('cropData.width')
  .optional()
  .isFloat({ min: 1 })
  .withMessage('Crop width must be positive'),
  body('cropData.height')
  .optional()
  .isFloat({ min: 1 })
  .withMessage('Crop height must be positive')
  ],
  validationMiddleware,
  uploadController.uploadGroupImage
  );

/**
 * @route   DELETE /api/upload/group/:groupId/image
 * @desc    Delete group cover image
 * @access  Private (Group Admin)
 */
router.delete('/group/:groupId/image',
  [
    param('groupId')
      .isMongoId()
      .withMessage('Invalid group ID')
  ],
  validationMiddleware,
  uploadController.deleteGroupImage
);

// =============================================================================
// MESSAGE ATTACHMENT ROUTES
// =============================================================================

/**
 * @route   POST /api/upload/message-attachment
 * @desc    Upload file attachment for messages
 * @access  Private
 */
router.post('/message-attachment',
  rateLimitMiddleware.uploadLimit,
  uploadMiddleware.uploadSingle('attachment', 'document'), // Multer middleware for attachments
  [
    body('messageType')
      .optional()
      .isIn(['image', 'document', 'audio', 'video'])
      .withMessage('Invalid message type'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Description cannot exceed 200 characters'),
    body('isPrivate')
      .optional()
      .isBoolean()
      .withMessage('isPrivate must be boolean')
  ],
  validationMiddleware,
  uploadController.uploadMessageAttachment
);

/**
 * @route   DELETE /api/upload/file/:fileId
 * @desc    Delete uploaded file
 * @access  Private (File Owner)
 */
router.delete('/file/:fileId',
  [
    param('fileId')
      .isString()
      .notEmpty()
      .withMessage('File ID is required')
  ],
  validationMiddleware,
  uploadController.deleteFile
);

// =============================================================================
// DOCUMENT & STUDY MATERIAL ROUTES
// =============================================================================

/**
 * @route   POST /api/upload/study-material
 * @desc    Upload study materials for groups
 * @access  Private
 */
router.post('/study-material',
  rateLimitMiddleware.uploadLimit,
  uploadMiddleware.uploadSingle('studyMaterial', 'document'), // Multer middleware for study materials
  [
    body('groupId')
      .optional()
      .isMongoId()
      .withMessage('Invalid group ID'),
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Material title is required')
      .isLength({ min: 1, max: 100 })
      .withMessage('Title must be between 1 and 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot exceed 500 characters'),
    body('subject')
      .trim()
      .notEmpty()
      .withMessage('Subject is required')
      .isLength({ max: 50 })
      .withMessage('Subject cannot exceed 50 characters'),
    body('materialType')
      .isIn(['notes', 'assignment', 'reference', 'presentation', 'other'])
      .withMessage('Invalid material type'),
    body('tags')
      .optional()
      .isArray({ max: 10 })
      .withMessage('Maximum 10 tags allowed'),
    body('tags.*')
      .optional()
      .trim()
      .isLength({ min: 1, max: 30 })
      .withMessage('Tags must be between 1 and 30 characters'),
    body('isPublic')
      .optional()
      .isBoolean()
      .withMessage('isPublic must be boolean')
  ],
  validationMiddleware,
  uploadController.uploadStudyMaterial
);

/**
 * @route   GET /api/upload/study-materials
 * @desc    Get user's uploaded study materials
 * @access  Private
 */
router.get('/study-materials',
  [
    query('groupId')
      .optional()
      .isMongoId()
      .withMessage('Invalid group ID'),
    query('subject')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Subject filter cannot exceed 50 characters'),
    query('materialType')
      .optional()
      .isIn(['notes', 'assignment', 'reference', 'presentation', 'other'])
      .withMessage('Invalid material type'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
  ],
  validationMiddleware,
  uploadController.getStudyMaterials
);

// =============================================================================
// FILE ACCESS & DOWNLOAD ROUTES
// =============================================================================

/**
 * @route   GET /api/upload/file/:fileId/info
 * @desc    Get file information and metadata
 * @access  Private (Authorized Users Only)
 */
router.get('/file/:fileId/info',
  [
    param('fileId')
      .isString()
      .notEmpty()
      .withMessage('File ID is required')
  ],
  validationMiddleware,
  uploadController.getFileInfo
);

/**
 * @route   GET /api/upload/file/:fileId/download
 * @desc    Download file (with access control)
 * @access  Private (Authorized Users Only)
 */
router.get('/file/:fileId/download',
  [
    param('fileId')
      .isString()
      .notEmpty()
      .withMessage('File ID is required'),
    query('thumbnail')
      .optional()
      .isBoolean()
      .withMessage('Thumbnail must be boolean')
  ],
  validationMiddleware,
  uploadController.downloadFile
);

/**
 * @route   GET /api/upload/file/:fileId/preview
 * @desc    Get file preview/thumbnail
 * @access  Private (Authorized Users Only)
 */
router.get('/file/:fileId/preview',
  [
    param('fileId')
      .isString()
      .notEmpty()
      .withMessage('File ID is required'),
    query('size')
      .optional()
      .isIn(['small', 'medium', 'large'])
      .withMessage('Invalid preview size')
  ],
  validationMiddleware,
  uploadController.getFilePreview
);

// =============================================================================
// DIRECT UPLOAD (PRESIGNED URL) ROUTES
// =============================================================================

/**
 * @route   POST /api/upload/presigned-url
 * @desc    Generate presigned URL for direct client uploads
 * @access  Private
 */
router.post('/presigned-url',
  rateLimitMiddleware.presignedUrlLimit,
  [
    body('fileName')
      .trim()
      .notEmpty()
      .withMessage('File name is required')
      .isLength({ min: 1, max: 255 })
      .withMessage('File name must be between 1 and 255 characters'),
    body('fileType')
      .trim()
      .notEmpty()
      .withMessage('File type is required')
      .matches(/^[a-zA-Z0-9]+\/[a-zA-Z0-9\-\+\.]+$/)
      .withMessage('Invalid file type format'),
    body('fileSize')
      .isInt({ min: 1, max: 50 * 1024 * 1024 }) // Max 50MB
      .withMessage('File size must be between 1 byte and 50MB'),
    body('uploadType')
      .isIn(['profile-picture', 'group-image', 'message-attachment'])
      .withMessage('Invalid upload type'),
    body('groupId')
      .optional()
      .isMongoId()
      .withMessage('Invalid group ID')
  ],
  validationMiddleware,
  uploadController.generatePresignedUrl
);

/**
 * @route   POST /api/upload/confirm-upload
 * @desc    Confirm successful direct upload and save file metadata
 * @access  Private
 */
router.post('/confirm-upload',
  [
    body('uploadId')
      .trim()
      .notEmpty()
      .withMessage('Upload ID is required'),
    body('fileUrl')
      .trim()
      .isURL()
      .withMessage('Valid file URL is required'),
    body('fileName')
      .trim()
      .notEmpty()
      .withMessage('File name is required'),
    body('fileSize')
      .isInt({ min: 1 })
      .withMessage('File size must be positive'),
    body('fileType')
      .trim()
      .notEmpty()
      .withMessage('File type is required'),
    body('uploadType')
      .isIn(['profile', 'group', 'message', 'study-material'])
      .withMessage('Invalid upload type'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object')
  ],
  validationMiddleware,
  uploadController.confirmUpload
);

// =============================================================================
// FILE VALIDATION & UTILITIES
// =============================================================================

/**
 * @route   POST /api/upload/validate-file
 * @desc    Validate file before upload (client-side check)
 * @access  Private
 */
router.post('/validate-file',
  [
    body('fileName')
      .trim()
      .notEmpty()
      .withMessage('File name is required'),
    body('fileType')
      .trim()
      .notEmpty()
      .withMessage('File type is required'),
    body('fileSize')
      .isInt({ min: 1 })
      .withMessage('File size must be positive'),
    body('uploadType')
      .isIn(['profile', 'group', 'message', 'study-material'])
      .withMessage('Invalid upload type')
  ],
  validationMiddleware,
  uploadController.validateFileType
);

/**
 * @route   GET /api/upload/supported-formats
 * @desc    Get list of supported file formats for each upload type
 * @access  Private
 */
router.get('/supported-formats',
  uploadController.getSupportedFormats
);

// =============================================================================
// USER FILE MANAGEMENT ROUTES
// =============================================================================

/**
 * @route   GET /api/upload/my-files
 * @desc    Get user's uploaded files
 * @access  Private
 */
router.get('/my-files',
  [
    query('type')
      .optional()
      .isIn(['profile', 'group', 'message', 'study-material', 'all'])
      .withMessage('Invalid file type filter'),
    query('groupId')
      .optional()
      .isMongoId()
      .withMessage('Invalid group ID'),
    query('dateFrom')
      .optional()
      .isISO8601()
      .withMessage('Invalid from date'),
    query('dateTo')
      .optional()
      .isISO8601()
      .withMessage('Invalid to date'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
  ],
  validationMiddleware,
  uploadController.getUserFiles
);

/**
 * @route   GET /api/upload/storage-usage
 * @desc    Get user's storage usage statistics
 * @access  Private
 */
router.get('/storage-usage',
  uploadController.getStorageUsage
);

/**
 * @route   POST /api/upload/bulk-delete
 * @desc    Delete multiple files at once
 * @access  Private
 */
console.log('uploadController.bulkDeleteFiles:', typeof uploadController.bulkDeleteFiles);
router.post('/bulk-delete',
  [
    body('fileIds')
      .isArray({ min: 1, max: 50 })
      .withMessage('File IDs array required (max 50)'),
    body('fileIds.*')
      .isString()
      .notEmpty()
      .withMessage('Invalid file ID')
  ],
  validationMiddleware,
  uploadController.bulkDeleteFiles
);

// =============================================================================
// ADMIN & MODERATION ROUTES (Optional)
// =============================================================================

/**
 * @route   POST /api/upload/file/:fileId/report
 * @desc    Report inappropriate file content
 * @access  Private
 */
router.post('/file/:fileId/report',
  rateLimitMiddleware.reportLimit,
  [
    param('fileId')
      .isString()
      .notEmpty()
      .withMessage('File ID is required'),
    body('reason')
      .isIn(['inappropriate', 'copyright', 'spam', 'malware', 'other'])
      .withMessage('Invalid report reason'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot exceed 500 characters')
  ],
  validationMiddleware,
  uploadController.reportFile
);

/**
 * @route   POST /api/upload/file/:fileId/share
 * @desc    Generate shareable link for file
 * @access  Private (File Owner)
 */
router.post('/file/:fileId/share',
  [
    param('fileId')
      .isString()
      .notEmpty()
      .withMessage('File ID is required'),
    body('expiresIn')
      .optional()
      .isInt({ min: 1, max: 168 }) // Max 1 week
      .withMessage('Expiration must be between 1 and 168 hours'),
    body('allowDownload')
      .optional()
      .isBoolean()
      .withMessage('allowDownload must be boolean'),
    body('password')
      .optional()
      .trim()
      .isLength({ min: 4, max: 50 })
      .withMessage('Password must be between 4 and 50 characters')
  ],
  validationMiddleware,
  uploadController.generateShareLink
);

// =============================================================================
// FILE CONVERSION & PROCESSING ROUTES (Future Feature)
// =============================================================================

/**
 * @route   POST /api/upload/file/:fileId/convert
 * @desc    Convert file to different format
 * @access  Private (File Owner)
 */
router.post('/file/:fileId/convert',
  rateLimitMiddleware.conversionLimit,
  [
    param('fileId')
      .isString()
      .notEmpty()
      .withMessage('File ID is required'),
    body('targetFormat')
      .isIn(['pdf', 'jpg', 'png', 'webp', 'mp4', 'mp3'])
      .withMessage('Invalid target format'),
    body('quality')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Quality must be between 1 and 100')
  ],
  validationMiddleware,
  uploadController.convertFile
);

module.exports = router;