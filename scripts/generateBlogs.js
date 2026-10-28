require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { GoogleGenAI, Type } = require('@google/genai');
const pdfParse = require('pdf-parse');
const Blog = require('../models/Blog');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Connect to DB
const connectDB = require('../config/db');

// Helper to update sitemap
const updateSitemap = (slug) => {
  const sitemapPath = path.join(__dirname, '../../app/public/sitemap.xml');
  try {
    if (fs.existsSync(sitemapPath)) {
      let sitemap = fs.readFileSync(sitemapPath, 'utf8');
      const newUrl = `
  <url>
    <loc>https://apply4works.com/blog/${slug}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;
      // Replace closing tag with new url + closing tag
      sitemap = sitemap.replace('</urlset>', newUrl);
      fs.writeFileSync(sitemapPath, sitemap);
      console.log(`✅ Added /blog/${slug} to sitemap.xml`);
    } else {
      console.log('⚠️ sitemap.xml not found. Skipping sitemap update.');
    }
  } catch (err) {
    console.error('Error updating sitemap:', err);
  }
};

// Helper to generate a blog
const generateBlogForTopic = async (topic) => {
  console.log(`\n======================================`);
  console.log(`Generating blog for topic: "${topic}"`);
  
  const prompt = `
  Write a comprehensive, SEO-optimized blog post about the topic: "${topic}".
  The blog MUST meet these exact requirements:
  - 1800-3000 words in length.
  - Human-like, helpful, authoritative, and engaging writing (no keyword stuffing).
  - Proper Markdown format with H1 title, Introduction, Table of Contents, multiple H2 sections, H3 subsections, bullet points, numbered lists, examples, and FAQs.
  - Include a Conclusion and a Call To Action (CTA) linking to internal features like Resume Builder, Resume Optimizer, AI Resume Review, Interview Preparation, Job Tracking, Learning Hub.
  - Use Markdown for internal links where relevant: e.g. [Resume Builder](/resume-builder), [Interview Prep](/interview-prep), [Learning Hub](/learning-hub).
  
  Please output a strict JSON object with NO markdown wrapping (no \`\`\`json) with the following structure:
  {
    "title": "SEO Friendly H1 Title",
    "slug": "seo-friendly-url-slug",
    "metaTitle": "SEO Meta Title (under 60 chars)",
    "metaDescription": "SEO Meta Description (under 160 chars)",
    "focusKeyword": "main keyword",
    "relatedKeywords": ["keyword1", "keyword2", "keyword3"],
    "categories": ["Category 1"],
    "tags": ["tag1", "tag2"],
    "readingTime": "10 min read",
    "content": "The full markdown content here..."
  }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const jsonText = response.text;
    const blogData = JSON.parse(jsonText);
    
    // Check if slug already exists
    const existingBlog = await Blog.findOne({ slug: blogData.slug });
    if (existingBlog) {
      console.log(`⚠️ Blog with slug "${blogData.slug}" already exists. Skipping.`);
      return;
    }

    const newBlog = new Blog({
      ...blogData,
      canonicalUrl: `https://apply4works.com/blog/${blogData.slug}`,
      author: 'Apply4Works',
    });

    await newBlog.save();
    console.log(`✅ Saved blog: ${blogData.title}`);
    updateSitemap(blogData.slug);

  } catch (error) {
    console.error(`❌ Error generating blog for "${topic}":`, error.message);
  }
};

const run = async () => {
  await connectDB();
  
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Please provide a path to a PDF or TXT file. Usage: node generateBlogs.js <path-to-file>');
    process.exit(1);
  }

  const ext = path.extname(filePath).toLowerCase();
  let textContent = '';

  if (ext === '.pdf') {
    console.log(`Reading PDF: ${filePath}`);
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    textContent = pdfData.text;
  } else if (ext === '.txt') {
    console.log(`Reading TXT: ${filePath}`);
    textContent = fs.readFileSync(filePath, 'utf8');
  } else {
    console.error('Unsupported file format. Please provide a .pdf or .txt file.');
    process.exit(1);
  }

  // Simple extraction: split by newlines, filter empty and short strings
  const topics = textContent.split('\n')
    .map(t => t.trim())
    .filter(t => t.length > 10 && t.length < 150); // Assuming topics are single line sentences

  console.log(`Found ${topics.length} potential topics.`);
  
  for (let i = 0; i < topics.length; i++) {
    await generateBlogForTopic(topics[i]);
    // Sleep to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log('Done generating blogs.');
  process.exit(0);
};

run();
