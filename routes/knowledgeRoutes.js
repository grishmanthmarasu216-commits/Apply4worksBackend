const express = require('express');
const router = express.Router();
const knowledgeController = require('../controllers/knowledgeController');
const { protect } = require('../middleware/authMiddleware');

// All knowledge hub endpoints require authentication
router.use(protect);

router.get('/latest', knowledgeController.getLatest);
router.get('/learning', knowledgeController.getLearningRoadmap);

router.post('/bookmark', knowledgeController.toggleBookmark);
router.get('/bookmarks', knowledgeController.getBookmarks);

router.get('/history', knowledgeController.getSearchHistory);
router.delete('/history', knowledgeController.clearSearchHistory);

module.exports = router;
