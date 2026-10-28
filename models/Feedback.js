const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  name: {
    type: String,
    required: false
  },
  email: {
    type: String,
    required: false
  },
  feedbackType: {
    type: String,
    enum: [
      'Feature Request',
      'Bug Report',
      'UI Improvement',
      'Job Matching Feedback',
      'Auto Apply Suggestions',
      'Resume Builder Feedback',
      'General Review',
      'Other'
    ],
    required: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: false
  },
  screenshotUrl: {
    type: String,
    required: false
  },
  recommendPlatform: {
    type: Boolean,
    required: false
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Low'
  },
  isAnonymous: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
