// controller
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const File = require('../models/File');
const addAIJob = require('../jobs/aiProcessor');

//  Multer Storage Config 
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const userId = req.user?.id;
    const uploadPath = userId
      ? path.join(__dirname, '..', 'uploads', String(userId))
      : path.join(__dirname, '..', 'uploads', 'anonymous');

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({ storage });

// Upload File 
const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // const ownerId = req.user?.id || 'anonymous';

    const newFile = new File({
      fileName: req.file.originalname,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadDate: new Date(),
      ownerId: req.user.id,
    });

    const savedFile = await newFile.save();
    console.log(
      `💾 [FileController] File saved to DB: ${savedFile.fileName} (${savedFile._id})`,
    );

    //  Enqueue AI job asynchronously
    addAIJob({
      _id: savedFile._id,
      fileName: savedFile.fileName,
      filePath: savedFile.filePath,
      mimeType: savedFile.mimeType,
    });

    return res.status(201).json(savedFile);
  } catch (error) {
    console.error('❌ [FileController] uploadFile error:', error);
    return res
      .status(500)
      .json({ message: 'File upload failed', error: error.message || error });
  }
};

//  List Files 
const listFiles = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ message: 'Unauthorized' });

    const files = await File.find({ ownerId }).sort({ uploadDate: -1 });
    return res.status(200).json(files);
  } catch (error) {
    console.error('❌ [FileController] listFiles error:', error);
    return res.status(500).json({
      message: 'Failed to fetch files',
      error: error.message || error,
    });
  }
};

// Download File
const downloadFile = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    if (String(file.ownerId) !== String(ownerId))
      return res.status(403).json({ message: 'Forbidden' });

    const physicalPath = path.resolve(file.filePath);
    if (!fs.existsSync(physicalPath))
      return res.status(404).json({ message: 'Physical file not found' });

    return res.download(physicalPath, file.fileName);
  } catch (error) {
    console.error('❌ [FileController] downloadFile error:', error);
    return res
      .status(500)
      .json({ message: 'Download failed', error: error.message || error });
  }
};

//  Delete File 
const deleteFile = async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      ownerId: req.user.id,
    });
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    const filePath = file.filePath; // use stored path
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await File.deleteOne({ _id: req.params.id, ownerId: req.user.id });
    console.log(
      ` [FileController] File deleted: ${file.fileName} (${file._id})`,
    );

    return res.json({ success: true, message: 'File deleted successfully' });
  } catch (err) {
    console.error('❌ [FileController] deleteFile error:', err);
    return res.status(500).json({ message: 'Server error deleting file' });
  }
};

// ===== Rename File =====
const renameFile = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const { newName } = req.body;
    if (!newName)
      return res.status(400).json({ message: 'New name is required' });

    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    if (String(file.ownerId) !== String(ownerId))
      return res.status(403).json({ message: 'Forbidden' });

    const oldPath = path.resolve(file.filePath);
    const newPath = path.join(path.dirname(oldPath), newName);

    if (!fs.existsSync(oldPath))
      return res.status(404).json({ message: 'Physical file not found' });
    if (fs.existsSync(newPath))
      return res
        .status(409)
        .json({ message: 'A file with the new name already exists' });

    fs.renameSync(oldPath, newPath);

    file.fileName = newName;
    file.filePath = newPath;
    await file.save();
    console.log(` [FileController] File renamed: ${file._id} → ${newName}`);

    return res.status(200).json({ message: 'File renamed successfully', file });
  } catch (error) {
    console.error('❌ [FileController] renameFile error:', error);
    return res
      .status(500)
      .json({ message: 'Rename failed', error: error.message || error });
  }
};

module.exports = {
  upload,
  uploadFile,
  listFiles,
  downloadFile,
  deleteFile,
  renameFile,
};
