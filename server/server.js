const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const helmet = require('helmet');
const compression = require('compression');
const connectDB = require('./src/utils/database');
const socketHandler = require('./src/socket/socketHandler');
const errorMiddleware = require('./src/middleware/errorMiddleware');
const rateLimitMiddleware = require('./src/middleware/rateLimitMiddleware');
const logger = require('./src/utils/logger');
require('dotenv').config();

// Import emailService and initialize it before starting the server
const emailService = require('./src/services/emailService');

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const groupRoutes = require('./src/routes/groupRoutes');
const matchingRoutes = require('./src/routes/matchingRoutes');
const messageRoutes = require('./src/routes/messageRoutes');
const uploadRoutes = require('./src/routes/uploadRoutes');

// Initialize Express app
const app = express();

// Create HTTP server and Socket.io instance
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// Environment variables validation
const requiredEnvVars = ['JWT_SECRET']; // Removed 'MONGODB_URI' from requiredEnvVars
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Set MongoDB URI directly if not set in environment
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb+srv://darkknight:Peter123@academically.gktukls.mongodb.net/?retryWrites=true&w=majority&appName=AcademicAlly';
}

// Connect to MongoDB
const initializeDatabase = async () => {
  try {
    await connectDB();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
};

// Security and performance middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(compression());

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.CLIENT_URL || "http://localhost:3000",
      "http://localhost:3000",
      "http://localhost:3001" // For testing
    ];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms - ${req.ip}`);
  });
  
  next();
});

// Rate limiting (apply to API routes only)
app.use('/api', rateLimitMiddleware.generalLimit);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/uploads', uploadRoutes);

// Health check endpoints
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    message: 'AcademicAlly server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Detailed health check for monitoring
app.get('/api/health/detailed', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: {
          status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
          name: mongoose.connection.name || 'unknown'
        },
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
        },
        socketConnections: io.engine.clientsCount || 0
      }
    };

    res.status(200).json(healthCheck);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Service unavailable',
      timestamp: new Date().toISOString()
    });
  }
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'AcademicAlly API',
    version: '1.0.0',
    description: 'University Study Partner & Group Matching Platform API',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      groups: '/api/groups',
      matching: '/api/matching',
      messages: '/api/messages',
      uploads: '/api/uploads',
      health: '/api/health'
    },
    documentation: 'Visit our documentation for detailed API usage',
    support: 'Contact support for assistance'
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info(`New socket connection: ${socket.id}`);
  
  socket.on('disconnect', (reason) => {
    logger.info(`Socket disconnected: ${socket.id} - Reason: ${reason}`);
  });
});

// Initialize Socket.io handlers
socketHandler(io);

// Error handling middleware (must be after all routes)
app.use(errorMiddleware.globalErrorHandler);

// Handle 404 for undefined routes
app.use('*', (req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  res.status(404).json({ 
    error: 'Route not found',
    message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`,
    availableEndpoints: [
      'GET /api',
      'GET /api/health',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET /api/users/profile',
      'GET /api/groups',
      'GET /api/matching/suggestions'
    ]
  });
});

// Server startup
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Ensure email service is initialized before starting the server
(async () => {
  try {
    await emailService.init();
    console.log('Email service initialized');
  } catch (err) {
    console.error('Failed to initialize email service:', err);
    process.exit(1);
  }
})();

// Initialize server
const startServer = async () => {
  try {
    // Initialize database connection
    await initializeDatabase();
    
    // Start server
    server.listen(PORT, HOST, () => {
      logger.info('='.repeat(50));
      logger.info(`🚀 AcademicAlly Server Started Successfully!`);
      logger.info(`📍 Server: http://${HOST}:${PORT}`);
      logger.info(`📱 Client: ${process.env.CLIENT_URL || "http://localhost:3000"}`);
      logger.info(`🗄️  Database: ${process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}`);
      logger.info(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📊 Health Check: http://${HOST}:${PORT}/api/health`);
      logger.info(`📚 API Docs: http://${HOST}:${PORT}/api`);
      logger.info('='.repeat(50));
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        logger.error('Server error:', error);
        process.exit(1);
      }
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, starting graceful shutdown...`);
  
  // Close server
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connection
    const mongoose = require('mongoose');
    mongoose.connection.close(() => {
      logger.info('Database connection closed');
      logger.info('Graceful shutdown completed');
      process.exit(0);
    });
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Start the server
startServer();

// Export for testing
module.exports = { app, server, io };