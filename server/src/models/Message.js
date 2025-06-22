const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Message Content
  content: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  
  // Sender Information
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Recipient Information (for direct messages)
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.messageType === 'direct';
    }
  },
  
  // Group Information (for group messages)
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: function() {
      return this.messageType === 'group';
    }
  },
  
  // Message Type
  messageType: {
    type: String,
    enum: ['direct', 'group'],
    required: true
  },
  
  // Message Status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  
  // Read Status (for direct messages)
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  
  // Read By (for group messages)
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Message Features
  contentType: {
    type: String,
    enum: ['text', 'image', 'file', 'link', 'code', 'math'],
    default: 'text'
  },
  
  // File attachments
  attachments: [{
    fileName: String,
    fileSize: Number,
    fileType: String,
    fileUrl: String,
    thumbnailUrl: String
  }],
  
  // Reply functionality
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  
  // Message reactions
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Mentions
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Message flags
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,
  originalContent: String,
  
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Priority and importance
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  // Message tags
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, createdAt: -1 });
messageSchema.index({ group: 1, createdAt: -1 });
messageSchema.index({ messageType: 1, createdAt: -1 });
messageSchema.index({ isRead: 1, recipient: 1 });
messageSchema.index({ isDeleted: 1 });

// Compound indexes for conversations
messageSchema.index({ 
  messageType: 1, 
  sender: 1, 
  recipient: 1, 
  createdAt: -1 
});
messageSchema.index({ 
  messageType: 1, 
  group: 1, 
  createdAt: -1 
});

// Virtual for conversation ID (for direct messages)
messageSchema.virtual('conversationId').get(function() {
  if (this.messageType === 'direct') {
    const participants = [this.sender.toString(), this.recipient.toString()].sort();
    return participants.join('_');
  }
  return null;
});

// Virtual for read count (for group messages)
messageSchema.virtual('readCount').get(function() {
  return this.readBy ? this.readBy.length : 0;
});

// Virtual for unread count in group
messageSchema.virtual('unreadCount').get(function() {
  if (this.messageType === 'group' && this.group) {
    // This would need to be populated with group member count
    return 0; // Placeholder - would calculate based on group members
  }
  return 0;
});

// Pre-save middleware
messageSchema.pre('save', function(next) {
  // Update edited timestamp if content is modified
  if (this.isModified('content') && !this.isNew) {
    this.isEdited = true;
    this.editedAt = new Date();
    if (!this.originalContent) {
      this.originalContent = this.content;
    }
  }
  next();
});

// Method to mark as read
messageSchema.methods.markAsRead = function(userId) {
  if (this.messageType === 'direct') {
    this.isRead = true;
    this.readAt = new Date();
  } else if (this.messageType === 'group') {
    const existingRead = this.readBy.find(read => 
      read.user.toString() === userId.toString()
    );
    
    if (!existingRead) {
      this.readBy.push({
        user: userId,
        readAt: new Date()
      });
    }
  }
  return this.save();
};

// Method to add reaction
messageSchema.methods.addReaction = function(userId, emoji) {
  const existingReaction = this.reactions.find(reaction => 
    reaction.user.toString() === userId.toString() && reaction.emoji === emoji
  );
  
  if (!existingReaction) {
    this.reactions.push({
      user: userId,
      emoji: emoji,
      addedAt: new Date()
    });
  }
  
  return this.save();
};

// Method to remove reaction
messageSchema.methods.removeReaction = function(userId, emoji) {
  this.reactions = this.reactions.filter(reaction => 
    !(reaction.user.toString() === userId.toString() && reaction.emoji === emoji)
  );
  
  return this.save();
};

// Method to soft delete
messageSchema.methods.softDelete = function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// Static method to get conversation messages
messageSchema.statics.getConversation = function(user1Id, user2Id, page = 1, limit = 50) {
  return this.find({
    messageType: 'direct',
    $or: [
      { sender: user1Id, recipient: user2Id },
      { sender: user2Id, recipient: user1Id }
    ],
    isDeleted: false
  })
  .populate('sender', 'name profilePicture')
  .populate('recipient', 'name profilePicture')
  .populate('replyTo', 'content sender')
  .sort({ createdAt: -1 })
  .limit(limit * 1)
  .skip((page - 1) * limit);
};

// Static method to get group messages
messageSchema.statics.getGroupMessages = function(groupId, page = 1, limit = 50) {
  return this.find({
    messageType: 'group',
    group: groupId,
    isDeleted: false
  })
  .populate('sender', 'name profilePicture')
  .populate('group', 'name')
  .populate('replyTo', 'content sender')
  .populate('mentions', 'name')
  .sort({ createdAt: -1 })
  .limit(limit * 1)
  .skip((page - 1) * limit);
};

// Static method to get unread messages count
messageSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    messageType: 'direct',
    recipient: userId,
    isRead: false,
    isDeleted: false
  });
};

// Static method to get recent conversations
messageSchema.statics.getRecentConversations = function(userId, limit = 20) {
  return this.aggregate([
    {
      $match: {
        messageType: 'direct',
        $or: [{ sender: userId }, { recipient: userId }],
        isDeleted: false
      }
    },
    {
      $sort: { createdAt: -1 }
    },
    {
      $group: {
        _id: {
          $cond: [
            { $eq: ['$sender', userId] },
            '$recipient',
            '$sender'
          ]
        },
        lastMessage: { $first: '$ROOT' },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$recipient', userId] },
                  { $eq: ['$isRead', false] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'otherUser'
      }
    },
    {
      $unwind: '$otherUser'
    },
    {
      $project: {
        _id: 1,
        lastMessage: 1,
        unreadCount: 1,
        otherUser: {
          _id: '$otherUser._id',
          name: '$otherUser.name',
          profilePicture: '$otherUser.profilePicture',
          lastActive: '$otherUser.lastActive'
        }
      }
    },
    {
      $sort: { 'lastMessage.createdAt': -1 }
    },
    {
      $limit: limit
    }
  ]);
};

module.exports = mongoose.model('Message', messageSchema);