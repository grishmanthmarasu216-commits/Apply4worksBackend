const mongoose = require('mongoose');

const likedJobSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  likedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

likedJobSchema.index({ userId: 1, jobId: 1 }, { unique: true });

module.exports = mongoose.model('LikedJob', likedJobSchema);
