/**
 * linkedinAiService.js V2
 *
 * PROVIDER MIGRATION: Gemini → OpenAI (gpt-4.1-mini)
 *
 * Generates 3 LinkedIn post variations using OpenAI.
 * All AI calls route through services/aiService.js.
 * Return shape is identical to V1 — no frontend changes needed.
 */

const { MODELS, generateJSONArray } = require('./aiService');

/**
 * Generate 3 LinkedIn post variations for a given topic, style, and category.
 * @param {string} topic
 * @param {string} style   - e.g. 'Professional', 'Storytelling'
 * @param {string} category - e.g. 'Project Showcase'
 * @returns {Promise<Array<{ id: number, type: string, text: string }>>}
 */
exports.generatePostVariations = async (topic, style, category) => {
  console.log('[LinkedInAI] AI generation started');
  const prompt = `You are an expert LinkedIn ghostwriter. Generate exactly 3 highly engaging LinkedIn post variations about the topic: "${topic}".
The writing style should be: "${style}".
The post category is: "${category}".

Return a JSON array of exactly 3 objects with this structure:
[
  { "id": 1, "type": "Variation 1 name", "text": "Full post content here..." },
  { "id": 2, "type": "Variation 2 name", "text": "Full post content here..." },
  { "id": 3, "type": "Variation 3 name", "text": "Full post content here..." }
]

RULES:
1. Each post should be 150-250 words.
2. Include relevant hashtags at the end of each post.
3. Make each variation distinctly different in tone and structure.
4. Do not repeat the same opening line across variations.
5. The "type" field should name the style used (e.g. "Professional", "Storytelling", "Thought Leadership").`;

  try {
    const variations = await generateJSONArray(prompt, MODELS.MINI);
    return variations;
  } catch (err) {
    console.error('[LinkedInAI] AI generation failed:', err.message);
    console.log('[LinkedInAI] Fallback template generation used');
    
    // Fallback logic
    const fallbackVariations = [
      {
        id: 1,
        type: 'Professional',
        text: `I am excited to share that I recently completed a deep dive into ${topic}. Throughout this process, I focused on implementing scalable solutions and driving measurable results. By applying modern best practices, we can significantly optimize performance and deliver consistent value to stakeholders.\n\nDeveloping expertise in ${topic} has proven to be an invaluable asset in today’s fast-paced environment. I’m looking forward to applying these newly refined skills to tackle complex challenges and contribute to future projects.\n\nThank you to everyone who has supported me along this professional journey. Let's keep building and innovating! #ProfessionalGrowth #${topic.replace(/\s+/g, '')} #CareerUpdate`
      },
      {
        id: 2,
        type: 'Storytelling',
        text: `A few months ago, I decided to strengthen my skills in ${topic}. When I first started looking into it, I genuinely had no idea how challenging—and ultimately rewarding—the journey would be.\n\nThere were certainly moments when the right solution seemed just out of reach. But step by step, by breaking down the complex problems and collaborating effectively, everything finally started to click into place. Every obstacle along the way was just another opportunity to learn something completely new about ${topic}.\n\nIt's amazing how much you can grow when you fully commit to a goal. What's the biggest professional challenge you've overcome recently? Let me know below! 👇 #DeveloperJourney #Perseverance #${topic.replace(/\s+/g, '')}`
      },
      {
        id: 3,
        type: 'Thought Leadership',
        text: `The professional landscape is evolving rapidly, and understanding ${topic} is quickly becoming a critical differentiator for success.\n\nHere are 3 key takeaways from my recent deep-dive into this fascinating space:\n\n1️⃣ Adaptability is your strongest asset. As the standards around ${topic} shift, being open to change is non-negotiable.\n2️⃣ Establishing a clean architecture early on saves hundreds of hours of refactoring later.\n3️⃣ Never underestimate the profound power of consistent, incremental progress.\n\nAs we look toward the future, it's clear that mastering ${topic} will unlock new levels of efficiency. How is your team adapting to these industry changes? Let’s discuss in the comments. #FutureOfTech #ThoughtLeadership #${topic.replace(/\s+/g, '')}`
      }
    ];

    return fallbackVariations;
  }
};
