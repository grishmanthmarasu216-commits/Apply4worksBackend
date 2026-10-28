const Razorpay = require('razorpay');
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'dummy_id',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret'
});
const crypto = require('crypto');
const User = require('../models/User');
const Subscription = require('../models/Subscription');

const planAmounts = {
  'Basic': 999, // 999 cents = $9.99
  'Pro': 2499, // 2499 cents = $24.99
  'Pro Plus': 3900 // 3900 cents = $39.00
};

const validCoupons = {
  'FREE100': 100,
  'HALF50': 50,
  'SAVE25': 25
};

exports.validateCoupon = async (req, res) => {
  const { coupon } = req.body;
  const upperCoupon = coupon ? coupon.toUpperCase() : '';
  if (!upperCoupon || !validCoupons[upperCoupon]) {
    return res.status(400).json({ success: false, message: 'Invalid Coupon Code' });
  }
  return res.json({ 
    success: true, 
    discount: validCoupons[upperCoupon], 
    message: `Coupon Applied Successfully — ${validCoupons[upperCoupon]}% Discount` 
  });
};

exports.createOrder = async (req, res) => {
  console.log('[Payment] Request received for createOrder:', req.body);
  try {
    if (!req.user || !req.user.id) {
      console.warn('[Payment] Unauthenticated or missing user id.');
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { plan, coupon } = req.body;
    const userId = req.user.id;

    if (!plan || !planAmounts[plan]) {
      console.warn(`[Payment] Invalid plan selected: ${plan}`);
      return res.status(400).json({ success: false, message: 'Invalid plan selected' });
    }

    const originalAmount = planAmounts[plan];
    let finalAmount = originalAmount;
    let discountPercentage = 0;
    let discountAmount = 0;
    const upperCoupon = coupon ? coupon.toUpperCase() : null;
    
    if (upperCoupon) {
      if (validCoupons[upperCoupon]) {
        discountPercentage = validCoupons[upperCoupon];
        discountAmount = originalAmount * (discountPercentage / 100);
        finalAmount = Math.round(originalAmount - discountAmount);
      } else {
        console.warn(`[Payment] Invalid coupon provided: ${upperCoupon}`);
        return res.status(400).json({ success: false, message: 'Invalid Coupon Code' });
      }
    }

    if (finalAmount === 0) {
      console.log(`[Payment] Activating 100% free plan for user ${userId}`);
      const now = new Date();
      const subEnd = new Date(now.getTime());
      subEnd.setMonth(subEnd.getMonth() + 1);

      try {
        await User.findByIdAndUpdate(userId, {
          plan,
          planType: (plan === 'Pro' || plan === 'Pro Plus') ? 'PRO' : 'BASIC',
          paymentStatus: 'Completed',
          paymentProvider: 'Coupon',
          pricingCompleted: true,
          subscriptionStart: now,
          subscriptionEnd: subEnd,
          appliedCoupon: upperCoupon,
          originalAmount: originalAmount / 100,
          discountPercentage,
          discountAmount: discountAmount / 100,
          finalAmountPaid: 0,
          currency: 'USD'
        });

        await Subscription.create({
          userId,
          activePlan: plan,
          paymentStatus: 'paid',
          paymentProvider: 'Coupon',
          subscriptionStatus: 'active',
          purchasedAt: now,
          expiryDate: subEnd,
          currency: 'USD',
          finalAmountPaid: 0,
          appliedCoupon: upperCoupon
        });
      } catch (dbError) {
        console.error('[Payment] Database error during free plan activation:', dbError);
        return res.status(500).json({ success: false, message: 'Database error while saving subscription' });
      }
      const { sendPaymentSuccessEmail } = require('../services/emailService');
      const user = await User.findById(userId);
      sendPaymentSuccessEmail(user, {
        planName: plan,
        amount: 0,
        startDate: now,
        expiryDate: subEnd,
        transactionId: upperCoupon
      }).catch(err => console.error('[Payment] Email Error:', err));

      return res.json({
        success: true,
        bypassed: true,
        originalAmount: originalAmount / 100,
        discountAmount: discountAmount / 100,
        finalAmount: 0,
        appliedCoupon: upperCoupon,
        currency: 'USD',
        message: 'Plan activated successfully via 100% free coupon.'
      });
    }

    // -----------------------------------------
    // RAZORPAY CHECKOUT
    // -----------------------------------------
    const options = {
      amount: finalAmount, // Razorpay expects smallest currency unit
      currency: "USD",
      receipt: `rcpt_${userId.toString().substring(18, 24)}_${Date.now()}`
    };
    
    console.log('[Payment] Initializing Razorpay order with options:', options);
    let order;
    try {
      order = await razorpay.orders.create(options);
      console.log('[Payment] Razorpay order created successfully:', order.id);
    } catch (rzpError) {
      console.error('[Payment] Razorpay API Error:', JSON.stringify(rzpError, null, 2));
      return res.status(500).json({ 
        success: false, 
        message: 'Payment gateway error', 
        error: rzpError.description || rzpError.message || 'Unknown Razorpay error' 
      });
    }

    try {
      await User.findByIdAndUpdate(userId, {
        plan,
        planType: (plan === 'Pro' || plan === 'Pro Plus') ? 'PRO' : 'BASIC',
        paymentStatus: 'Pending',
        paymentProvider: 'Razorpay',
        appliedCoupon: upperCoupon,
        originalAmount: originalAmount / 100,
        discountPercentage,
        discountAmount: discountAmount / 100,
        finalAmountPaid: finalAmount / 100,
        currency: 'USD'
      });
    } catch (dbError) {
      console.error('[Payment] Database error updating user with pending payment:', dbError);
      return res.status(500).json({ success: false, message: 'Database error saving order state' });
    }

    return res.json({
      success: true,
      provider: 'razorpay',
      orderId: order.id,
      amount: finalAmount,
      currency: 'USD'
    });
  } catch (error) {
    console.error('[Payment] Unhandled Exception in createOrder:', error);
    res.status(500).json({ success: false, message: 'Server error creating order', error: error.message });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, upperCoupon, originalAmount, discountPercentage, discountAmount, finalAmount } = req.body;
    const userId = req.user.id;

    const generated_signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'dummy_secret')
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.paymentStatus !== 'Completed') {
      user.paymentStatus = 'Completed';
      user.pricingCompleted = true;
      user.paymentProvider = 'Razorpay';
      user.plan = plan || user.plan || 'Pro';
      user.planType = (user.plan === 'Pro' || user.plan === 'Pro Plus') ? 'PRO' : 'BASIC';
      
      const now = new Date();
      user.subscriptionStart = now;
      const subEnd = new Date(now.getTime());
      subEnd.setMonth(subEnd.getMonth() + 1);
      user.subscriptionEnd = subEnd;
      
      await user.save();

      await Subscription.create({
        userId: user._id,
        activePlan: plan || user.plan,
        paymentStatus: 'paid',
        paymentProvider: 'Razorpay',
        subscriptionStatus: 'active',
        purchasedAt: now,
        expiryDate: subEnd,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        currency: 'USD',
        finalAmountPaid: finalAmount !== undefined ? finalAmount : user.finalAmountPaid,
        appliedCoupon: upperCoupon || user.appliedCoupon
      });
      const { sendPaymentSuccessEmail } = require('../services/emailService');
      sendPaymentSuccessEmail(user, {
        planName: plan || user.plan,
        amount: finalAmount !== undefined ? finalAmount : user.finalAmountPaid,
        startDate: now,
        expiryDate: subEnd,
        transactionId: razorpay_payment_id
      }).catch(err => console.error('[Payment] Email Error:', err));

      console.log(`Razorpay Payment: User ${user.email} plan activated successfully.`);
    }

    return res.json({ success: true, message: 'Payment verified successfully' });
  } catch (err) {
    console.error('Error in verifyPayment:', err);
    res.status(500).json({ success: false, message: 'Server error verifying payment' });
  }
};
