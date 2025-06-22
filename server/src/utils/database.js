const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://darkknight:Peter123@academically.gktukls.mongodb.net/?retryWrites=true&w=majority&appName=AcademicAlly';
    
    const options = {
    // useNewUrlParser: true, // Deprecated, removed
    // useUnifiedTopology: true, // Deprecated, removed
    autoIndex: process.env.NODE_ENV !== 'production', // Don't build indexes in production
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    };

    const conn = await mongoose.connect(mongoURI, options);

    console.log(`📦 MongoDB Connected: ${conn.connection.host}`);
    console.log(`🗃️  Database Name: ${conn.connection.name}`);

    // Handle connection events
    mongoose.connection.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('📦 MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('📦 MongoDB reconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('📦 MongoDB connection closed through app termination');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error closing MongoDB connection:', error);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    
    // Retry connection after 5 seconds
    setTimeout(() => {
      console.log('🔄 Retrying MongoDB connection...');
      connectDB();
    }, 5000);
  }
};

module.exports = connectDB;