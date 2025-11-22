// routes/fileRoutes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const File = require('../models/File');
const { processFileWithAI } = require('../jobs/aiProcessor');
const fs = require('fs');
const router = express.Router();
const { createClient } = require('redis');
const authMiddleware = require('../middleware/authMiddleware');
// Redis connection without top-level await
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: { rejectUnauthorized: false },
});
redisClient.on('error', (err) => {
  console.log('Redis/FileRoutes connection error:', err);
});
async function connectRedis() {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();

      console.log('FileRoutes connected to Redis');
    }
  } catch (err) {
    console.log('Failed to connect Redis in fileRoutes.js:', err);
  }
}
connectRedis();

// Storage config for Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/files')); // Ensure folder exists
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

// Create multer instance
const upload = multer({ storage });

//  Upload endpoint
router.post(
  '/upload',
  authMiddleware,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Save file to MongoDB
      const newFile = new File({
        fileName: req.file.originalname,
        filePath: req.file.path,
        mimeType: req.file.mimetype,
        size: req.file.size,
        ai_tags: [], // Start empty
        ownerId: req.user.id,
      });

      const savedFile = await newFile.save();

      console.log(`✅ File saved to DB: ${savedFile.fileName}`);

      await connectRedis();
      await redisClient.lPush(
        'ai:tagging',
        JSON.stringify({
          fileId: savedFile.id,
          filePath: savedFile.filePath,
        }),
      );
      // Add job to AI queue for tagging
      // processFileWithAI(savedFile); //hatao ise

      res.status(201).json({
        message: 'File uploaded and queued for AI tagging',
        file: savedFile,
      });
    } catch (error) {
      console.error('❌ Error uploading file:', error);
      res.status(500).json({ message: 'Server error uploading file' });
    }
  },
);

//  Get all files
router.get('/', authMiddleware, async (req, res) => {
  try {
    const files = await File.find({ ownerId: req.user.id });
    res.json(files);
  } catch (error) {
    console.error('❌ Error fetching files:', error);
    res.status(500).json({ message: 'Server error fetching files' });
  }
});
//  Delete file by ID
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res
        .status(404)
        .json({ success: false, message: 'File not found' });
    }

    // Delete from filesystem

    const filePath = path.resolve(file.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from MongoDB
    await file.deleteOne();

    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting file:', error);
    res
      .status(500)
      .json({ success: false, message: 'Server error deleting file' });
  }
});
router.patch('/:id/rename', authMiddleware, async (req, res) => {
  try {
    const { newName } = req.body;
    if (!newName?.trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'New name is required' });
    }

    const file = await File.findById(req.params.id);
    if (!file) {
      return res
        .status(404)
        .json({ success: false, message: 'File not found' });
    }

    file.fileName = newName;
    await file.save();

    res.json({ success: true, message: 'File renamed successfully', file });
  } catch (error) {
    console.error('❌ Error renaming file:', error);
    res
      .status(500)
      .json({ success: false, message: 'Server error renaming file' });
  }
});
router.post('/:id/share', authMiddleware, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res
        .status(404)
        .json({ success: false, message: 'File not found' });
    }

    // Simple share URL
    const shareUrl = `${req.protocol}://${req.get(
      'host',
    )}/uploads/${path.basename(file.filePath)}`;

    res.json({ success: true, shareUrl });
  } catch (error) {
    console.error('❌ Error generating share link:', error);
    res
      .status(500)
      .json({ success: false, message: 'Server error generating share link' });
  }
});
// ✅ Update profile

module.exports = router;
