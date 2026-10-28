const LinkedInAccount = require('../models/LinkedInAccount');
const LinkedInPost = require('../models/LinkedInPost');
const linkedinService = require('../services/linkedinService');
const linkedinAiService = require('../services/linkedin-ai.service');
const linkedinDraftService = require('../services/linkedinDraftService');

// Get Connection URL
exports.getConnectUrl = (req, res) => {
  try {
    const url = linkedinService.getAuthUrl(req.user._id.toString());
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate LinkedIn connect URL' });
  }
};

// Handle OAuth Callback
exports.handleCallback = async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const userId = state; // We pass userId in the state parameter

  if (error) {
    return res.status(400).json({ error: error_description || 'LinkedIn authorization failed' });
  }

  if (!code) {
    return res.status(400).json({ error: 'No authorization code provided' });
  }

  try {
    const tokenData = await linkedinService.exchangeCodeForToken(code);
    const profileData = await linkedinService.getUserProfile(tokenData.access_token);
    const linkedinId = profileData.sub; // This is the URN ID needed for posting

    // Upsert the LinkedIn Account
    await LinkedInAccount.findOneAndUpdate(
      { userId },
      {
        linkedinId,
        accessToken: tokenData.access_token,
        expiresIn: tokenData.expires_in,
        tokenCreatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    // Redirect to frontend or return success
    // Using a json response for flexibility, but often a redirect to the frontend app is better
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/linkedin-growth?connected=true`);
  } catch (err) {
    console.error('LinkedIn Callback Error:', err);
    res.status(500).json({ error: 'Failed to complete LinkedIn connection' });
  }
};

// Check Connection Status
exports.getConnectionStatus = async (req, res) => {
  try {
    const account = await LinkedInAccount.findOne({ userId: req.user._id });
    if (!account) {
      return res.json({ connected: false });
    }
    
    // Check if token is expired (assuming LinkedIn token is usually valid for 60 days)
    const tokenAgeSecs = (new Date() - account.tokenCreatedAt) / 1000;
    const isExpired = tokenAgeSecs >= account.expiresIn;
    
    res.json({ connected: !isExpired });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check connection status' });
  }
};

// Generate AI Posts (Grok)
exports.generatePosts = async (req, res) => {
  const { topic, style, category, attachedLink } = req.body;
  const userId = req.user._id;

  console.log("LinkedIn generation request received");
  console.log("Topic sent to Groq:", topic);

  if (!topic) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  try {
    // 2. Generate with Grok (with advanced context)
    const options = {
      topic,
      style,
      category,
      resumeContext: req.body.resumeContext,
      urlContext: req.body.urlContext,
      userFocus: req.body.userFocus,
      attachedLink
    };
    
    let variations;
    let retries = 3;
    let generationSuccess = false;
    
    while (retries > 0) {
      try {
        variations = await linkedinAiService.generateFromTopic(options);
        console.log("Groq response successfully parsed:", variations);
        generationSuccess = true;
        break;
      } catch (err) {
        retries--;
        console.warn(`[LinkedInAI] Grok generation failed. Retrying... (${retries} attempts left)`);
        console.error("Groq Error:", err.message);
      }
    }

    if (!generationSuccess) {
      throw new Error('AI content generation failed. Please try again.');
    }

    // 4. Save as draft
    const post = await LinkedInPost.create({
      userId,
      topic,
      generatedVariations: variations,
      status: 'draft'
    });
    
    console.log('[LinkedInAI] Draft saved successfully');

    res.json({ postId: post._id, variations });
  } catch (err) {
    console.error('LinkedIn Generate Error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate posts' });
  }
};

// Generate AI Posts directly from Resume
exports.generateFromResume = async (req, res) => {
  const userId = req.user._id;

  try {
    // 2. Generate Posts from Resume Data
    const posts = await linkedinAiService.generateFromResume(userId);

    res.json({ success: true, posts });
  } catch (err) {
    console.error('LinkedIn Resume Generate Error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate posts from resume' });
  }
};

// Usage status
exports.getUsageStatus = async (req, res) => {
  // Always return allowed since usage limits have been removed.
  res.json({ allowed: true, limit: 9999, used: 0 });
};

// Auto Drafts
exports.saveAutoDraft = async (req, res) => {
  const { draft, style } = req.body;
  try {
    const saved = await linkedinDraftService.saveAutoDraft(req.user._id, draft, style);
    res.json({ success: true, draft: saved });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save auto draft' });
  }
};

exports.getAutoDraft = async (req, res) => {
  try {
    const draft = await linkedinDraftService.getAutoDraft(req.user._id);
    res.json({ draft });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get auto draft' });
  }
};

// Upload Image
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // Return relative path from backend root, or just filename
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, imageUrl });
  } catch (err) {
    console.error('Upload Error:', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
};

// Publish Post to LinkedIn
exports.publishPost = async (req, res) => {
  const { postId, content, imageUrl, attachedLink } = req.body;
  const userId = req.user._id;

  if (!postId || !content) {
    return res.status(400).json({ error: 'Post ID and content are required' });
  }

  try {
    const account = await LinkedInAccount.findOne({ userId });
    if (!account) {
      return res.status(403).json({ error: 'LinkedIn account not connected' });
    }

    const postRecord = await LinkedInPost.findOne({ _id: postId, userId });
    if (!postRecord) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Call LinkedIn API
    await linkedinService.publishPost(account.accessToken, account.linkedinId, content, imageUrl);

    // Update Post status
    postRecord.status = 'published';
    postRecord.selectedContent = content;
    postRecord.publishedAt = new Date();
    if (imageUrl) postRecord.imageUrl = imageUrl;
    if (attachedLink) postRecord.attachedLink = attachedLink;
    await postRecord.save();

    res.json({ success: true, message: 'Published successfully to LinkedIn' });
  } catch (err) {
    console.error('LinkedIn Publish Error:', err);
    res.status(500).json({ error: 'Failed to publish post to LinkedIn' });
  }
};

// Get Recent Drafts
exports.getDrafts = async (req, res) => {
  try {
    const drafts = await LinkedInPost.find({
      userId: req.user._id,
      status: { $in: ['draft', 'scheduled'] }
    }).sort({ createdAt: -1 }).limit(10);
    res.json(drafts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
};

// Update Draft (Save Edits)
exports.updateDraft = async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  
  if (!content) return res.status(400).json({ error: 'Content is required' });

  try {
    const post = await LinkedInPost.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      { selectedContent: content },
      { new: true }
    );
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ success: true, post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update draft' });
  }
};

// Schedule Post
exports.schedulePost = async (req, res) => {
  const { postId, content, scheduledAt, imageUrl, attachedLink } = req.body;
  const userId = req.user._id;

  if (!postId || !content || !scheduledAt) {
    return res.status(400).json({ error: 'Post ID, content, and scheduled time are required' });
  }

  try {
    const account = await LinkedInAccount.findOne({ userId });
    if (!account) {
      return res.status(403).json({ error: 'LinkedIn account not connected' });
    }

    const postRecord = await LinkedInPost.findOne({ _id: postId, userId });
    if (!postRecord) {
      return res.status(404).json({ error: 'Post not found' });
    }

    postRecord.status = 'scheduled';
    postRecord.selectedContent = content;
    postRecord.scheduledAt = new Date(scheduledAt);
    if (imageUrl) postRecord.imageUrl = imageUrl;
    if (attachedLink) postRecord.attachedLink = attachedLink;
    await postRecord.save();

    res.json({ success: true, message: 'Post scheduled successfully' });
  } catch (err) {
    console.error('LinkedIn Schedule Error:', err);
    res.status(500).json({ error: 'Failed to schedule post' });
  }
};
