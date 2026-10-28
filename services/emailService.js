const { queueEmail } = require('./emailQueue');
const fs = require('fs');
const path = require('path');

const getBaseUrl = () => process.env.VITE_APP_URL || process.env.FRONTEND_URL || 'https://apply4works.com';

const renderTemplate = (templateName, variables) => {
  const filePath = path.join(__dirname, '..', 'templates', 'emails', `${templateName}.html`);
  let template = fs.readFileSync(filePath, 'utf-8');
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    template = template.replace(regex, value || '');
  }
  return template;
};

exports.sendWelcomeEmail = async (user) => {
  if (user.emailPreferences && !user.emailPreferences.transactionalEmails) return;
  const subject = `Welcome to Apply4Works 🚀`;
  const html = renderTemplate('welcomeEmail', {
    firstName: user.firstName || user.name || 'User',
    dashboardUrl: `${getBaseUrl()}/dashboard`,
    upgradeUrl: `${getBaseUrl()}/pricing`
  });
  return queueEmail({ userId: user._id, emailType: 'Welcome', to: user.email, subject, html });
};

exports.sendVerificationCodeEmail = async (user, code) => {
  const subject = `Your Verification Code`;
  const html = renderTemplate('otpEmail', {
    code
  });
  return queueEmail({ userId: user._id, emailType: 'Verification', to: user.email, subject, html });
};

exports.sendSubscriptionReminderEmail = async (user) => {
  if (user.emailPreferences && !user.emailPreferences.marketingEmails) return;
  const subject = `Unlock More Career Opportunities`;
  const html = renderTemplate('subscriptionReminder', {
    firstName: user.firstName || user.name || 'User',
    ctaUrl: `${getBaseUrl()}/pricing`
  });
  return queueEmail({ userId: user._id, emailType: 'SubscriptionReminder', to: user.email, subject, html });
};

exports.sendPaymentSuccessEmail = async (user, subscriptionDetails) => {
  if (user.emailPreferences && !user.emailPreferences.transactionalEmails) return;
  const subject = `Payment Successful ✅`;
  const { planName, amount, startDate, expiryDate, transactionId } = subscriptionDetails;
  const html = renderTemplate('paymentSuccess', {
    firstName: user.firstName || user.name || 'User',
    planName,
    amount,
    startDate: new Date(startDate).toLocaleDateString(),
    expiryDate: new Date(expiryDate).toLocaleDateString(),
    transactionId: transactionId || 'N/A',
    ctaUrl: `${getBaseUrl()}/dashboard`
  });
  return queueEmail({ userId: user._id, emailType: 'PaymentSuccess', to: user.email, subject, html });
};

exports.sendPlanExpiryReminderEmail = async (user, expiryDate) => {
  if (user.emailPreferences && !user.emailPreferences.subscriptionEmails) return;
  const subject = `Your Plan Expires Tomorrow`;
  const html = renderTemplate('expiryReminder', {
    firstName: user.firstName || user.name || 'User',
    planName: user.subscription?.planName || user.plan,
    expiryDate: new Date(expiryDate).toLocaleDateString(),
    ctaUrl: `${getBaseUrl()}/pricing`
  });
  return queueEmail({ userId: user._id, emailType: 'PlanExpiryReminder', to: user.email, subject, html });
};

exports.sendPlanExpiredEmail = async (user) => {
  if (user.emailPreferences && !user.emailPreferences.subscriptionEmails) return;
  const subject = `Your Subscription Has Expired`;
  const html = renderTemplate('expiredPlan', {
    firstName: user.firstName || user.name || 'User',
    ctaUrl: `${getBaseUrl()}/pricing`
  });
  return queueEmail({ userId: user._id, emailType: 'PlanExpired', to: user.email, subject, html });
};

exports.sendAutoRenewScheduledEmail = async (user, renewalDetails) => {
  if (user.emailPreferences && !user.emailPreferences.subscriptionEmails) return;
  const subject = `Upcoming Auto Renewal Notice`;
  const { planName, renewalDate, amount } = renewalDetails;
  const html = renderTemplate('autoRenewReminder', {
    firstName: user.firstName || user.name || 'User',
    planName,
    renewalDate: new Date(renewalDate).toLocaleDateString(),
    amount,
    ctaUrl: `${getBaseUrl()}/settings/billing`
  });
  return queueEmail({ userId: user._id, emailType: 'AutoRenewScheduled', to: user.email, subject, html });
};

exports.sendAutoRenewSuccessEmail = async (user, renewalDetails) => {
  if (user.emailPreferences && !user.emailPreferences.transactionalEmails) return;
  const subject = `Subscription Renewed Successfully 🎉`;
  const { planName, amount, expiryDate, transactionId } = renewalDetails;
  const html = renderTemplate('autoRenewSuccess', {
    firstName: user.firstName || user.name || 'User',
    planName,
    amount,
    expiryDate: new Date(expiryDate).toLocaleDateString(),
    transactionId: transactionId || 'N/A',
    ctaUrl: `${getBaseUrl()}/dashboard`
  });
  return queueEmail({ userId: user._id, emailType: 'AutoRenewSuccess', to: user.email, subject, html });
};

exports.sendAccountDeletionEmail = async (user) => {
  const subject = `Account Successfully Deleted`;
  const html = renderTemplate('accountDeleted', {
    firstName: user.firstName || user.name || 'User'
  });
  return queueEmail({ userId: user._id, emailType: 'AccountDeletion', to: user.email, subject, html });
};
