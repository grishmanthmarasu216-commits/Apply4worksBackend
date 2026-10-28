const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    trim: true
  },
  firstName: {
    type: String,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
  },
  provider: {
    type: String,
    default: 'local'
  },
  googleId: {
    type: String,
    default: null
  },
  avatar: {
    type: String,
    default: null
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  preferences: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Preference'
  },
  resume: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resume',
    default: null
  },
  pricingCompleted: {
    type: Boolean,
    default: false
  },
  onboardingCompleted: {
    type: Boolean,
    default: false
  },
  plan: {
    type: String,
    enum: ['Free', 'Basic', 'Pro', 'Pro Plus'],
    default: 'Free'
  },
  linkedinGenerationsUsed: {
    type: Number,
    default: 0
  },
  linkedinGenerationsLastReset: {
    type: Date,
    default: Date.now
  },
  planType: {
    type: String,
    enum: ['BASIC', 'PRO'],
    default: 'BASIC'
  },
  preferredCountry: {
    type: String,
    default: ''
  },
  autoApplyEnabled: {
    type: Boolean,
    default: false
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed'],
    default: 'Pending'
  },
  razorpayOrderId: {
    type: String,
    default: null
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  subscriptionStart: {
    type: Date,
    default: null
  },
  subscriptionEnd: {
    type: Date,
    default: null
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
  },
  originalAmount: {
    type: Number,
    default: null
  },
  discountPercentage: {
    type: Number,
    default: null
  },
  discountAmount: {
    type: Number,
    default: null
  },
  finalAmountPaid: {
    type: Number,
    default: null
  },
  currency: {
    type: String,
    default: 'USD'
  },
  emailPreferences: {
    marketingEmails: { type: Boolean, default: true },
    subscriptionEmails: { type: Boolean, default: true },
    transactionalEmails: { type: Boolean, default: true }
  },
  subscription: {
    planName: { type: String, default: 'Free' },
    amount: { type: Number, default: 0 },
    status: { type: String, default: 'inactive' },
    startDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    autoRenew: { type: Boolean, default: false },
    lastRenewedAt: { type: Date, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpayOrderId: { type: String, default: null },
    razorpaySubscriptionId: { type: String, default: null }
  },
  emailHistory: [
    {
      emailType: String,
      sentAt: { type: Date, default: Date.now },
      status: String,
      messageId: String
    }
  ],
  verification: {
    code: { type: String, default: null },
    expiresAt: { type: Date, default: null },
    verified: { type: Boolean, default: false }
  }
}, { timestamps: true });

userSchema.pre('save', function(next) {
  if (this.firstName && this.lastName && !this.name) {
    this.name = `${this.firstName} ${this.lastName}`;
  } else if (this.name && (!this.firstName || !this.lastName)) {
    const parts = this.name.split(' ');
    this.firstName = parts[0] || '';
    this.lastName = parts.slice(1).join(' ') || '';
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
