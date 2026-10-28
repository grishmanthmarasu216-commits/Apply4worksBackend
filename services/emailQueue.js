const resend = require('../config/resend');
const EmailLog = require('../models/EmailLog');
const User = require('../models/User');

const emailQueue = [];
let isProcessing = false;

// Process the queue asynchronously
const processQueue = async () => {
  if (isProcessing) return;
  isProcessing = true;

  while (emailQueue.length > 0) {
    const job = emailQueue.shift();
    const { logId, userId, emailType, to, subject, html } = job;

    try {
      let messageId = 'simulated_' + Date.now();
      
      if (resend) {
        const response = await resend.emails.send({
          from: process.env.EMAIL_FROM || 'Apply4Works Support <support@yourdomain.com>',
          to,
          subject,
          html
        });
        
        if (response.error) {
          throw new Error(response.error.message);
        }
        messageId = response.data.id;
      } else {
        console.log(`[EmailQueue] Simulated email sent to ${to} | Subject: ${subject}`);
      }

      // Update EmailLog
      await EmailLog.findByIdAndUpdate(logId, {
        status: 'sent',
        resendMessageId: messageId
      });

      // Update User history
      await User.findByIdAndUpdate(userId, {
        $push: {
          emailHistory: {
            emailType,
            sentAt: new Date(),
            status: 'sent',
            messageId
          }
        }
      });

    } catch (error) {
      console.error(`[EmailQueue] Error sending ${emailType} email to ${to}:`, error.message);
      
      // Mark as failed
      await EmailLog.findByIdAndUpdate(logId, {
        status: 'failed',
        error: error.message
      });

      await User.findByIdAndUpdate(userId, {
        $push: {
          emailHistory: {
            emailType,
            sentAt: new Date(),
            status: 'failed',
            messageId: null
          }
        }
      });
    }
  }

  isProcessing = false;
};

// Expose queuing function
exports.queueEmail = async ({ userId, emailType, to, subject, html }) => {
  try {
    // 1. Create DB record immediately
    const emailLog = await EmailLog.create({
      emailType,
      userId,
      status: 'pending'
    });

    // 2. Push to memory queue
    emailQueue.push({
      logId: emailLog._id,
      userId,
      emailType,
      to,
      subject,
      html
    });

    // 3. Trigger processing if not already running
    processQueue().catch(err => console.error('[EmailQueue] Queue processing error:', err));
    
    return true;
  } catch (error) {
    console.error(`[EmailQueue] Error queuing ${emailType} for ${userId}:`, error.message);
    return false;
  }
};
