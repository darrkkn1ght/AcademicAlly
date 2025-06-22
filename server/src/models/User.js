const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Information
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false // Don't include password in queries by default
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  
  // Academic Information
  university: {
    type: String,
    required: [true, 'University is required'],
    trim: true,
    maxlength: [100, 'University name cannot exceed 100 characters']
  },
  year: {
    type: String,
    required: [true, 'Academic year is required'],
    enum: ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Graduate', 'PhD']
  },
  major: {
    type: String,
    required: [true, 'Major is required'],
    trim: true,
    maxlength: [100, 'Major cannot exceed 100 characters']
  },
  courses: [{
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    semester: {
      type: String,
      enum: ['Fall', 'Spring', 'Summer', 'Winter'],
      required: true
    },
    year: {
      type: Number,
      required: true
    }
  }],
  
  // Study Preferences
  studyPreferences: {
    preferredGroupSize: {
      type: String,
      enum: ['1-on-1', 'Small Group (2-4)', 'Medium Group (5-8)', 'Large Group (9+)', 'No Preference'],
      default: 'Small Group (2-4)'
    },
    studyStyle: [{
      type: String,
      enum: ['Visual', 'Auditory', 'Kinesthetic', 'Reading/Writing', 'Discussion', 'Practice Problems', 'Flashcards', 'Mind Maps']
    }],
    studyIntensity: {
      type: String,
      enum: ['Casual', 'Moderate', 'Intensive', 'Exam Prep'],
      default: 'Moderate'
    },
    meetingType: [{
      type: String,
      enum: ['In-Person', 'Online', 'Hybrid']
    }],
    location: {
      campus: { type: Boolean, default: true },
      library: { type: Boolean, default: true },
      studyRooms: { type: Boolean, default: true },
      cafes: { type: Boolean, default: false },
      home: { type: Boolean, default: false },
      online: { type: Boolean, default: true }
    }
  },
  
  // Availability
  availability: {
    monday: {
      available: { type: Boolean, default: false },
      timeSlots: [{ start: String, end: String }]
    },
    tuesday: {
      available: { type: Boolean, default: false },
      timeSlots: [{ start: String, end: String }]
    },
    wednesday: {
      available: { type: Boolean, default: false },
      timeSlots: [{ start: String, end: String }]
    },
    thursday: {
      available: { type: Boolean, default: false },
      timeSlots: [{ start: String, end: String }]
    },
    friday: {
      available: { type: Boolean, default: false },
      timeSlots: [{ start: String, end: String }]
    },
    saturday: {
      available: { type: Boolean, default: false },
      timeSlots: [{ start: String, end: String }]
    },
    sunday: {
      available: { type: Boolean, default: false },
      timeSlots: [{ start: String, end: String }]
    }
  },
  
  // Profile Information
  profilePicture: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    trim: true
  },
  
  // Reputation & Trust
  reputation: {
    type: Number,
    default: 5.0,
    min: 0,
    max: 5
  },
  ratingsCount: {
    type: Number,
    default: 0
  },
  totalRatingScore: {
    type: Number,
    default: 0
  },
  
  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  
  // Security
  passwordResetToken: String,
  passwordResetExpires: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  
  // Activity Tracking
  lastActive: {
    type: Date,
    default: Date.now
  },
  studySessionsCount: {
    type: Number,
    default: 0
  },
  groupsJoined: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  }],
  groupsCreated: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
userSchema.index({ university: 1, year: 1 });
userSchema.index({ 'courses.code': 1 });
userSchema.index({ lastActive: -1 });
userSchema.index({ reputation: -1 });

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to update reputation
userSchema.methods.updateReputation = function(newRating) {
  this.totalRatingScore += newRating;
  this.ratingsCount += 1;
  this.reputation = this.totalRatingScore / this.ratingsCount;
  return this.save();
};

// Method to increment failed login attempts
userSchema.methods.incrementLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Static method to find users by course
userSchema.statics.findByCourse = function(courseCode) {
  return this.find({ 'courses.code': courseCode });
};

// Static method to find active users
userSchema.statics.findActive = function() {
  return this.find({ 
    isActive: true,
    lastActive: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Active in last 30 days
  });
};

module.exports = mongoose.model('User', userSchema);