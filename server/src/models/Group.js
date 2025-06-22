const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Group name is required'],
    trim: true,
    maxlength: [100, 'Group name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Group description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  // Academic Information
  course: {
    code: {
      type: String,
      required: [true, 'Course code is required'],
      trim: true,
      uppercase: true
    },
    name: {
      type: String,
      required: [true, 'Course name is required'],
      trim: true
    }
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  
  // Group Management
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['member', 'admin', 'creator'],
      default: 'member'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // Group Settings
  maxMembers: {
    type: Number,
    required: true,
    min: [2, 'Group must allow at least 2 members'],
    max: [50, 'Group cannot exceed 50 members']
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  requiresApproval: {
    type: Boolean,
    default: false
  },
  
  // Meeting Information
  meetingType: {
    type: String,
    enum: ['In-Person', 'Online', 'Hybrid'],
    required: true
  },
  location: {
    type: {
      type: String,
      enum: ['campus', 'library', 'study-room', 'cafe', 'online', 'other'],
      required: function() {
        return this.meetingType === 'In-Person' || this.meetingType === 'Hybrid';
      }
    },
    details: {
      type: String,
      trim: true,
      maxlength: [200, 'Location details cannot exceed 200 characters']
    },
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  
  // Schedule
  schedule: {
    type: {
      type: String,
      enum: ['one-time', 'recurring', 'flexible'],
      default: 'flexible'
    },
    startDate: Date,
    endDate: Date,
    recurringPattern: {
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'bi-weekly', 'monthly']
      },
      daysOfWeek: [{
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      }],
      timeSlot: {
        start: String, // Format: "HH:MM"
        end: String,   // Format: "HH:MM"
        timezone: {
          type: String,
          default: 'UTC'
        }
      }
    }
  },
  
  // Requirements & Preferences
  requirements: {
    minimumYear: {
      type: String,
      enum: ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Graduate', 'PhD']
    },
    minimumReputation: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    studyStyle: [{
      type: String,
      enum: ['Visual', 'Auditory', 'Kinesthetic', 'Reading/Writing', 'Discussion', 'Practice Problems', 'Flashcards', 'Mind Maps']
    }],
    commitment: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    }
  },
  
  // Group Activity
  lastActivity: {
    type: Date,
    default: Date.now
  },
  messageCount: {
    type: Number,
    default: 0
  },
  studySessionsCount: {
    type: Number,
    default: 0
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'cancelled'],
    default: 'active'
  },
  
  // Tags for better searchability
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  // Join Requests (for groups requiring approval)
  joinRequests: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: {
      type: String,
      maxlength: [200, 'Join request message cannot exceed 200 characters']
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    }
  }],
  
  // Group Rules
  rules: [{
    type: String,
    maxlength: [200, 'Each rule cannot exceed 200 characters']
  }],
  
  // Statistics
  stats: {
    totalStudyHours: {
      type: Number,
      default: 0
    },
    completedSessions: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
groupSchema.index({ 'course.code': 1 });
groupSchema.index({ subject: 1 });
groupSchema.index({ meetingType: 1 });
groupSchema.index({ isActive: 1, status: 1 });
groupSchema.index({ creator: 1 });
groupSchema.index({ 'members.user': 1 });
groupSchema.index({ tags: 1 });
groupSchema.index({ lastActivity: -1 });

// Virtual for current member count
groupSchema.virtual('currentMemberCount').get(function() {
  return this.members ? this.members.filter(member => member.isActive).length : 0;
});

// Virtual for available spots
groupSchema.virtual('availableSpots').get(function() {
  return this.maxMembers - this.currentMemberCount;
});

// Virtual for is full
groupSchema.virtual('isFull').get(function() {
  return this.currentMemberCount >= this.maxMembers;
});

// Pre-save middleware to ensure creator is in members array and is admin
groupSchema.pre('save', function(next) {
  if (this.isNew) {
    // Add creator to members array if not already present
    const creatorInMembers = this.members.some(member => 
      member.user.toString() === this.creator.toString()
    );
    
    if (!creatorInMembers) {
      this.members.push({
        user: this.creator,
        role: 'creator',
        joinedAt: new Date()
      });
    }
    
    // Add creator to admins array if not already present
    if (!this.admins.includes(this.creator)) {
      this.admins.push(this.creator);
    }
  }
  next();
});

// Method to add member
groupSchema.methods.addMember = function(userId, role = 'member') {
  if (this.isFull) {
    throw new Error('Group is full');
  }
  
  const existingMember = this.members.find(member => 
    member.user.toString() === userId.toString()
  );
  
  if (existingMember) {
    if (!existingMember.isActive) {
      existingMember.isActive = true;
      existingMember.joinedAt = new Date();
    }
  } else {
    this.members.push({
      user: userId,
      role: role,
      joinedAt: new Date()
    });
  }
  
  return this.save();
};

// Method to remove member
groupSchema.methods.removeMember = function(userId) {
  const memberIndex = this.members.findIndex(member => 
    member.user.toString() === userId.toString()
  );
  
  if (memberIndex > -1) {
    // Don't remove creator
    if (this.members[memberIndex].role === 'creator') {
      throw new Error('Cannot remove group creator');
    }
    
    this.members[memberIndex].isActive = false;
  }
  
  return this.save();
};

// Method to promote member to admin
groupSchema.methods.promoteToAdmin = function(userId) {
  const member = this.members.find(member => 
    member.user.toString() === userId.toString() && member.isActive
  );
  
  if (member) {
    member.role = 'admin';
    if (!this.admins.includes(userId)) {
      this.admins.push(userId);
    }
  }
  
  return this.save();
};

// Method to update last activity
groupSchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save();
};

// Static method to find groups by course
groupSchema.statics.findByCourse = function(courseCode) {
  return this.find({ 
    'course.code': courseCode,
    isActive: true,
    status: 'active'
  });
};

// Static method to find public groups
groupSchema.statics.findPublic = function() {
  return this.find({ 
    isPrivate: false,
    isActive: true,
    status: 'active'
  });
};

// Static method to find groups with available spots
groupSchema.statics.findWithSpots = function() {
  return this.aggregate([
    {
      $match: {
        isActive: true,
        status: 'active'
      }
    },
    {
      $addFields: {
        activeMemberCount: {
          $size: {
            $filter: {
              input: '$members',
              cond: { $eq: ['$$this.isActive', true] }
            }
          }
        }
      }
    },
    {
      $match: {
        $expr: { $lt: ['$activeMemberCount', '$maxMembers'] }
      }
    }
  ]);
};

module.exports = mongoose.model('Group', groupSchema);