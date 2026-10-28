const knowledgeService = require('../services/knowledgeService');
const Preference = require('../models/Preference');
const Bookmark = require('../models/Bookmark');
const SearchHistory = require('../models/SearchHistory');

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

const getCacheKey = (type, role) => `${type}_${role.toLowerCase().replace(/\s+/g, '_')}`;

const getUserRole = async (userId) => {
  try {
    const pref = await Preference.findOne({ userId });
    if (pref && pref.roles && pref.roles.length > 0) {
      return pref.roles.join(' and '); // Mix of selected roles
    }
    return 'Software Engineer'; // Default fallback
  } catch (err) {
    console.error('Error fetching user role:', err);
    return 'Software Engineer';
  }
};

exports.getLatest = async (req, res) => {
  try {
    const role = await getUserRole(req.user.id);
    const cacheKey = getCacheKey('latest', role);
    
    if (cache.has(cacheKey)) {
      const cachedData = cache.get(cacheKey);
      if (Date.now() - cachedData.timestamp < CACHE_TTL) {
        return res.json({ success: true, data: cachedData.data, role });
      }
    }

    const data = await knowledgeService.fetchLatestContent(role);
    cache.set(cacheKey, { data, timestamp: Date.now() });

    res.json({ success: true, data, role });
  } catch (error) {
    console.error('getLatest error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch latest content' });
  }
};

exports.getLearningRoadmap = async (req, res) => {
  try {
    const role = await getUserRole(req.user.id);
    const cacheKey = getCacheKey('roadmap', role);

    if (cache.has(cacheKey)) {
      const cachedData = cache.get(cacheKey);
      if (Date.now() - cachedData.timestamp < CACHE_TTL * 24) { // Roadmap changes less frequently
        return res.json({ success: true, data: cachedData.data, role });
      }
    }

    const data = await knowledgeService.generateLearningRoadmap(role);
    cache.set(cacheKey, { data, timestamp: Date.now() });

    res.json({ success: true, data, role });
  } catch (error) {
    console.error('getLearningRoadmap error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to generate learning roadmap' });
  }
};



// Bookmarks
exports.toggleBookmark = async (req, res) => {
  try {
    const { title, url, summary, source, publishedDate, type } = req.body;
    
    const existing = await Bookmark.findOne({ userId: req.user.id, url });
    if (existing) {
      await Bookmark.deleteOne({ _id: existing._id });
      return res.json({ success: true, action: 'removed' });
    }

    const newBookmark = await Bookmark.create({
      userId: req.user.id,
      title,
      url,
      summary,
      source,
      publishedDate,
      type
    });

    res.json({ success: true, action: 'added', data: newBookmark });
  } catch (error) {
    console.error('toggleBookmark error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle bookmark' });
  }
};

exports.getBookmarks = async (req, res) => {
  try {
    const bookmarks = await Bookmark.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, data: bookmarks });
  } catch (error) {
    console.error('getBookmarks error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch bookmarks' });
  }
};

// History
exports.getSearchHistory = async (req, res) => {
  try {
    const history = await SearchHistory.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('getSearchHistory error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch search history' });
  }
};

exports.clearSearchHistory = async (req, res) => {
  try {
    await SearchHistory.deleteMany({ userId: req.user.id });
    res.json({ success: true, message: 'Search history cleared' });
  } catch (error) {
    console.error('clearSearchHistory error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear search history' });
  }
};
