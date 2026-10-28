const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true
  },
  metaTitle: {
    type: String,
    required: true,
  },
  metaDescription: {
    type: String,
    required: true,
  },
  focusKeyword: {
    type: String,
  },
  relatedKeywords: [{
    type: String,
  }],
  content: {
    type: String,
    required: true,
  },
  author: {
    type: String,
    default: 'Apply4Works',
  },
  publishedDate: {
    type: Date,
    default: Date.now,
  },
  categories: [{
    type: String,
  }],
  tags: [{
    type: String,
  }],
  readingTime: {
    type: String,
  },
  featuredImage: {
    type: String,
    default: '/og-image.jpg',
  },
  canonicalUrl: {
    type: String,
  }
}, { timestamps: true });

module.exports = mongoose.model('Blog', blogSchema);
