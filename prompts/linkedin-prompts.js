/**
 * linkedin-prompts.js
 * Centralized prompt engineering for LinkedIn content generation.
 */

exports.buildTopicPrompt = (topic, style, category, resumeContext, urlContext, userFocus, attachedLink) => {
  let dynamicContext = `Topic:\n${topic || 'General Update'}\n\n`;
  if (category) dynamicContext += `Category:\n${category}\n\n`;
  if (userFocus) dynamicContext += `User Focus / Industry:\n${userFocus}\n\n`;
  if (resumeContext) dynamicContext += `User Resume / Achievements Context:\n${resumeContext}\n\n`;
  if (urlContext) dynamicContext += `Extracted URL Context:\n${urlContext}\n\n`;
  if (attachedLink) dynamicContext += `Attached Link:\n${attachedLink}\n\n`;

  const fallbackStyle = style ? style : 'Professional, Storytelling, Engaging';

  return `You are a highly experienced LinkedIn creator and ghostwriter. Generate 3 unique LinkedIn posts based on the provided context.

Context:
${dynamicContext}

Audience:
Professionals, peers, and recruiters in the industry.

Create 3 distinct variations tailored to these styles (or default to Professional, Storytelling, Engaging if none specified):
Requested Styles: ${fallbackStyle}

Requirements for ALL versions:
- 150-250 words each
- Include a strong, attention-grabbing hook
- Use natural, authentic, human-sounding language (avoid generic AI buzzwords like 'delve', 'testament', 'thrilled to announce')
- Include appropriate emojis (but don't overdo it)
- Include engaging formatting (line breaks, lists if necessary)
- End with an engagement hook (a question or call to action for the comments)
- Include 3-5 relevant hashtags
${attachedLink ? '- The user has provided an attached link. You MUST naturally include this exact link at the end of each post, for example: "🔗 Link: ' + attachedLink + '"' : ''}

Return EXACTLY a valid JSON object. NO MARKDOWN FORMATTING.
Structure:
{
  "professional": "...",
  "storytelling": "...",
  "engaging": "..."
}
`;
};

exports.buildResumeBatchPrompt = (itemsToGenerate) => {
  // itemsToGenerate is an array of objects: { id, sourceType, contentData }
  const itemsJson = JSON.stringify(itemsToGenerate, null, 2);

  return `You are an expert LinkedIn ghostwriter. I am providing you with extracted data from a user's professional resume.
Your task is to generate ONE highly engaging LinkedIn post topic, and 3 variations for EACH item provided in the batch.

Here are the items to generate posts for:
${itemsJson}

For each item, adapt the post style based on the 'sourceType' (e.g. PROJECT -> Technical/Project Showcase post, CERTIFICATION -> Celebration/Learning post, ACHIEVEMENT -> Impact-focused post).

Requirements for EACH variation:
- 150-250 words
- Strong, attention-grabbing hook
- Natural, authentic language (avoid 'thrilled to announce' and similar cliché AI phrases)
- Include appropriate emojis and spacing
- End with an engagement hook (question for the audience)
- Include 3-5 relevant hashtags

Return EXACTLY a valid JSON object. NO MARKDOWN FORMATTING.
Structure:
{
  "result": [
    {
      "sourceId": "id-from-input",
      "sourceType": "sourceType-from-input",
      "topic": "A short 3-6 word summary of the topic",
      "variations": {
        "professional": "...",
        "friendly": "...",
        "storytelling": "..."
      }
    }
  ]
}`;
};
