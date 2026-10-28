const cron = require('node-cron');
const User = require('../models/User');
const EmailLog = require('../models/EmailLog');
const { 
  sendPlanExpiryReminderEmail, 
  sendPlanExpiredEmail, 
  sendAutoRenewScheduledEmail,
  sendSubscriptionReminderEmail
} = require('../services/emailService');

const runEmailScheduler = () => {
  // 1. Expiry Reminder Job (Runs Daily at 8:00 AM)
  cron.schedule('0 8 * * *', async () => {
    try {
      console.log('[Cron] Running Plan Expiry Reminder Job...');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const startOfDay = new Date(tomorrow.setHours(0,0,0,0));
      const endOfDay = new Date(tomorrow.setHours(23,59,59,999));

      const users = await User.find({
        'subscription.expiryDate': { $gte: startOfDay, $lte: endOfDay },
        'subscription.status': 'active',
        'subscription.autoRenew': false
      });

      for (const user of users) {
        // Prevent duplicate emails
        const alreadySent = await EmailLog.findOne({
          userId: user._id,
          emailType: 'PlanExpiryReminder',
          sentAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });

        if (!alreadySent) {
          await sendPlanExpiryReminderEmail(user, user.subscription.expiryDate);
        }
      }
    } catch (err) {
      console.error('[Cron Error] Expiry Reminder:', err);
    }
  });

  // 2. Plan Expired Job (Runs Hourly)
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('[Cron] Running Plan Expired Job...');
      const now = new Date();

      const users = await User.find({
        'subscription.expiryDate': { $lt: now },
        'subscription.status': 'active', // still marked active but past expiry
        'subscription.autoRenew': false
      });

      for (const user of users) {
        // Update user status
        await User.findByIdAndUpdate(user._id, {
          'subscription.status': 'expired',
          plan: 'Free'
        });

        const alreadySent = await EmailLog.findOne({
          userId: user._id,
          emailType: 'PlanExpired',
          sentAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });

        if (!alreadySent) {
          await sendPlanExpiredEmail(user);
        }
      }
    } catch (err) {
      console.error('[Cron Error] Plan Expired:', err);
    }
  });

  // 3. Auto Renew Reminder Job (Runs Daily at 9:00 AM)
  cron.schedule('0 9 * * *', async () => {
    try {
      console.log('[Cron] Running Auto Renew Reminder Job...');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const startOfDay = new Date(tomorrow.setHours(0,0,0,0));
      const endOfDay = new Date(tomorrow.setHours(23,59,59,999));

      const users = await User.find({
        'subscription.expiryDate': { $gte: startOfDay, $lte: endOfDay },
        'subscription.status': 'active',
        'subscription.autoRenew': true
      });

      for (const user of users) {
        const alreadySent = await EmailLog.findOne({
          userId: user._id,
          emailType: 'AutoRenewScheduled',
          sentAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });

        if (!alreadySent) {
          await sendAutoRenewScheduledEmail(user, {
            planName: user.subscription.planName || user.plan,
            renewalDate: user.subscription.expiryDate,
            amount: user.originalAmount || 0
          });
        }
      }
    } catch (err) {
      console.error('[Cron Error] Auto Renew Reminder:', err);
    }
  });

  // 4. Subscription Follow-up Job (Runs Daily at 10:00 AM)
  cron.schedule('0 10 * * *', async () => {
    try {
      console.log('[Cron] Running Subscription Follow-up Job...');
      const targetDays = [1, 3, 7];
      
      for (const days of targetDays) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - days);
        const startOfDay = new Date(targetDate.setHours(0,0,0,0));
        const endOfDay = new Date(targetDate.setHours(23,59,59,999));

        const users = await User.find({
          createdAt: { $gte: startOfDay, $lte: endOfDay },
          plan: 'Free'
        });

        for (const user of users) {
          const alreadySent = await EmailLog.findOne({
            userId: user._id,
            emailType: 'SubscriptionReminder',
            sentAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          });

          if (!alreadySent) {
            await sendSubscriptionReminderEmail(user);
          }
        }
      }
    } catch (err) {
      console.error('[Cron Error] Subscription Follow-up:', err);
    }
  });
};

module.exports = { runEmailScheduler };
