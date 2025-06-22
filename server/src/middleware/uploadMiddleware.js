const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const ensureUploadDirs = () => {
  const dirs = [
    'uploads',
    'uploads/profiles',
    'uploads/groups',
    'uploads/documents'
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// Initialize upload directories
ensureUploadDirs();

// Storage configuration for profile pictures
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/profiles/');
  },
  filename: (req, file, cb) => {
    // Generate unique filename: userId_timestamp.extension
    const uniqueName = `${req.user.id}_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Storage configuration for group files
const groupStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/groups/');
  },
  filename: (req, file, cb) => {
    // Generate unique filename: groupId_userId_timestamp.extension
    const uniqueName = `${req.params.groupId || 'group'}_${req.user.id}_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Storage configuration for documents
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/documents/');
  },
  filename: (req, file, cb) => {
    // Generate unique filename: userId_timestamp_originalname
    const uniqueName = `${req.user.id}_${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  }
});

// File filter for images only
const imageFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Images only! Please upload files with extensions: .jpeg, .jpg, .png, .gif, .webp'), false);
  }
};

// File filter for documents
const documentFilter = (req, file, cb) => {
  const allowedTypes = /pdf|doc|docx|txt|rtf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/rtf'
  ];
  const mimetype = allowedMimes.includes(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Documents only! Please upload files with extensions: .pdf, .doc, .docx, .txt, .rtf'), false);
  }
};

// File filter for any allowed file type
const generalFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt|rtf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/rtf'
  ];
  const mimetype = allowedMimes.includes(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type! Please upload images or documents only.'), false);
  }
};

// Profile picture upload configuration
const uploadProfilePicture = multer({
  storage: profileStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: imageFilter
});

// Group file upload configuration
const uploadGroupFile = multer({
  storage: groupStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: generalFilter
});

// Document upload configuration
const uploadDocument = multer({
  storage: documentStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: documentFilter
});

// Multiple file upload configuration
const uploadMultiple = multer({
  storage: documentStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5 // Maximum 5 files
  },
  fileFilter: generalFilter
});

// Middleware functions
const uploadSingle = (fieldName, uploadType = 'profile') => {
  let upload;
  
  switch (uploadType) {
    case 'profile':
      upload = uploadProfilePicture;
      break;
    case 'group':
      upload = uploadGroupFile;
      break;
    case 'document':
      upload = uploadDocument;
      break;
    default:
      upload = uploadProfilePicture;
  }

  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File too large. Maximum size allowed is 10MB.'
          });
        } else if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: 'Too many files. Maximum 5 files allowed.'
          });
        } else {
          return res.status(400).json({
            success: false,
            message: `Upload error: ${err.message}`
          });
        }
      } else if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  };
};

// Multiple files upload middleware
const uploadMultipleFiles = (fieldName, maxCount = 5) => {
  return (req, res, next) => {
    uploadMultiple.array(fieldName, maxCount)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'One or more files are too large. Maximum size allowed is 10MB per file.'
          });
        } else if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: `Too many files. Maximum ${maxCount} files allowed.`
          });
        } else {
          return res.status(400).json({
            success: false,
            message: `Upload error: ${err.message}`
          });
        }
      } else if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  };
};

// Helper function to delete uploaded file
const deleteFile = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

// Helper function to get file info
const getFileInfo = (file) => {
  return {
    filename: file.filename,
    originalName: file.originalname,
    size: file.size,
    mimetype: file.mimetype,
    path: file.path,
    url: `/uploads/${file.destination.split('/')[1]}/${file.filename}`
  };
};

module.exports = {
  uploadSingle,
  uploadMultipleFiles,
  deleteFile,
  getFileInfo,
  ensureUploadDirs
};