const axios = require('axios');

exports.generatePostVariations = async (options) => {
  const { topic, style, category, resumeContext, urlContext, userFocus } = options;
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    throw new Error('GROK_API_KEY is not configured in .env');
  }

  let dynamicContext = `Topic:\n${topic || 'General Update'}\n\n`;
  if (category) dynamicContext += `Category:\n${category}\n\n`;
  if (userFocus) dynamicContext += `User Focus / Industry:\n${userFocus}\n\n`;
  if (resumeContext) dynamicContext += `User Resume / Achievements Context:\n${resumeContext}\n\n`;
  if (urlContext) dynamicContext += `Extracted URL Context:\n${urlContext}\n\n`;

  const prompt = `You are a highly experienced LinkedIn creator and ghostwriter. Generate 3 unique LinkedIn posts based on the provided context.

Context:
${dynamicContext}

Audience:
Professionals, peers, and recruiters in the industry.

Create 3 distinct variations:
1. Professional: Formal, achievement-oriented, highly professional tone.
2. Storytelling: Personal journey style, overcoming challenges, narrative-driven.
3. Friendly: Approachable, conversational, engaging, community-focused.

Requirements for ALL versions:
- 150-250 words each
- Include a strong, attention-grabbing hook
- Use natural, authentic, human-sounding language (avoid generic AI buzzwords like 'delve', 'testament', 'thrilled to announce')
- Include appropriate emojis (but don't overdo it)
- Include engaging formatting (line breaks, lists if necessary)
- End with an engagement hook (a question or call to action for the comments)
- Include 3-5 relevant hashtags

Return EXACTLY a valid JSON object with three keys: "professional", "storytelling", and "friendly", where each key contains the string text of the respective post. NO MARKDOWN FORMATTING (do not wrap in \`\`\`json), NO EXTRA TEXT.`;

  try {
    const response = await axios.post('https://api.x.ai/v1/chat/completions', {
      messages: [
        { role: 'system', content: 'You are an expert LinkedIn ghostwriter. Always output pure valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      model: 'grok-4.3',
      temperature: 0.5,
      response_format: { type: 'json_object' }
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 8000 // 8 second timeout to ensure fallback triggers promptly if API hangs
    });

    const content = response.data.choices[0].message.content;
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // In case Grok still adds markdown fences despite instructions
      const cleaned = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      parsed = JSON.parse(cleaned);
    }
    
    // Map to the array format that the frontend UI expects
    return [
      { id: 1, type: 'Professional', text: parsed.professional || '' },
      { id: 2, type: 'Friendly', text: parsed.friendly || '' },
      { id: 3, type: 'Storytelling', text: parsed.storytelling || '' }
    ];

  } catch (error) {
    console.error('Grok API Error:', error.response?.data || error.message);
    throw new Error('Failed to generate content using Grok AI.');
  }
};
