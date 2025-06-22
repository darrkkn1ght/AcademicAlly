const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * MongoDB Database Configuration
 * Handles connection, reconnection, and connection monitoring
 */
class DatabaseConfig {
  constructor() {
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
    this.healthCheckInterval = null;
  }

  /**
   * Get MongoDB connection URI based on environment
   */
  getConnectionURI() {
    // Directly use the provided MongoDB URI for all environments
    return 'mongodb+srv://darkknight:Peter123@academically.gktukls.mongodb.net/?retryWrites=true&w=majority&appName=AcademicAlly';
  }

  /**
   * Get MongoDB connection options
   */
  getConnectionOptions() {
    const env = process.env.NODE_ENV || 'development';
    
    const baseOptions = {
      // Connection settings
      // useNewUrlParser: true, // Deprecated, remove
      // useUnifiedTopology: true, // Deprecated, remove
      
      // Buffering settings
      bufferCommands: false,
      bufferMaxEntries: 0,
      
      // Connection pool settings
      maxPoolSize: env === 'production' ? 20 : 10, // Maintain up to 20/10 socket connections
      minPoolSize: env === 'production' ? 5 : 2,   // Maintain minimum 5/2 socket connections
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      
      // Timeout settings
      serverSelectionTimeoutMS: 10000, // Keep trying to send operations for 10 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
      
      // Heartbeat settings
      heartbeatFrequencyMS: 10000, // Check server status every 10 seconds
      
      // Write concern (for production safety)
      w: env === 'production' ? 'majority' : 1,
      j: env === 'production', // Journal writes in production
      
      // Read preference
      readPreference: 'primary',
      
      // Compression (for production efficiency)
      compressors: env === 'production' ? ['snappy', 'zlib'] : undefined,
      
      // Application name for MongoDB logs
      appName: `AcademicAlly-${env}`,
      
      // Retry writes
      retryWrites: true,
      retryReads: true
    };

    // Add authentication if credentials are provided
    if (process.env.MONGODB_USERNAME && process.env.MONGODB_PASSWORD) {
      baseOptions.auth = {
        username: process.env.MONGODB_USERNAME,
        password: process.env.MONGODB_PASSWORD
      };
      baseOptions.authSource = process.env.MONGODB_AUTH_SOURCE || 'admin';
    }

    return baseOptions;
  }

  /**
   * Connect to MongoDB with retry logic
   */
  async connect() {
    const uri = this.getConnectionURI();
    const options = this.getConnectionOptions();

    if (!uri) {
      throw new Error('MongoDB URI is not defined in environment variables');
    }

    try {
      logger.info('Attempting to connect to MongoDB...');
      logger.info(`Database URI: ${uri.replace(/\/\/.*@/, '//***:***@')}`); // Hide credentials in logs
      
      await mongoose.connect(uri, options);
      
      this.isConnected = true;
      this.connectionAttempts = 0;
      
      logger.info('✅ MongoDB connected successfully');
      logger.info(`📊 Database: ${mongoose.connection.name}`);
      logger.info(`🔗 Host: ${mongoose.connection.host}:${mongoose.connection.port}`);
      logger.info(`⚙️  Ready State: ${this.getReadyStateText(mongoose.connection.readyState)}`);
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      return mongoose.connection;
    } catch (error) {
      this.connectionAttempts++;
      logger.error(`❌ MongoDB connection failed (attempt ${this.connectionAttempts}):`, error.message);
      
      if (this.connectionAttempts < this.maxRetries) {
        logger.info(`🔄 Retrying connection in ${this.retryDelay / 1000} seconds...`);
        await this.delay(this.retryDelay);
        return this.connect();
      } else {
        logger.error(`💥 Failed to connect to MongoDB after ${this.maxRetries} attempts`);
        throw error;
      }
    }
  }

  /**
   * Setup connection event listeners
   */
  setupEventListeners() {
    const connection = mongoose.connection;

    // Connection opened
    connection.on('connected', () => {
      this.isConnected = true;
      logger.info('🔗 MongoDB connection established');
    });

    // Connection error
    connection.on('error', (error) => {
      this.isConnected = false;
      logger.error('❌ MongoDB connection error:', error);
    });

    // Connection disconnected
    connection.on('disconnected', () => {
      this.isConnected = false;
      logger.warn('⚠️  MongoDB connection lost');
    });

    // Reconnected
    connection.on('reconnected', () => {
      this.isConnected = true;
      logger.info('🔄 MongoDB reconnected successfully');
    });

    // Connection close
    connection.on('close', () => {
      this.isConnected = false;
      logger.info('🔌 MongoDB connection closed');
    });

    // Full driver reconnect event
    connection.on('fullsetup', () => {
      logger.info('🎯 MongoDB replica set connection established');
    });

    // Replica set events (for production clusters)
    connection.on('all', () => {
      logger.debug('🔄 All MongoDB replica set members connected');
    });

    // Index build events
    connection.on('index', (error) => {
      if (error) {
        logger.error('❌ MongoDB index build error:', error);
      } else {
        logger.debug('✅ MongoDB index built successfully');
      }
    });
  }

  /**
   * Start periodic health monitoring
   */
  startHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Check connection health every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);
  }

  /**
   * Perform database health check
   */
  async performHealthCheck() {
    try {
      if (!this.isConnected) {
        logger.warn('🔍 Health check: Database not connected');
        return;
      }

      // Simple ping to check connection
      await mongoose.connection.db.admin().ping();
      
      // Log connection stats periodically (every 5 minutes)
      if (Date.now() % 300000 < 30000) { // Roughly every 5 minutes
        this.logConnectionStats();
      }
    } catch (error) {
      logger.error('❌ Database health check failed:', error.message);
      this.isConnected = false;
    }
  }

  /**
   * Log detailed connection statistics
   */
  logConnectionStats() {
    const connection = mongoose.connection;
    const stats = {
      readyState: this.getReadyStateText(connection.readyState),
      host: `${connection.host}:${connection.port}`,
      name: connection.name,
      collections: Object.keys(connection.collections).length,
      models: Object.keys(connection.models).length
    };

    logger.info('📊 Database connection stats:', stats);
  }

  /**
   * Get human-readable ready state text
   */
  getReadyStateText(state) {
    const states = {
      0: 'Disconnected',
      1: 'Connected',
      2: 'Connecting',
      3: 'Disconnecting',
      99: 'Uninitialized'
    };
    return states[state] || 'Unknown';
  }

  /**
   * Gracefully close database connection
   */
  async disconnect() {
    try {
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      if (mongoose.connection.readyState !== 0) {
        logger.info('🔌 Closing MongoDB connection...');
        await mongoose.connection.close();
        logger.info('✅ MongoDB connection closed successfully');
      }
      
      this.isConnected = false;
    } catch (error) {
      logger.error('❌ Error closing MongoDB connection:', error);
      throw error;
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      readyStateText: this.getReadyStateText(mongoose.connection.readyState),
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
      collections: Object.keys(mongoose.connection.collections || {}).length,
      models: Object.keys(mongoose.connection.models || {}).length
    };
  }

  /**
   * Initialize database indexes for optimal performance
   */
  async initializeIndexes() {
    try {
      logger.info('🔍 Initializing database indexes...');

      const User = require('../models/User');
      const Group = require('../models/Group');
      const Message = require('../models/Message');
      const Match = require('../models/Match');

      // Create indexes for better query performance
      await Promise.all([
        User.createIndexes(),
        Group.createIndexes(),
        Message.createIndexes(),
        Match.createIndexes()
      ]);

      logger.info('✅ Database indexes initialized successfully');
    } catch (error) {
      logger.error('❌ Error initializing database indexes:', error);
    }
  }

  /**
   * Seed initial data for development
   */
  async seedData() {
    const env = process.env.NODE_ENV || 'development';
    
    if (env === 'production') {
      logger.info('⚠️  Skipping data seeding in production environment');
      return;
    }

    try {
      logger.info('🌱 Checking if database seeding is needed...');
      
      const User = require('../models/User');
      const userCount = await User.countDocuments();
      
      if (userCount === 0) {
        logger.info('🌱 Seeding initial development data...');
        
        // Create sample users, groups, etc.
        // This would contain sample data for development
        
        logger.info('✅ Database seeded successfully');
      } else {
        logger.info('📊 Database already contains data, skipping seed');
      }
    } catch (error) {
      logger.error('❌ Error seeding database:', error);
    }
  }

  /**
   * Utility function for delays
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create singleton instance
const databaseConfig = new DatabaseConfig();

// Setup event listeners
databaseConfig.setupEventListeners();

/**
 * Main connection function (for backward compatibility)
 */
const connectDB = async () => {
  try {
    const connection = await databaseConfig.connect();
    
    // Initialize indexes in production/staging
    if (process.env.NODE_ENV !== 'test') {
      await databaseConfig.initializeIndexes();
    }
    
    // Seed data in development
    if (process.env.NODE_ENV === 'development') {
      await databaseConfig.seedData();
    }
    
    return connection;
  } catch (error) {
    logger.error('Failed to establish database connection:', error);
    throw error;
  }
};

/**
 * Graceful shutdown function
 */
const disconnectDB = async () => {
  return databaseConfig.disconnect();
};

/**
 * Get connection status
 */
const getDBStatus = () => {
  return databaseConfig.getStatus();
};

module.exports = {
  connectDB,
  disconnectDB,
  getDBStatus,
  databaseConfig
};