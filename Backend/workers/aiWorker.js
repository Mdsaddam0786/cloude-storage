require('dotenv').config();
const mongoose = require('mongoose');
const { createClient } = require('redis');
const { processFileWithAI } = require('../jobs/aiProcessor'); // Ensure this file exists

// Connect MongoDB
console.log(' Connecting to MongoDB...');
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected in Worker'))
  .catch((err) => console.error('❌ MongoDB connection error in Worker:', err));

// Redis connection with TLS
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: { rejectUnauthorized: false },
});

redisClient.on('error', (err) => {
  console.error('Redis/AIWorker connection error:', err);
});

async function connectAndWork() {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log('AIWorker connected to Redis');
    }

    while (true) {
      const data = await redisClient.brPop('ai:tagging', 0);
      if (data) {
        const job = JSON.parse(data.element);
        console.log('Processing AI job for file:', job.fileId);
        await processFileWithAI(job.fileId, job.filePath);
      }
    }
  } catch (err) {
    console.error('Error in AI worker:', err);
  }
}

connectAndWork();
