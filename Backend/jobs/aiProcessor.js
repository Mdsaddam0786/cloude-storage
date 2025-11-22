require('dotenv').config();
const { createClient } = require('redis');
const path = require('path');
const fs = require('fs');
const File = require('../models/File');

// Redis Cloud connection with TLS
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    rejectUnauthorized: false, // optional, if cert issues
  },
});

redisClient.on('error', (err) => {
  console.error('❌ Redis/Processor connection error:', err);
});

async function initRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log(
      ` Processor connected to Redis at ${process.env.REDIS_HOST}:${process.env.REDIS_PORT} (TLS)`,
    );
  }
}

/**
 * Process file with AI (dummy example — replace with your AI logic)
 */
async function processFileWithAI(fileId, filePath) {
  try {
    await initRedis();

    // Simulate AI processing
    console.log(` [AI Processor] Starting AI processing for ${filePath}...`);
    await new Promise((resolve) => setTimeout(resolve, 2000)); // simulate delay

    const tags = ['AI', 'Processed', path.extname(filePath).replace('.', '')];
    //update MongoDb
    const fileDoc = await File.findById(fileId);
    if (fileDoc) {
      fileDoc.ai_tags = tags;
      await fileDoc.save();
      console.log(
        `AI Processor Updated MongoDb for file") ${fileDoc.fileName} `,
      );
    } else {
      console.warn(` File ID ${fileId} not found in MongoDB`);
    }
    // Store AI tags result in Redis
    await redisClient.hSet(`file:${fileId}:ai:tagging`, {
      tags: JSON.stringify(tags),
    });

    console.log(
      `✅ [AI Processor] Finished processing ${filePath}. ai:tagging:`,
      tags,
    );
  } catch (err) {
    console.error(`❌ [AI Processor] Error processing ${filePath}:`, err);
  }
}

module.exports = { processFileWithAI };
