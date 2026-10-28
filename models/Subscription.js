const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  activePlan: {
    type: String,
    enum: ['Basic', 'Pro', 'Pro Plus'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'expired', 'cancelled'],
    default: 'active'
  },
  purchasedAt: {
    type: Date,
    default: Date.now
  },
  expiryDate: {
    type: Date,
    default: null
  },
  paymentId: {
    type: String,
    default: null
  },
  orderId: {
    type: String,
    default: null
  },
  currency: {
    type: String,
    default: 'USD'
  },
  finalAmountPaid: {
    type: Number,
    default: 0
  },
  appliedCoupon: {
    type: String,
    default: null
  },
  paymentProvider: {
    type: String,
    enum: ['Razorpay', 'Stripe', 'Coupon'],
    default: 'Razorpay'
  },
  stripeSessionId: {
    type: String,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
