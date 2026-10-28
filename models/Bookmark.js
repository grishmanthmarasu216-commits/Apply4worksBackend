const mongoose = require('mongoose');

const bookmarkSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  summary: {
    type: String
  },
  source: {
    type: String
  },
  publishedDate: {
    type: Date
  },
  type: {
    type: String,
    enum: ['article', 'video', 'documentation', 'interview', 'other'],
    default: 'other'
  }
}, { timestamps: true });

// Prevent duplicate bookmarks for the same user and url
bookmarkSchema.index({ userId: 1, url: 1 }, { unique: true });

module.exports = mongoose.model('Bookmark', bookmarkSchema);
