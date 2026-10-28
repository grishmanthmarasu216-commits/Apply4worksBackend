const mongoose = require('mongoose');

const linkedInDraftSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // One auto-save draft per user
  },
  draft: {
    type: String,
    default: ''
  },
  style: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('LinkedInDraft', linkedInDraftSchema);
