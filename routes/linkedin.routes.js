const express = require('express');
const router = express.Router();
const linkedinController = require('../controllers/linkedin.controller');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

// Configure multer for local upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Images only (jpeg, jpg, png, webp)!'));
  }
});

// OAuth Routes
router.get('/connect', protect, linkedinController.getConnectUrl);
router.get('/callback', linkedinController.handleCallback); // Removed protect because LinkedIn redirects here via browser
router.get('/status', protect, linkedinController.getConnectionStatus);

// Post Actions
router.post('/generate', protect, linkedinController.generatePosts);
router.post('/generate-from-resume', protect, linkedinController.generateFromResume);
router.post('/publish', protect, linkedinController.publishPost);

// Upload Image
router.post('/upload-image', protect, upload.single('image'), linkedinController.uploadImage);

// Schedule
router.post('/schedule', protect, linkedinController.schedulePost);

// Drafts
router.get('/drafts', protect, linkedinController.getDrafts);
router.put('/drafts/:id', protect, linkedinController.updateDraft);

// Usage & Auto Drafts
router.get('/usage', protect, linkedinController.getUsageStatus);
router.get('/auto-draft', protect, linkedinController.getAutoDraft);
router.post('/auto-draft', protect, linkedinController.saveAutoDraft);

module.exports = router;
