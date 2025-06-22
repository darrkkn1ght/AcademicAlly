const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  // Who reported
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // What was reported
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.reportType === 'user';
    }
  },
  
  reportedMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    required: function() {
      return this.reportType === 'message';
    }
  },
  
  reportedGroup: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: function() {
      return this.reportType === 'group';
    }
  },
  
  // Report details
  reportType: {
    type: String,
    enum: ['user', 'message', 'group'],
    required: true
  },
  
  category: {
    type: String,
    enum: [
      'spam',
      'harassment',
      'inappropriate_content',
      'fake_profile',
      'academic_dishonesty',
      'bullying',
      'hate_speech',
      'impersonation',
      'privacy_violation',
      'other'
    ],
    required: true
  },
  
  reason: {
    type: String,
    required: true,
    maxlength: 500,
    trim: true
  },
  
  // Additional context
  evidence: [{
    type: String, // URLs to screenshots or additional proof
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Evidence must be a valid URL'
    }
  }],
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'investigating', 'resolved', 'dismissed'],
    default: 'pending'
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Admin handling
  assignedModerator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Admin/moderator user
  },
  
  moderatorNotes: {
    type: String,
    maxlength: 1000
  },
  
  resolution: {
    type: String,
    maxlength: 500
  },
  
  actionTaken: {
    type: String,
    enum: [
      'none',
      'warning_issued',
      'content_removed',
      'user_suspended',
      'user_banned',
      'group_disbanded',
      'escalated'
    ],
    default: 'none'
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  resolvedAt: {
    type: Date
  },
  
  // Prevent duplicate reports
  reportHash: {
    type: String,
    unique: true,
    sparse: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ status: 1, priority: -1, createdAt: -1 });
reportSchema.index({ reportType: 1, status: 1 });
reportSchema.index({ assignedModerator: 1, status: 1 });
reportSchema.index({ reportHash: 1 }, { sparse: true });

// Virtual for report age
reportSchema.virtual('ageInHours').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60));
});

// Pre-save middleware to generate report hash (prevent duplicates)
reportSchema.pre('save', function(next) {
  if (this.isNew) {
    const hashContent = `${this.reporter}_${this.reportType}_${this.reportedUser || this.reportedMessage || this.reportedGroup}_${this.category}`;
    this.reportHash = require('crypto').createHash('md5').update(hashContent).digest('hex');
    
    // Set priority based on category
    if (['harassment', 'hate_speech', 'bullying'].includes(this.category)) {
      this.priority = 'high';
    } else if (['spam', 'fake_profile'].includes(this.category)) {
      this.priority = 'medium';
    }
  }
  
  // Set resolvedAt when status changes to resolved/dismissed
  if (this.isModified('status') && ['resolved', 'dismissed'].includes(this.status)) {
    this.resolvedAt = new Date();
  }
  
  next();
});

// Static methods
reportSchema.statics.getReportStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
};

reportSchema.statics.getPendingReports = function(limit = 50) {
  return this.find({ status: 'pending' })
    .populate('reporter', 'name email university')
    .populate('reportedUser', 'name email university')
    .populate('assignedModerator', 'name email')
    .sort({ priority: -1, createdAt: 1 })
    .limit(limit);
};

reportSchema.statics.getUserReportHistory = function(userId) {
  return this.find({
    $or: [
      { reporter: userId },
      { reportedUser: userId }
    ]
  })
  .sort({ createdAt: -1 })
  .populate('reporter reportedUser', 'name email');
};

// Instance methods
reportSchema.methods.assignModerator = function(moderatorId) {
  this.assignedModerator = moderatorId;
  this.status = 'investigating';
  return this.save();
};

reportSchema.methods.resolve = function(resolution, actionTaken = 'none', moderatorNotes = '') {
  this.status = 'resolved';
  this.resolution = resolution;
  this.actionTaken = actionTaken;
  this.moderatorNotes = moderatorNotes;
  this.resolvedAt = new Date();
  return this.save();
};

reportSchema.methods.dismiss = function(reason, moderatorNotes = '') {
  this.status = 'dismissed';
  this.resolution = reason;
  this.moderatorNotes = moderatorNotes;
  this.resolvedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Report', reportSchema);