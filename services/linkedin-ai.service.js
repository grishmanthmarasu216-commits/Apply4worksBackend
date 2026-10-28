const { MODELS, generateJSON, generateJSONArray } = require('./aiService');
const { buildTopicPrompt, buildResumeBatchPrompt } = require('../prompts/linkedin-prompts');
const Resume = require('../models/Resume');
const LinkedInPost = require('../models/LinkedInPost');

/**
 * Generate 3 LinkedIn post variations for a given topic, style, and category.
 * Replaces grokLinkedinService.js logic.
 */
exports.generateFromTopic = async (options) => {
  console.log('[LinkedInAI] Topic generation started');
  const { topic, style, category, resumeContext, urlContext, userFocus, attachedLink } = options;
  
  const prompt = buildTopicPrompt(topic, style, category, resumeContext, urlContext, userFocus, attachedLink);
  
  try {
    const variations = await generateJSON(prompt, MODELS.FULL);
    
    // Ensure the response is an object with the expected keys
    if (!variations || typeof variations !== 'object' || Array.isArray(variations)) {
      throw new Error('AI returned an invalid structure.');
    }
    
    // Normalize nested text if AI returns { professional: { text: "..." } } instead of { professional: "..." }
    const normalized = {};
    for (const [key, value] of Object.entries(variations)) {
      if (typeof value === 'object' && value !== null) {
        normalized[key] = value.text || value.content || value.post || JSON.stringify(value);
      } else {
        normalized[key] = String(value);
      }
    }
    
    return normalized;
  } catch (err) {
    console.error('[LinkedInAI] Topic AI generation failed:', err.message);
    throw new Error('Failed to generate LinkedIn content.');
  }
};

/**
 * Generates LinkedIn posts directly from a user's parsed resume data.
 * Batches items to save tokens.
 */
exports.generateFromResume = async (userId) => {
  console.log(`[LinkedInAI] Resume-to-LinkedIn generation started for user ${userId}`);
  
  // 1. Fetch Resume Data
  const resumeRecord = await Resume.findOne({ user: userId });
  if (!resumeRecord || !resumeRecord.resumeData) {
    throw new Error('No parsed resume found for this user. Please upload or build a resume first.');
  }
  
  const rd = resumeRecord.resumeData;
  const itemsToGenerate = [];

  // Extract top 2 Projects
  if (rd.projects && rd.projects.length > 0) {
    rd.projects.slice(0, 2).forEach(p => {
      itemsToGenerate.push({
        id: p.id || `proj-${Math.random()}`,
        sourceType: 'PROJECT',
        contentData: { name: p.name, description: p.description, technologies: p.technologies }
      });
    });
  }

  // Extract top 1 Certification
  if (rd.certifications && rd.certifications.length > 0) {
    const cert = rd.certifications[0];
    itemsToGenerate.push({
      id: cert.id || `cert-${Math.random()}`,
      sourceType: 'CERTIFICATION',
      contentData: { name: cert.name, issuer: cert.issuer }
    });
  }

  // Extract top 1 Recent Experience (if has achievements)
  if (rd.experience && rd.experience.length > 0) {
    const exp = rd.experience[0];
    if (exp.responsibilities && exp.responsibilities.length > 0) {
      itemsToGenerate.push({
        id: exp.id || `exp-${Math.random()}`,
        sourceType: 'EXPERIENCE',
        contentData: { role: exp.role, company: exp.company, highlight: exp.responsibilities[0] }
      });
    }
  }

  if (itemsToGenerate.length === 0) {
    throw new Error('Not enough data in resume to generate posts. Add projects, experience, or certifications.');
  }

  // 2. Call AI with Batch Prompt
  const prompt = buildResumeBatchPrompt(itemsToGenerate);
  
  try {
    // We expect a JSON array of post objects
    const batchResults = await generateJSONArray(prompt, MODELS.FULL);
    
    // 3. Save to Database
    const savedPosts = [];
    for (const result of batchResults) {
      const post = await LinkedInPost.create({
        userId,
        topic: result.topic || `Resume Update`,
        sourceType: result.sourceType || 'GENERAL',
        sourceId: result.sourceId || null,
        generatedVariations: result.variations,
        status: 'draft'
      });
      savedPosts.push(post);
    }
    
    console.log(`[LinkedInAI] Generated and saved ${savedPosts.length} resume-based posts.`);
    return savedPosts;
  } catch (err) {
    console.error('[LinkedInAI] Resume batch AI generation failed:', err.message);
    throw new Error('Failed to generate posts from resume.');
  }
};
