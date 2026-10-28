const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const { 
  sendAutoRenewSuccessEmail, 
  sendPaymentSuccessEmail 
} = require('../services/emailService');

exports.razorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('[Webhook] RAZORPAY_WEBHOOK_SECRET not configured. Ignoring webhook.');
      return res.status(200).send('Webhook secret not configured');
    }

    const signature = req.headers['x-razorpay-signature'];
    
    // Validate signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (expectedSignature !== signature) {
      console.error('[Webhook] Invalid signature');
      return res.status(400).send('Invalid signature');
    }

    const event = req.body.event;
    const payload = req.body.payload;

    console.log(`[Webhook] Received Razorpay Event: ${event}`);

    switch (event) {
      case 'subscription.activated':
      case 'subscription.charged': {
        const subscription = payload.subscription.entity;
        const payment = payload.payment?.entity;
        
        // Find user by their subscription ID
        // Note: During initial checkout, you'd need to store subscription.id in User model
        const user = await User.findOne({ 'subscription.razorpaySubscriptionId': subscription.id });
        
        if (user) {
          // If this is a renewal charge
          if (event === 'subscription.charged') {
            const now = new Date();
            const nextBilling = new Date(subscription.charge_at * 1000);
            
            user.subscription.status = 'active';
            user.subscription.lastRenewedAt = now;
            user.subscription.expiryDate = nextBilling;
            await user.save();

            sendAutoRenewSuccessEmail(user, {
              planName: user.subscription.planName,
              amount: payment ? (payment.amount / 100) : user.subscription.amount,
              expiryDate: nextBilling,
              transactionId: payment ? payment.id : null
            }).catch(err => console.error(err));
          }
        }
        break;
      }
      case 'subscription.cancelled':
      case 'subscription.completed':
      case 'subscription.paused': {
        const subscription = payload.subscription.entity;
        const user = await User.findOne({ 'subscription.razorpaySubscriptionId': subscription.id });
        if (user) {
          user.subscription.status = event === 'subscription.paused' ? 'paused' : 'cancelled';
          user.subscription.autoRenew = false;
          await user.save();
        }
        break;
      }
      default:
        console.log(`[Webhook] Unhandled event: ${event}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Webhook] Error handling webhook:', error);
    res.status(500).send('Server Error');
  }
};
