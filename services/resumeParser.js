/**
 * resumeParser.js V4 — Pure Node.js, No Python Required
 *
 * PROVIDER MIGRATION: Gemini → Groq (meta-llama/llama-4-scout-17b-16e-instruct)
 *
 * Pipeline:
 *   1. Extract raw text from file (pdf-parse for PDFs, mammoth for DOCX)
 *   2. Pre-parse with regex (fast, no API cost) — contacts, emails, phones, URLs
 *   3. Call Groq to extract ALL structured fields from raw text
 *   4. Merge regex results into AI output (regex is more accurate for contacts)
 *   5. Return normalized V2 resumeData
 *
 * All AI calls go through services/aiService.js.
 */

const fs       = require('fs');
const path     = require('path');
const pdfParse = require('pdf-parse');
const mammoth  = require('mammoth');

const { MODELS, generateJSON, withRetry } = require('./aiService');

const PARSE_TIMEOUT_MS = 45000;

// ── Step 1: Extract raw text from file ───────────────────────────────────────

async function extractRawText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let rawText = '';
  let extractionMethod = 'none';
  let extractionError = null;

  if (ext === '.pdf') {
    try {
      const buffer = fs.readFileSync(filePath);
      const parsed = await pdfParse(buffer);
      rawText = parsed.text || '';
      extractionMethod = 'pdf-parse';

      if (!rawText.trim() && parsed.numpages > 0) {
        extractionError = {
          code: 'PASSWORD_PROTECTED',
          message: 'This PDF appears to be password-protected. Please remove the password and re-upload.',
        };
      }
    } catch (e) {
      console.error('[Parser] pdf-parse failed:', e.message);
      extractionError = {
        code: 'PDF_EXTRACTION_FAILED',
        message: `Could not read PDF contents: ${e.message}`,
      };
    }
  } else if (ext === '.docx' || ext === '.doc') {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      rawText = result.value || '';
      extractionMethod = 'mammoth';
    } catch (e) {
      console.error('[Parser] mammoth failed:', e.message);
      extractionError = {
        code: 'DOCX_EXTRACTION_FAILED',
        message: `Could not read DOCX contents: ${e.message}`,
      };
    }
  } else {
    extractionError = {
      code: 'UNSUPPORTED_FORMAT',
      message: `File format "${ext}" is not supported. Please upload PDF, DOC, or DOCX.`,
    };
  }

  return { rawText, extractionMethod, extractionError };
}

// ── Step 2: Regex pre-extraction (fast, accurate for contacts) ───────────────

function regexExtract(rawText) {
  const email    = (rawText.match(/[\w.%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}/i) || [])[0] || '';
  const phone    = extractPhone(rawText);
  const linkedin = (rawText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-]+/i) || [])[0] || '';
  const github   = (rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w\-]+/i) || [])[0] || '';
  const name     = extractName(rawText);

  return { email, phone, linkedin, github, name };
}

function extractPhone(text) {
  const matches = text.match(/(\+?[\d\s\-().]{10,17})/g) || [];
  for (const m of matches) {
    const digits = m.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) return m.trim();
  }
  return '';
}

function extractName(text) {
  const lines = text.split('\n').slice(0, 8);
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.includes('@') || /https?:/.test(s) || /\d{5,}/.test(s)) continue;
    const words = s.split(/\s+/);
    if (words.length >= 2 && words.length <= 4) {
      if (words.every(w => w.length > 0 && /^[A-Za-z]/.test(w))) {
        return s;
      }
    }
  }
  return '';
}

// ── Step 3: Groq structured extraction ─────────────────────────────────────

const PARSE_PROMPT = (rawText) => `You are an expert resume parser. Extract all information from this resume text.

Return this EXACT JSON structure (use "" for missing strings, [] for missing arrays):
{
  "personalInfo": {
    "firstName": "",
    "lastName": "",
    "professionalTitle": "",
    "email": "",
    "phone": "",
    "location": "",
    "linkedin": "",
    "github": "",
    "portfolio": "",
    "website": ""
  },
  "summary": "",
  "experience": [
    {
      "company": "",
      "role": "",
      "employmentType": "",
      "location": "",
      "startDate": "",
      "endDate": "",
      "isCurrent": false,
      "responsibilities": ["bullet point 1", "bullet point 2"]
    }
  ],
  "projects": [
    {
      "title": "",
      "role": "",
      "company": "",
      "duration": "",
      "teamSize": "",
      "techStack": "tech1, tech2",
      "description": ["bullet point 1", "bullet point 2"],
      "github": "",
      "liveLink": ""
    }
  ],
  "education": [
    {
      "institution": "",
      "degree": "",
      "branch": "",
      "location": "",
      "startDate": "",
      "endDate": "",
      "duration": "",
      "gpa": ""
    }
  ],
  "skills": {
    "programming": [],
    "frameworks": [],
    "databases": [],
    "cloud": [],
    "devops": [],
    "tools": [],
    "platforms": [],
    "softSkills": []
  },
  "certifications": [
    { "name": "", "issuer": "", "date": "", "url": "" }
  ],
  "languages": [
    { "language": "", "proficiency": "" }
  ],
  "achievements": [],
  "internships": [
    {
      "company": "",
      "role": "",
      "location": "",
      "startDate": "",
      "endDate": "",
      "responsibilities": []
    }
  ],
  "research": [
    { "title": "", "institution": "", "description": "", "date": "", "url": "" }
  ],
  "publications": [
    { "title": "", "publisher": "", "date": "", "url": "" }
  ],
  "awards": [
    { "title": "", "issuer": "", "date": "", "description": "" }
  ],
  "volunteering": [
    { "organization": "", "role": "", "startDate": "", "endDate": "", "description": "" }
  ],
  "extracurricular": [
    { "activity": "", "role": "", "description": "" }
  ],
  "hackathons": [
    { "name": "", "project": "", "role": "", "date": "", "description": "" }
  ],
  "codingProfiles": {
    "leetcode": "",
    "codeforces": "",
    "codechef": "",
    "hackerrank": "",
    "geeksforgeeks": ""
  },
  "interests": []
}

RULES:
1. COMPLETENESS IS CRITICAL: You MUST extract 100% of the content. Do NOT summarize, shorten, rewrite, paraphrase, or drop any information (even if it looks repetitive or lengthy).
2. For experience and internships, put each bullet point as a separate string in "responsibilities". Parse the entire experience description completely without dropping any bullet points or details.
3. Parse EVERY project description entirely, including every sentence, bullet point, technology used, outcome, achievement, metric, link, and responsibility. Put each bullet point or sentence as a separate string in the "description" array. Do not truncate, summarize, or remove any details.
4. Extract ALL skills and categorize them properly (programming languages → "programming", React/Django → "frameworks", MySQL/MongoDB → "databases", AWS/GCP → "cloud", Docker/CI/CD → "devops", VS Code/Jira → "tools", communication/leadership → "softSkills").
5. Extract ALL certifications, education details, achievements, extracurricular activities, research, and publications completely.
6. Preserve formatting where possible (especially bullet points and line breaks). Preserve all hyperlinks, dates, organization names, role names, and GPA/CGPA.
7. For startDate/endDate use formats like "Jan 2022", "2020", or "Present". Set "isCurrent": true only if the role says "present", "current", or "now".
8. NEVER invent data not present in the resume. Extract exactly what is present.
9. Return ONLY the JSON object with the structure above, with NO truncation of long text.

Resume text:
${rawText.substring(0, 45000)}`;

async function callAI(rawText) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured in environment variables.');
  }
  return generateJSON(PARSE_PROMPT(rawText), MODELS.MINI);
}

// ── Step 4: Merge and normalize ───────────────────────────────────────────────

function mergeAndNormalize(aiData, regexData) {
  const pi = aiData.personalInfo || {};

  // Regex is more accurate for contacts — fill in if AI missed them
  if (!pi.email    && regexData.email)    pi.email    = regexData.email;
  if (!pi.phone    && regexData.phone)    pi.phone    = regexData.phone;
  if (!pi.linkedin && regexData.linkedin) pi.linkedin = regexData.linkedin;
  if (!pi.github   && regexData.github)   pi.github   = regexData.github;

  // Fix name split if AI returned fullName instead of first/last
  if (!pi.firstName && !pi.lastName && regexData.name) {
    const parts = regexData.name.trim().split(/\s+/);
    pi.firstName = parts[0] || '';
    pi.lastName  = parts.slice(1).join(' ') || '';
  }
  if (!pi.firstName && !pi.lastName && (pi.name || pi.fullName)) {
    const parts = (pi.name || pi.fullName || '').trim().split(/\s+/);
    pi.firstName = parts[0] || '';
    pi.lastName  = parts.slice(1).join(' ') || '';
  }

  // Ensure skills object exists with all categories
  const skills = aiData.skills || {};
  const normalizedSkills = {
    programming: skills.programming || [],
    frameworks:  skills.frameworks  || [],
    databases:   skills.databases   || [],
    cloud:       skills.cloud       || [],
    devops:      skills.devops      || [],
    tools:       skills.tools       || [],
    softSkills:  skills.softSkills  || [],
  };

  if (Array.isArray(aiData.skills)) {
    normalizedSkills.tools = aiData.skills;
  }

  return {
    personalInfo: {
      firstName:  pi.firstName || '',
      lastName:   pi.lastName  || '',
      professionalTitle: pi.professionalTitle || '',
      email:      pi.email     || '',
      phone:      pi.phone     || '',
      location:   pi.location  || '',
      linkedin:   pi.linkedin  || '',
      github:     pi.github    || '',
      portfolio:  pi.portfolio || pi.website || '',
      website:    pi.website   || '',
    },
    summary:        aiData.summary || '',
    experience:     (aiData.experience || []).map((exp, i) => ({
      id:              exp.id || `exp-${i}`,
      company:         exp.company || '',
      role:            exp.role || exp.title || exp.position || '',
      employmentType:  exp.employmentType || '',
      location:        exp.location || '',
      startDate:       exp.startDate || '',
      endDate:         exp.isCurrent ? '' : (exp.endDate || ''),
      isCurrent:       !!exp.isCurrent,
      responsibilities: Array.isArray(exp.responsibilities)
        ? exp.responsibilities.filter(Boolean)
        : typeof exp.responsibilities === 'string'
          ? exp.responsibilities.split('\n').filter(Boolean)
          : [],
    })),
    projects:       (aiData.projects || []).map((p, i) => ({
      id:           p.id || `proj-${i}`,
      name:         p.name || p.title || '',
      description:  p.description || '',
      technologies: Array.isArray(p.technologies) ? p.technologies : [],
      github:       p.github || '',
      liveLink:     p.liveLink || p.link || p.url || '',
      dates:        p.dates || '',
    })),
    education:      (aiData.education || []).map((edu, i) => ({
      id:          edu.id || `edu-${i}`,
      institution: edu.institution || edu.school || edu.university || '',
      degree:      edu.degree || '',
      branch:      edu.branch || edu.field || edu.major || '',
      location:    edu.location || '',
      startDate:   edu.startDate || '',
      endDate:     edu.endDate || edu.year || '',
      duration:    edu.duration || '',
      gpa:         edu.gpa || edu.cgpa || '',
    })),
    skills:         {
      programming: aiData.skills?.programming || [],
      frameworks:  aiData.skills?.frameworks  || [],
      databases:   aiData.skills?.databases   || [],
      cloud:       aiData.skills?.cloud       || [],
      devops:      aiData.skills?.devops      || [],
      tools:       aiData.skills?.tools       || [],
      platforms:   aiData.skills?.platforms   || [],
      softSkills:  aiData.skills?.softSkills  || [],
    },
    certifications: (aiData.certifications || []).map((c, i) => {
      if (typeof c === 'string') return { id: `cert-${i}`, name: c, issuer: '', date: '', url: '' };
      return { id: c.id || `cert-${i}`, name: c.name || '', issuer: c.issuer || '', date: c.date || '', url: c.url || '' };
    }),
    languages:      (aiData.languages || []).map(l => {
      if (typeof l === 'string') return { language: l, proficiency: '' };
      return { language: l.language || l.name || '', proficiency: l.proficiency || l.level || '' };
    }),
    achievements:   (aiData.achievements || []).filter(a => typeof a === 'string' && a.trim()),
    internships:    aiData.internships || [],
    research:       aiData.research || [],
    publications:   aiData.publications || [],
    awards:         aiData.awards || [],
    volunteering:   aiData.volunteering || [],
    extracurricular: aiData.extracurricular || [],
    hackathons:     aiData.hackathons || [],
    codingProfiles: aiData.codingProfiles || { leetcode: '', codeforces: '', codechef: '', hackerrank: '', geeksforgeeks: '' },
    interests:      aiData.interests || [],
  };
}

// ── Field-level confidence (for UI display) ───────────────────────────────────

function calculateFieldConfidence(parsed) {
  const pi = parsed.personalInfo || {};
  return {
    name:       { value: `${pi.firstName} ${pi.lastName}`.trim(), confidence: pi.firstName ? 0.95 : 0.0 },
    email:      { value: pi.email,     confidence: pi.email    ? 0.99 : 0.0 },
    phone:      { value: pi.phone,     confidence: pi.phone    ? 0.90 : 0.0 },
    location:   { value: pi.location,  confidence: pi.location ? 0.80 : 0.0 },
    linkedin:   { value: pi.linkedin,  confidence: pi.linkedin ? 0.98 : 0.0 },
    github:     { value: pi.github,    confidence: pi.github   ? 0.98 : 0.0 },
    summary:    { value: (parsed.summary || '').slice(0, 80), confidence: parsed.summary ? 0.85 : 0.0 },
    skills:     { count: Object.values(parsed.skills || {}).flat().length, confidence: 0.90 },
    experience: { count: (parsed.experience || []).length, confidence: (parsed.experience || []).length > 0 ? 0.88 : 0.0 },
    education:  { count: (parsed.education || []).length, confidence: (parsed.education || []).length > 0 ? 0.90 : 0.0 },
    projects:   { count: (parsed.projects || []).length, confidence: (parsed.projects || []).length > 0 ? 0.85 : 0.0 },
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * parseResumeAdvanced — drop-in replacement for Python-based parser.
 * @param {string} filePath - absolute path to uploaded file
 * @param {string} rawTextFallback - already-extracted text (optional)
 * @returns {{ parsed, fieldConfidence, usedGemini, rawText }}
 *
 * NOTE: `usedGemini` key is preserved for frontend compatibility.
 *       Its value reflects whether the AI call succeeded (provider-agnostic).
 */
async function parseResumeAdvanced(filePath, rawTextFallback = '') {
  console.log('[Parser] Starting parse:', path.basename(filePath));

  // Step 1: Extract raw text
  const { rawText: extractedText, extractionMethod, extractionError } = await extractRawText(filePath);
  const rawText = rawTextFallback || extractedText;

  console.log(`[Parser] Extraction method: ${extractionMethod}, length: ${rawText.length} chars`);

  if (!rawText.trim()) {
    if (extractionError) throw Object.assign(new Error(extractionError.message), { code: extractionError.code });
    throw Object.assign(
      new Error('Could not extract any text from this file. The file may be empty, corrupted, or image-based.'),
      { code: 'NO_TEXT_EXTRACTED' }
    );
  }

  // Step 2: Regex extraction (fast, accurate for contacts)
  const regexData = regexExtract(rawText);
  console.log('[Parser] Regex extracted email:', regexData.email ? '✓' : '✗',
    '| name:', regexData.name ? '✓' : '✗');

  // Validate Groq key early
  if (!process.env.GROQ_API_KEY) {
    console.warn('[Parser] ⚠  GROQ_API_KEY is not set. Falling back to regex-only parsing.');
  }

  // Step 3: Groq AI extraction
  console.log('[Parser] Calling Groq (meta-llama/llama-4-scout-17b-16e-instruct)...');
  let aiData;
  let aiError = null;

  try {
    aiData = await callAI(rawText);
    console.log('[Parser] AI OK — experience:', (aiData.experience || []).length,
      '| skills:', Object.values(aiData.skills || {}).flat().length);
  } catch (e) {
    aiError = e;
    console.error('[Parser] AI failed:', e.message);
    console.warn('[Parser] Using regex-only fallback — contact fields only will be available.');
    // Build minimal structure from regex data as fallback
    aiData = {
      personalInfo: {
        firstName: regexData.name.split(/\s+/)[0] || '',
        lastName:  regexData.name.split(/\s+/).slice(1).join(' ') || '',
        email:     regexData.email,
        phone:     regexData.phone,
        linkedin:  regexData.linkedin,
        github:    regexData.github,
        location:  '',
        portfolio: '',
        website:   '',
      },
      summary: '',
      experience: [],
      projects: [],
      education: [],
      skills: { programming: [], frameworks: [], databases: [], cloud: [], devops: [], tools: [], softSkills: [] },
      certifications: [],
      languages: [],
      achievements: [],
      internships: [],
      research: [],
      publications: [],
      awards: [],
      volunteering: [],
      extracurricular: [],
      hackathons: [],
      codingProfiles: { leetcode: '', codeforces: '', codechef: '', hackerrank: '', geeksforgeeks: '' },
      interests: [],
    };
  }

  // Step 4: Merge and normalize
  const parsed = mergeAndNormalize(aiData, regexData);
  const fieldConfidence = calculateFieldConfidence(parsed);

  if (aiError) {
    console.warn('[Parser] Returning partial data from regex fallback. AI error:', aiError.message);
  }

  console.log('[Parser] Done — name:', `${parsed.personalInfo.firstName} ${parsed.personalInfo.lastName}`.trim(),
    '| email:', parsed.personalInfo.email ? '✓' : '✗');

  return {
    parsed,
    rawText,
    fieldConfidence,
    usedGemini: !aiError,   // key preserved for frontend compat; true = AI succeeded
    confidence: { overall: parsed.personalInfo.email ? 80 : 50 },
  };
}

module.exports = { parseResumeAdvanced };
