require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const FRONTEND_DATA_DIR = path.join(__dirname, '../../app/src/data/seo');

const BLOG_TOPICS = [
  // ATS Cluster
  { slug: 'ats-resume-mistakes-to-avoid', title: 'ATS Resume Mistakes To Avoid', category: 'ATS' },
  { slug: 'ats-resume-formatting-guide', title: 'ATS Resume Formatting Guide', category: 'ATS' },
  { slug: 'best-ats-resume-templates', title: 'Best ATS Resume Templates', category: 'ATS' },
  { slug: 'ats-keywords-explained', title: 'ATS Keywords Explained', category: 'ATS' },
  { slug: 'why-ats-rejects-resumes', title: 'Why ATS Rejects Resumes', category: 'ATS' },
  // Resume Tailoring Cluster
  { slug: 'how-to-match-resume-to-job-description', title: 'How To Match Your Resume To Any Job Description', category: 'Resume Tailoring' },
  { slug: 'resume-tailoring-checklist', title: 'Resume Tailoring Checklist', category: 'Resume Tailoring' },
  { slug: 'resume-customization-examples', title: 'Resume Customization Examples', category: 'Resume Tailoring' },
  { slug: 'resume-keywords-by-industry', title: 'Resume Keywords By Industry', category: 'Resume Tailoring' },
  { slug: 'resume-tailoring-career-switchers', title: 'Resume Tailoring For Career Switchers', category: 'Resume Tailoring' },
  // Job Search Cluster
  { slug: 'best-job-search-strategies-2026', title: 'Best Job Search Strategies In 2026', category: 'Job Search' },
  { slug: 'how-to-apply-for-jobs-faster', title: 'How To Apply For Jobs Faster', category: 'Job Search' },
  { slug: 'how-many-jobs-should-you-apply-to-daily', title: 'How Many Jobs Should You Apply To Daily', category: 'Job Search' },
  { slug: 'ai-job-search-tools-compared', title: 'AI Job Search Tools Compared', category: 'Job Search' },
  { slug: 'common-job-search-mistakes', title: 'Common Job Search Mistakes', category: 'Job Search' },
  // Interview Cluster
  { slug: 'how-to-get-more-interviews', title: 'How To Get More Interviews', category: 'Interviews' },
  { slug: 'why-recruiters-reject-candidates', title: 'Why Recruiters Reject Candidates', category: 'Interviews' },
  { slug: 'interview-preparation-guide', title: 'Interview Preparation Guide', category: 'Interviews' },
  { slug: 'common-interview-questions', title: 'Common Interview Questions', category: 'Interviews' },
  { slug: 'star-method-examples', title: 'STAR Method Examples', category: 'Interviews' },
  // Career Growth Cluster
  { slug: 'resume-tips-freshers', title: 'Resume Tips For Freshers', category: 'Career Growth' },
  { slug: 'resume-tips-experienced-professionals', title: 'Resume Tips For Experienced Professionals', category: 'Career Growth' },
  { slug: 'linkedin-optimization-guide', title: 'LinkedIn Optimization Guide', category: 'Career Growth' },
  { slug: 'building-a-professional-profile', title: 'Building A Professional Profile', category: 'Career Growth' },
  { slug: 'career-growth-roadmap', title: 'Career Growth Roadmap', category: 'Career Growth' }
];

const PROFESSIONS = [
  'software-engineer', 'data-analyst', 'project-manager', 'product-manager', 'devops-engineer',
  'marketing-manager', 'financial-analyst', 'sales-representative', 'hr-manager', 'graphic-designer',
  'ui-ux-designer', 'cybersecurity-analyst', 'business-analyst', 'customer-success-manager', 'accountant',
  'operations-manager', 'content-writer', 'social-media-manager', 'executive-assistant', 'registered-nurse'
];

const INDUSTRIES = [
  'software-engineers', 'data-analysts', 'product-managers', 'marketing-professionals', 'finance-professionals'
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function generateWithRetry(prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      console.error(`Generation failed, retrying (${i + 1}/${retries})...`, err.message);
      await sleep(2000);
    }
  }
  return "Error generating content.";
}

async function generateBlogs() {
  console.log('Generating 25 Blog Posts...');
  const blogs = [];
  for (const topic of BLOG_TOPICS) {
    console.log(`Generating blog: ${topic.title}`);
    const prompt = `You are an expert career coach and SEO copywriter for Apply4Works. Write a highly detailed, comprehensive, SEO-optimized blog article titled "${topic.title}". The article must be between 1000 and 1500 words. Format it in Markdown. Include headers, bullet points, and practical advice. Do not include a title tag at the very top (it will be rendered by the component).`;
    
    let content = await generateWithRetry(prompt);
    
    blogs.push({
      slug: topic.slug,
      title: topic.title,
      category: topic.category,
      excerpt: content.substring(0, 150).replace(/#/g, '').trim() + '...',
      date: new Date().toISOString(),
      author: 'Apply4Works Editorial',
      content: content
    });
    
    await sleep(1000); // rate limiting
  }
  fs.writeFileSync(path.join(FRONTEND_DATA_DIR, 'blogs.json'), JSON.stringify(blogs, null, 2));
}

async function generateFAQs() {
  console.log('Generating 50 FAQs...');
  const prompt = `You are the knowledge base for Apply4Works, an AI resume builder and ATS optimizer. Generate exactly 50 Frequently Asked Questions and their detailed answers. Organize them into categories: 'ATS', 'Resume Building', 'Job Search', 'Interviews'. Return the result ONLY as a valid JSON array of objects, like this:
  [ { "category": "ATS", "question": "What is ATS?", "answer": "An Applicant Tracking System..." }, ... ]
  No markdown blocks, just raw JSON.`;
  
  let content = await generateWithRetry(prompt);
  content = content.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(content);
    fs.writeFileSync(path.join(FRONTEND_DATA_DIR, 'faqs.json'), JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.error('Failed to parse FAQ JSON:', e.message);
  }
}

async function generateProfessions() {
  console.log('Generating 20 Profession Pages...');
  const data = [];
  for (const prof of PROFESSIONS) {
    console.log(`Generating profession: ${prof}`);
    const prompt = `You are Apply4Works. Generate SEO data for the profession: "${prof}". Return ONLY a valid JSON object in this format:
    {
      "profession": "String (formatted title)",
      "slug": "${prof}",
      "description": "A 2-paragraph SEO description of what this profession does and how to build a resume for it.",
      "topKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6", "keyword7", "keyword8"],
      "atsRecommendations": ["rec1", "rec2", "rec3"],
      "skillsToHighlight": ["skill1", "skill2", "skill3"]
    }
    No markdown blocks, raw JSON only.`;
    
    let content = await generateWithRetry(prompt);
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
      data.push(JSON.parse(content));
    } catch(e) { console.error('Failed to parse', prof); }
    
    await sleep(1000);
  }
  fs.writeFileSync(path.join(FRONTEND_DATA_DIR, 'professions.json'), JSON.stringify(data, null, 2));
}

async function generateIndustries() {
  console.log('Generating 5 Industry Landing Pages...');
  const data = [];
  for (const ind of INDUSTRIES) {
    console.log(`Generating industry: ${ind}`);
    const prompt = `You are Apply4Works. Write high-converting SEO landing page copy for the industry: "${ind}". The page will be titled "Resume Builder for ${ind}". Return ONLY a valid JSON object in this format:
    {
      "industrySlug": "${ind}",
      "title": "String",
      "heroSubtitle": "String",
      "painPoints": ["point1", "point2", "point3"],
      "howApply4WorksHelps": ["benefit1", "benefit2", "benefit3"],
      "seoContent": "A 500-word markdown formatted article targeting this specific industry keyword to boost SEO."
    }
    No markdown blocks, raw JSON only.`;
    
    let content = await generateWithRetry(prompt);
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
      data.push(JSON.parse(content));
    } catch(e) { console.error('Failed to parse', ind); }
    
    await sleep(1000);
  }
  fs.writeFileSync(path.join(FRONTEND_DATA_DIR, 'industries.json'), JSON.stringify(data, null, 2));
}

async function generateSuccessStories() {
  console.log('Generating Success Stories...');
  const prompt = `Write 10 highly realistic, detailed success stories (case studies) of people who used Apply4Works to beat the ATS and land jobs. Return ONLY a valid JSON array of objects:
  [ { "name": "John D.", "role": "Software Engineer", "beforeScore": 45, "afterScore": 92, "story": "Markdown formatted story of their struggle and success..." }, ... ]
  No markdown blocks, raw JSON only.`;
  
  let content = await generateWithRetry(prompt);
  content = content.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(content);
    fs.writeFileSync(path.join(FRONTEND_DATA_DIR, 'success-stories.json'), JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.error('Failed to parse Success Stories JSON:', e.message);
  }
}

async function run() {
  if (!fs.existsSync(FRONTEND_DATA_DIR)) fs.mkdirSync(FRONTEND_DATA_DIR, { recursive: true });
  
  console.log('🚀 Starting Programmatic SEO Generation...');
  await generateFAQs();
  await generateSuccessStories();
  await generateIndustries();
  await generateProfessions();
  await generateBlogs();
  console.log('✅ All SEO content generated successfully!');
}

run();
