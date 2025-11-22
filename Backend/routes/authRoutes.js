const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();
const fs = require('fs');
const File = require('../models/File');
const { createClient } = require('redis');

// Storage for profile photos
const storage = multer.memoryStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/profilePhotos'));
  },
  filename: (req, file, cb) => {
    cb(
      null,
      Date.now() +
        '-' +
        Math.round(Math.random() * 1e9) +
        path.extname(file.originalname),
    );
  },
});

const upload = multer({ storage: storage });

// Redis connection (wrapped in function, no top-level await)
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: { rejectUnauthorized: false },
});
redisClient.on('error', (err) => {
  console.log('Redis/AuthRoutes connection error:', err);
});
async function connectRedis() {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log('AuthRoutes connected to Redis');
    }
  } catch (err) {
    console.log('Failed to connect Redis in authRoutes.js:', err);
  }
}
connectRedis();

//  REGISTER
router.post('/register', async (req, res) => {
  console.log('Incoming data:', req.body); //
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res
        .status(400)
        .json({ message: 'Email and password are required' });

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: 'User already exists' });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save new user
    const newUser = new User({ email, password: hashedPassword });
    await newUser.save();

    // Generate token
    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res
      .status(201)
      .json({ token, user: { id: newUser._id, email: newUser.email } });
  } catch (err) {
    res
      .status(500)
      .json({ message: 'Registration failed', error: err.message });
  }
});

//  LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required' });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

  res.json({ token, user: { id: user._id, email: user.email } });
});

// ✅ Get logged-in user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Update profile

router.put(
  '/profile',
  authMiddleware,
  upload.single('profilePhoto'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { name, email, mobile, password } = req.body;

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      if (name) user.name = name;
      if (email) user.email = email;
      if (mobile) user.mobile = mobile;
      if (password) {
        user.password = await bcrypt.hash(password, 10);
      }

      if (req.file) {
        const base64 = req.file.buffer.toString('base64');
        user.photo = `data:${req.file.mimetype};base64,${base64}`;
      }

      await user.save();
      res.json({ message: 'Profile updated successfully', user });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  },
);

// DELETE USER ACCOUNT
router.delete('/delete', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Find user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Remove all uploaded files (if storing files in DB or local folder)
    const userFilesDir = path.join(__dirname, '../uploads/files', userId);
    if (fs.existsSync(userFilesDir)) {
      fs.rmSync(userFilesDir, { recursive: true, force: true });
    }

    // Remove profile photo
    if (user.photo && !user.photo.startsWith('data:')) {
      const photoPath = path.join(__dirname, '..', user.photo);
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    }

    // Delete user from DB
    await User.findByIdAndDelete(userId);

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('❌ Error deleting account:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
module.exports = router;
