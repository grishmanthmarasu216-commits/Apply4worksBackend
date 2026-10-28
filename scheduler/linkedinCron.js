const cron = require('node-cron');
const LinkedInPost = require('../models/LinkedInPost');
const LinkedInAccount = require('../models/LinkedInAccount');
const linkedinService = require('../services/linkedinService');

exports.runLinkedinScheduler = () => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      
      const scheduledPosts = await LinkedInPost.find({
        status: 'scheduled',
        scheduledAt: { $lte: now }
      });

      if (scheduledPosts.length === 0) return;

      console.log(`[LinkedIn Scheduler] Found ${scheduledPosts.length} posts to publish.`);

      for (const post of scheduledPosts) {
        try {
          const account = await LinkedInAccount.findOne({ userId: post.userId });
          if (!account) {
            console.error(`[LinkedIn Scheduler] Account not found for post ${post._id}. Marking as failed.`);
            post.status = 'failed';
            await post.save();
            continue;
          }

          // Publish to LinkedIn
          await linkedinService.publishPost(account.accessToken, account.linkedinId, post.selectedContent, post.imageUrl);

          // Update DB
          post.status = 'published';
          post.publishedAt = new Date();
          // Reset analytics upon publishing
          post.analytics = { likes: 0, comments: 0, shares: 0, impressions: 0 };
          await post.save();

          console.log(`[LinkedIn Scheduler] Published post ${post._id} successfully.`);
        } catch (err) {
          console.error(`[LinkedIn Scheduler] Failed to publish post ${post._id}:`, err.message);
          post.status = 'failed';
          await post.save();
        }
      }
    } catch (err) {
      console.error('[LinkedIn Scheduler] Error processing scheduled posts:', err.message);
    }
  });
  console.log('[LinkedIn Scheduler] Initialized.');
};
