const LinkedInDraft = require('../models/LinkedInDraft');

exports.saveAutoDraft = async (userId, draft, style) => {
  return await LinkedInDraft.findOneAndUpdate(
    { userId },
    { draft, style },
    { upsert: true, new: true }
  );
};

exports.getAutoDraft = async (userId) => {
  return await LinkedInDraft.findOne({ userId });
};
