const Blog = require('../models/Blog');

// Get all blogs with pagination, filtering, and search
exports.getBlogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};

    // Search by title or content
    if (req.query.search) {
      query.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { content: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Filter by category
    if (req.query.category) {
      query.categories = { $regex: req.query.category, $options: 'i' };
    }

    // Filter by tag
    if (req.query.tag) {
      query.tags = { $regex: req.query.tag, $options: 'i' };
    }

    const totalBlogs = await Blog.countDocuments(query);
    const blogs = await Blog.find(query)
      .select('-content') // Exclude content for listing to save bandwidth
      .sort({ publishedDate: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: blogs,
      pagination: {
        total: totalBlogs,
        page,
        pages: Math.ceil(totalBlogs / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get a single blog by slug
exports.getBlogBySlug = async (req, res) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug });
    
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }

    // Optional: Fetch related posts (same category or tags)
    const relatedPosts = await Blog.find({
      _id: { $ne: blog._id },
      $or: [
        { categories: { $in: blog.categories } },
        { tags: { $in: blog.tags } }
      ]
    })
    .select('title slug featuredImage readingTime publishedDate')
    .limit(3);

    res.status(200).json({
      success: true,
      data: {
        ...blog._doc,
        relatedPosts
      },
    });
  } catch (error) {
    console.error('Error fetching blog:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get recent or featured blogs
exports.getFeaturedBlogs = async (req, res) => {
  try {
    const featured = await Blog.find({})
      .select('-content')
      .sort({ publishedDate: -1 }) // We'll just return the newest as "featured" for now
      .limit(3);
      
    const recent = await Blog.find({})
      .select('title slug featuredImage readingTime publishedDate')
      .sort({ publishedDate: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        featured,
        recent
      }
    });
  } catch (error) {
    console.error('Error fetching featured blogs:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
