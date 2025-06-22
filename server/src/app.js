const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

// Import middleware
const errorMiddleware = require('./middleware/errorMiddleware');
const authMiddleware = require('./middleware/authMiddleware');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const matchingRoutes = require('./routes/matchingRoutes');
const groupRoutes = require('./routes/groupRoutes');
const messageRoutes = require('./routes/messageRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

// Import socket handlers
const socketHandler = require('./socket/socketHandler');

// Import utilities
const logger = require('./utils/logger');
const { connectDB } = require('./utils/database');

// Initialize Express app
const app = express();

// Create HTTP server for Socket.io
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Make io accessible to routes
app.set('io', io);

// Database connection
connectDB()
  .then(() => {
    logger.info('Database connected successfully');
  })
  .catch((error) => {
    logger.error('Database connection failed:', error);
    process.exit(1);
  });

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://images.unsplash.com"],
      connectSrc: ["'self'", process.env.CLIENT_URL || "http://localhost:3000"]
    }
  }
}));

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.CLIENT_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://localhost:3001'
    ];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Compression middleware
app.use(compression());

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Global rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 1000 : 2000, // requests per window
  message: {
    error: 'Too many requests from this IP, please try again later',
    retryAfter: 15 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/health';
  }
});

app.use(globalLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'AcademicAlly API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/uploads', uploadRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  // Serve static files from React build
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  // Handle React routing - send all non-API requests to React app
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
    } else {
      res.status(404).json({ error: 'API endpoint not found' });
    }
  });
} else {
  // Development root endpoint
  app.get('/', (req, res) => {
    res.json({
      message: 'AcademicAlly API Server',
      version: '1.0.0',
      environment: 'development',
      endpoints: {
        auth: '/api/auth',
        users: '/api/users',
        matching: '/api/matching',
        groups: '/api/groups',
        messages: '/api/messages',
        uploads: '/api/uploads'
      },
      docs: '/api/docs',
      health: '/api/health'
    });
  });
}

// API documentation endpoint (development only)
if (process.env.NODE_ENV === 'development') {
  app.get('/api/docs', (req, res) => {
    res.json({
      title: 'AcademicAlly API Documentation',
      version: '1.0.0',
      description: 'University study partner matching platform API',
      baseUrl: `${req.protocol}://${req.get('host')}/api`,
      endpoints: {
        authentication: {
          'POST /auth/register': 'Register new user',
          'POST /auth/login': 'Login user',
          'POST /auth/logout': 'Logout user',
          'POST /auth/refresh': 'Refresh access token',
          'POST /auth/forgot-password': 'Request password reset',
          'POST /auth/reset-password': 'Reset password'
        },
        users: {
          'GET /users/profile': 'Get user profile',
          'PUT /users/profile': 'Update user profile',
          'GET /users/preferences': 'Get study preferences',
          'PUT /users/preferences': 'Update study preferences',
          'GET /users/stats': 'Get user statistics'
        },
        matching: {
          'GET /matching/suggestions': 'Get study partner suggestions',
          'POST /matching/like': 'Like a potential match',
          'POST /matching/pass': 'Pass on a potential match',
          'GET /matching/matches': 'Get matched users'
        },
        groups: {
          'GET /groups': 'List study groups',
          'POST /groups': 'Create study group',
          'GET /groups/:id': 'Get group details',
          'POST /groups/:id/join': 'Join study group',
          'POST /groups/:id/leave': 'Leave study group'
        },
        messages: {
          'GET /messages/conversations': 'Get user conversations',
          'GET /messages/:conversationId': 'Get conversation messages',
          'POST /messages/send': 'Send message',
          'PUT /messages/:id/read': 'Mark message as read'
        },
        uploads: {
          'POST /uploads/profile-picture': 'Upload profile picture',
          'POST /uploads/message-attachment': 'Upload message attachment',
          'POST /uploads/group-image': 'Upload group image'
        }
      },
      authentication: 'Bearer token required for most endpoints',
      rateLimit: 'Global: 1000 req/15min, Auth: 10 req/15min',
      websocket: 'Socket.io enabled for real-time messaging'
    });
  });
}

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Socket.io connection handling
socketHandler(io);

// Global error handler (must be last)
app.use(errorMiddleware);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
  });
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (err, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', err);
  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception thrown:', err);
  process.exit(1);
});

module.exports = { app, server, io };