const mongoose = require('mongoose');

const linkedInPostSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  topic: {
    type: String,
    required: true
  },
  sourceType: {
    type: String,
    enum: ['TOPIC', 'PROJECT', 'CERTIFICATION', 'ACHIEVEMENT', 'EXPERIENCE', 'SKILL', 'GENERAL'],
    default: 'TOPIC'
  },
  sourceId: {
    type: String // Optional reference ID from the resume
  },
  generatedVariations: [{
    type: { type: String }, // e.g. 'Professional', 'Storytelling'
    text: String
  }],
  selectedContent: {
    type: String
  },
  imageUrl: {
    type: String
  },
  attachedLink: {
    type: String
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'failed', 'scheduled'],
    default: 'draft'
  },
  publishedAt: {
    type: Date
  },
  scheduledAt: {
    type: Date
  },
  analytics: {
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 }
  }
}, { timestamps: true });

linkedInPostSchema.index({ userId: 1 });
linkedInPostSchema.index({ status: 1, scheduledAt: 1 });

module.exports = mongoose.model('LinkedInPost', linkedInPostSchema);
