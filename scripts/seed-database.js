// scripts/seed-database.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '../server/.env' });
const User = require('../server/src/models/User');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/academically';

async function seedDemoUser() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const demoEmail = 'demo@example.com';
    const demoPassword = 'demopassword';

    const hashedPassword = await bcrypt.hash(demoPassword, 12); // Use 12 salt rounds to match backend
    const existing = await User.findOne({ email: demoEmail });
    if (existing) {
      existing.password = hashedPassword;
      existing.loginAttempts = 0;
      await existing.save();
      console.log('Demo user password updated and loginAttempts reset.');
      await mongoose.disconnect();
      return;
    }
    const demoUser = new User({
      name: 'Demo User',
      email: demoEmail,
      password: hashedPassword,
      university: 'Demo University',
      year: '1st Year',
      major: 'Demo Major',
      verified: true,
      emailVerified: true,
      loginAttempts: 0
    });
    await demoUser.save();
    console.log('Demo user created:', demoEmail, '/', demoPassword);
    await mongoose.disconnect();
    return;
  } catch (err) {
    console.error('Seeding failed:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seedDemoUser();
