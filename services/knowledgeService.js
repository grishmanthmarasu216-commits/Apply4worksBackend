const axios = require('axios');
const Groq = require('groq-sdk');

// We use a separate Groq client for Knowledge Hub
const getGroqClient = () => {
  if (!process.env.GROQ_KNOWLEDGE_API_KEY) {
    throw new Error('GROQ_KNOWLEDGE_API_KEY is not configured');
  }
  return new Groq({ apiKey: process.env.GROQ_KNOWLEDGE_API_KEY });
};

const getTavilyApiKey = () => {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error('TAVILY_API_KEY is not configured');
  }
  return process.env.TAVILY_API_KEY;
};

/**
 * Perform a web search using Tavily API
 */
const tavilySearch = async (query, searchDepth = 'basic', includeAnswers = false) => {
  try {
    const response = await axios.post('https://api.tavily.com/search', {
      api_key: getTavilyApiKey(),
      query,
      search_depth: searchDepth,
      include_answer: includeAnswers,
      max_results: 10
    });
    return response.data;
  } catch (error) {
    console.error('Tavily search error:', error.response?.data || error.message);
    throw new Error('Web search failed. Please try again later.');
  }
};

/**
 * Summarizes articles and content using Groq
 */
const summarizeContent = async (articles, role) => {
  const groq = getGroqClient();
  
  const prompt = `
You are an expert AI assistant helping a ${role}.
Below are search results. For each result, provide a concise summary (maximum 80-120 words). DO NOT GENERATE LONG SUMMARIES.
Format the output strictly as a JSON object with a "results" array. Each item in the array must have these fields: 'url', 'summary', 'keyTakeaways' (2-3 very short bullet points), 'difficultyLevel' (Beginner, Intermediate, Advanced), 'estimatedReadingTime', 'sourceType' (video, article, documentation, github, discussion, news), 'author' (if found), 'duration' (if a video), 'views' (if found).
Results:
${JSON.stringify(articles.map(a => ({ url: a.url, title: a.title, content: a.content.substring(0, 1000) })))}
`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      response_format: { type: 'json_object' }
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    return parsed.results || [];
  } catch (error) {
    console.error('Groq summarization error:', error);
    return [];
  }
};

/**
 * Fetch latest content for the user's role
 */
exports.fetchLatestContent = async (role) => {
  try {
    const queries = [
      { q: `top learning tutorials courses for ${role} site:youtube.com`, depth: 'basic', max: 5 },
      { q: `${role} official documentation updates OR site:developer.mozilla.org OR site:freecodecamp.org`, depth: 'basic', max: 5 },
      { q: `${role} learning notes site:geeksforgeeks.org OR site:dev.to OR site:hashnode.com OR site:medium.com`, depth: 'basic', max: 5 },
      { q: `${role} interview experiences OR career tips site:reddit.com OR site:linkedin.com`, depth: 'basic', max: 5 }
    ];

    const searchPromises = queries.map(query => 
      axios.post('https://api.tavily.com/search', {
        api_key: getTavilyApiKey(),
        query: query.q,
        search_depth: query.depth,
        include_answer: false,
        max_results: query.max
      }).then(res => res.data.results || []).catch(() => [])
    );

    const resultsArrays = await Promise.all(searchPromises);
    let allResults = resultsArrays.flat();

    // Deduplicate by URL
    const uniqueMap = new Map();
    allResults.forEach(item => {
      if (!uniqueMap.has(item.url)) uniqueMap.set(item.url, item);
    });
    allResults = Array.from(uniqueMap.values());
    
    // Sort randomly to mix sources
    allResults.sort(() => Math.random() - 0.5);
    
    // Link Validation (HEAD request to check if link is alive)
    const validateLink = async (item) => {
      try {
        await axios.head(item.url, { timeout: 3000 });
        return item;
      } catch (err) {
        return null; // Dead link
      }
    };
    
    // Take top 15 initially, validate, and keep top 10
    const topCandidates = allResults.slice(0, 15);
    const validatedResults = (await Promise.all(topCandidates.map(validateLink))).filter(Boolean);
    allResults = validatedResults.slice(0, 10);

    if (allResults.length === 0) return [];

    const summaries = await summarizeContent(allResults, role);
    
    return allResults.map(article => {
      const summaryData = summaries.find(s => s.url === article.url) || {};
      
      let thumbnail = '';
      try {
        if (article.url.includes('youtube.com/watch?v=')) {
          const vId = new URL(article.url).searchParams.get('v');
          if (vId) thumbnail = `https://img.youtube.com/vi/${vId}/maxresdefault.jpg`;
        } else if (article.url.includes('youtu.be/')) {
          const vId = article.url.split('youtu.be/')[1]?.split('?')[0];
          if (vId) thumbnail = `https://img.youtube.com/vi/${vId}/maxresdefault.jpg`;
        }
      } catch (e) {
        // Ignored
      }
      
      return {
        title: article.title,
        url: article.url,
        source: new URL(article.url).hostname,
        summary: summaryData.summary || article.content.substring(0, 150) + '...',
        keyTakeaways: summaryData.keyTakeaways || [],
        difficultyLevel: summaryData.difficultyLevel || 'Intermediate',
        estimatedReadingTime: summaryData.estimatedReadingTime || '5 min',
        sourceType: summaryData.sourceType || (article.url.includes('youtube.com') ? 'video' : 'article'),
        thumbnail: thumbnail,
        author: summaryData.author || '',
        duration: summaryData.duration || '',
        views: summaryData.views || '',
        publishedDate: article.published_date || new Date().toISOString()
      };
    });
  } catch (error) {
    console.error('Error in fetchLatestContent:', error);
    throw new Error('Failed to fetch latest content from search provider.');
  }
};

/**
 * Generate a personalized learning roadmap using Groq
 */
exports.generateLearningRoadmap = async (role) => {
  const groq = getGroqClient();
  const prompt = `
Generate a comprehensive, categorized learning center guide for ${role}.
Return the output strictly in JSON format matching this structure:
{
  "categories": [
    {
      "categoryName": "Official Documentation",
      "topics": [{
        "title": "...",
        "explanation": "...",
        "difficulty": "Beginner|Intermediate|Advanced",
        "completionEstimate": "...",
        "referenceLinks": [{"title": "...", "url": "..."}],
        "recommendedVideos": [{"title": "...", "url": "..."}],
        "practiceLinks": [{"title": "...", "url": "..."}],
        "interviewQuestions": ["..."],
        "aiSummary": "..."
      }]
    },
    { "categoryName": "Concept Explanations", "topics": [...] },
    { "categoryName": "Cheat Sheets", "topics": [...] },
    { "categoryName": "Practice Problems", "topics": [...] },
    { "categoryName": "Coding Exercises", "topics": [...] },
    { "categoryName": "Projects", "topics": [...] }
  ]
}
Ensure the content is highly structured, deeply educational, and tailored specifically to the ${role} position. Do NOT use roadmap formatting. Focus purely on robust educational material.
`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'system', content: 'You are an expert career coach and senior engineer.' }, { role: 'user', content: prompt }],
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      response_format: { type: 'json_object' }
    });
    return JSON.parse(completion.choices[0]?.message?.content || '{}');
  } catch (error) {
    console.error('Groq roadmap error:', error);
    throw new Error('Failed to generate learning roadmap.');
  }
};
