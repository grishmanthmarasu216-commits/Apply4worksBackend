const express = require('express');
const router = express.Router();
const { getBlogs, getBlogBySlug, getFeaturedBlogs } = require('../controllers/blogController');

// GET /api/blogs/featured
router.get('/featured', getFeaturedBlogs);

// GET /api/blogs
router.get('/', getBlogs);

// GET /api/blogs/:slug
router.get('/:slug', getBlogBySlug);

module.exports = router;
