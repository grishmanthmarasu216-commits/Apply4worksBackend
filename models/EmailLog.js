const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
  emailType: {
    type: String,
    required: true,
    enum: [
      'Welcome',
      'Verification',
      'SubscriptionReminder',
      'PaymentSuccess',
      'PlanExpiryReminder',
      'PlanExpired',
      'AutoRenewScheduled',
      'AutoRenewSuccess',
      'AccountDeletion'
    ]
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sentAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  resendMessageId: {
    type: String,
    default: null
  },
  error: {
    type: String,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('EmailLog', emailLogSchema);
