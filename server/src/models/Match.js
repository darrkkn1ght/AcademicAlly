const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  user1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  user2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  compatibilityScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'expired'],
    default: 'pending'
  },
  matchReason: {
    type: String,
    required: true
  },
  courses: [{
    code: String,
    name: String,
    matchWeight: Number
  }],
  preferences: {
    studyHours: {
      overlap: Number,
      weight: Number
    },
    environment: {
      match: Boolean,
      weight: Number
    },
    groupSize: {
      match: Boolean,
      weight: Number
    },
    communicationStyle: {
      compatibility: Number,
      weight: Number
    }
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  respondedAt: {
    type: Date
  },
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    }
  },
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation'
  },
  notes: {
    type: String,
    maxlength: 500
  },
  tags: [{
    type: String,
    maxlength: 50
  }],
  metadata: {
    algorithm: {
      type: String,
      default: 'basic_compatibility_v1'
    },
    factors: {
      courseOverlap: Number,
      scheduleCompatibility: Number,
      studyPreferences: Number,
      location: Number,
      reputation: Number
    },
    version: {
      type: String,
      default: '1.0'
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
matchSchema.index({ user1: 1, user2: 1 }, { unique: true });
matchSchema.index({ user1: 1, status: 1 });
matchSchema.index({ user2: 1, status: 1 });
matchSchema.index({ compatibilityScore: -1 });
matchSchema.index({ expiresAt: 1 });
matchSchema.index({ createdAt: -1 });

// Compound index for finding matches by user and status
matchSchema.index({ 
  '$or': [{ user1: 1 }, { user2: 1 }], 
  status: 1 
});

// Virtual for getting the other user in the match
matchSchema.virtual('otherUser').get(function() {
  return this.user1.equals(this.currentUserId) ? this.user2 : this.user1;
});

// Virtual for checking if match is expired
matchSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date();
});

// Virtual for getting match age in days
matchSchema.virtual('ageInDays').get(function() {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to validate users are different
matchSchema.pre('save', function(next) {
  if (this.user1.equals(this.user2)) {
    next(new Error('Cannot match user with themselves'));
  }
  next();
});

// Pre-save middleware to ensure user1 < user2 for consistency
matchSchema.pre('save', function(next) {
  if (this.user1.toString() > this.user2.toString()) {
    [this.user1, this.user2] = [this.user2, this.user1];
  }
  next();
});

// Method to accept match
matchSchema.methods.accept = function(userId) {
  if (!this.user1.equals(userId) && !this.user2.equals(userId)) {
    throw new Error('User not part of this match');
  }
  
  this.status = 'accepted';
  this.respondedAt = new Date();
  return this.save();
};

// Method to reject match
matchSchema.methods.reject = function(userId) {
  if (!this.user1.equals(userId) && !this.user2.equals(userId)) {
    throw new Error('User not part of this match');
  }
  
  this.status = 'rejected';
  this.respondedAt = new Date();
  return this.save();
};

// Method to check if user is part of match
matchSchema.methods.includesUser = function(userId) {
  return this.user1.equals(userId) || this.user2.equals(userId);
};

// Method to get the other user ID
matchSchema.methods.getOtherUserId = function(userId) {
  if (this.user1.equals(userId)) {
    return this.user2;
  } else if (this.user2.equals(userId)) {
    return this.user1;
  }
  throw new Error('User not part of this match');
};

// Static method to find matches for a user
matchSchema.statics.findForUser = function(userId, status = null) {
  const query = {
    $or: [{ user1: userId }, { user2: userId }]
  };
  
  if (status) {
    query.status = status;
  }
  
  return this.find(query)
    .populate('user1', 'name email university major profilePicture reputation')
    .populate('user2', 'name email university major profilePicture reputation')
    .sort({ createdAt: -1 });
};

// Static method to find mutual match
matchSchema.statics.findMutualMatch = function(user1Id, user2Id) {
  const [userId1, userId2] = user1Id.toString() < user2Id.toString() 
    ? [user1Id, user2Id] 
    : [user2Id, user1Id];
    
  return this.findOne({
    user1: userId1,
    user2: userId2
  });
};

// Static method to get match statistics
matchSchema.statics.getMatchStats = function(userId) {
  return this.aggregate([
    {
      $match: {
        $or: [{ user1: userId }, { user2: userId }]
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgCompatibility: { $avg: '$compatibilityScore' }
      }
    }
  ]);
};

// Static method to expire old matches
matchSchema.statics.expireOldMatches = function() {
  return this.updateMany(
    {
      status: 'pending',
      expiresAt: { $lt: new Date() }
    },
    {
      $set: { status: 'expired' }
    }
  );
};

// Transform output to remove sensitive information
matchSchema.methods.toJSON = function() {
  const match = this.toObject();
  
  // Add virtual fields
  match.isExpired = this.isExpired;
  match.ageInDays = this.ageInDays;
  
  return match;
};

module.exports = mongoose.model('Match', matchSchema);