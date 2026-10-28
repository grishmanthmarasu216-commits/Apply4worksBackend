const express = require('express');
const router = express.Router();
const { submitFeedback, getFeedbackForAdmin } = require('../controllers/feedbackController');
const { protect } = require('../middleware/authMiddleware');

// Using an optional auth middleware to allow anonymous submissions to still get user data if logged in
const optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const jwt = require('jsonwebtoken');
      const User = require('../models/User');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      req.user = await User.findById(decoded.id).select('-password');
    } catch (error) {
      console.log("Optional Auth Error in Feedback:", error.message);
    }
  }
  next();
};

router.post('/', optionalAuth, submitFeedback);
router.get('/admin', protect, getFeedbackForAdmin);

module.exports = router;
