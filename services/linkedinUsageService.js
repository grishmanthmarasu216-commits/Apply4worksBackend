const User = require('../models/User');

const MAX_PRO_GENERATIONS = 3;

/**
 * Ensures the usage count is reset if the month has rolled over.
 */
async function ensureMonthlyReset(user) {
  const now = new Date();
  const lastReset = user.linkedinGenerationsLastReset ? new Date(user.linkedinGenerationsLastReset) : new Date(user.createdAt || Date.now());
  
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    user.linkedinGenerationsUsed = 0;
    user.linkedinGenerationsLastReset = now;
    await user.save();
  }
}

/**
 * Gets current usage for the user.
 */
exports.getUsage = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  
  // Basic plan check
  if (user.planType !== 'PRO' && user.plan !== 'Pro' && user.plan !== 'Pro Plus') {
    return { 
      allowed: false, 
      used: 0, 
      limit: 0, 
      isPro: false,
      message: 'Upgrade to Pro to access LinkedIn Growth Studio.' 
    };
  }
  
  await ensureMonthlyReset(user);
  
  const used = user.linkedinGenerationsUsed || 0;
  const limit = MAX_PRO_GENERATIONS;
  
  return {
    allowed: used < limit,
    used,
    limit,
    isPro: true,
    message: used >= limit ? 'You have used all 3 LinkedIn post generations. Limit resets next month.' : ''
  };
};

/**
 * Increments usage if allowed. Throws error if limit reached.
 */
exports.incrementUsage = async (userId) => {
  const usage = await exports.getUsage(userId);
  
  if (!usage.allowed) {
    throw new Error(usage.message || 'LinkedIn generation limit reached.');
  }
  
  await User.findByIdAndUpdate(userId, {
    $inc: { linkedinGenerationsUsed: 1 }
  });
  
  return { success: true };
};
