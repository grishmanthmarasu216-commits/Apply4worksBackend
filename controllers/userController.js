const User = require('../models/User');
const Preference = require('../models/Preference');

// @desc    Save or update user preferences
// @route   POST /api/users/preferences
// @access  Private
const savePreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const { preferredCountry, ...prefsData } = req.body;

    let preference = await Preference.findOne({ userId });

    if (preference) {
      // Update existing
      preference = await Preference.findOneAndUpdate(
        { userId },
        { $set: prefsData },
        { new: true }
      );
    } else {
      // Create new
      preference = await Preference.create({
        userId,
        ...prefsData
      });
    }

    // Update user with preference ID and onboarding completed
    const userUpdate = { 
      preferences: preference._id,
      onboardingCompleted: true 
    };
    
    if (preferredCountry) {
      userUpdate.preferredCountry = preferredCountry;
    }

    await User.findByIdAndUpdate(userId, userUpdate);

    // Return the updated user object so frontend state stays in sync
    const updatedUser = await User.findById(userId).select('-password').populate('preferences');

    res.json({
      success: true,
      message: 'Preferences saved successfully',
      user: updatedUser,
      preferences: preference
    });

  } catch (error) {
    console.error('Save Preferences Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error saving preferences' });
  }
};

const completePricing = async (req, res) => {
  try {
    const userId = req.user.id;
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { pricingCompleted: true },
      { new: true }
    ).select('-password').populate('preferences');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Pricing completed successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Complete Pricing Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error completing pricing' });
  }
};

const Razorpay = require('razorpay');
const { sendAccountDeletionEmail } = require('../services/emailService');

// @desc    Delete user account
// @route   DELETE /api/users/
// @access  Private
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Cancel Razorpay Subscription if active
    if (user.subscription && user.subscription.razorpaySubscriptionId && user.subscription.status === 'active') {
      try {
        if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
          const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
          });
          await razorpay.subscriptions.cancel(user.subscription.razorpaySubscriptionId);
          console.log(`[Account Deletion] Cancelled Razorpay subscription ${user.subscription.razorpaySubscriptionId} for user ${userId}`);
        }
      } catch (rzpErr) {
        console.error('[Account Deletion] Failed to cancel Razorpay subscription:', rzpErr);
        // Continue with deletion even if Razorpay API fails (could already be cancelled)
      }
    }

    // Send deletion email BEFORE deleting the user record, because we need their email
    await sendAccountDeletionEmail(user).catch(err => console.error('[Account Deletion] Email Error:', err));

    // Delete user preferences and user
    if (user.preferences) {
      await Preference.findByIdAndDelete(user.preferences);
    }
    
    // We should also delete EmailLogs related to this user to avoid orphaned documents
    const EmailLog = require('../models/EmailLog');
    await EmailLog.deleteMany({ userId });

    await User.findByIdAndDelete(userId);

    console.log(`[Account Deletion] User ${userId} successfully deleted.`);
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete Account Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error during account deletion' });
  }
};

module.exports = {
  savePreferences,
  completePricing,
  deleteAccount
};
