/**
 * resumeAiEnhancer.js V3
 *
 * AI-powered resume enhancement using OpenAI (migrated from Google Gemini).
 * Functions:
 *   - optimizeEntireResume()   — Full multi-section optimization
 *   - optimizeSingleSection()  — Inline single section improve
 *   - generateCoverLetter()    — AI cover letter generation
 *   - generateAiSuggestion()   — Inline AI assistant prompt
 *
 * All AI calls route through services/aiService.js — no direct provider calls here.
 */

const { MODELS, generateJSON, generateText } = require('./aiService');

// ── Fact extraction (unchanged) ───────────────────────────────────────────────

/**
 * Extract verifiable facts from a resume to prevent AI hallucination.
 * Returns structured facts for prompt injection and post-validation.
 */
function extractFacts(data) {
  const facts = {
    companies:    [],
    roles:        [],
    institutions: [],
    metrics:      [],   // percentages/numbers already in resume bullets
    years:        [],   // 4-digit years found in dates
  };
  if (!data) return facts;

  // Extract from experience
  for (const exp of (data.experience || [])) {
    if (exp.company) facts.companies.push(exp.company.trim());
    if (exp.role)    facts.roles.push(exp.role.trim());
    const yrs = ((exp.startDate || '') + ' ' + (exp.endDate || '')).match(/\d{4}/g) || [];
    facts.years.push(...yrs);
    for (const b of (exp.responsibilities || [])) {
      const m = (b || '').match(/\b(\d[\d,.]*\s*%)/g) || [];
      facts.metrics.push(...m.map(x => x.trim()));
    }
  }

  // Education
  for (const edu of (data.education || [])) {
    if (edu.institution) facts.institutions.push(edu.institution.trim());
    const yrs = ((edu.startDate || '') + ' ' + (edu.endDate || '')).match(/\d{4}/g) || [];
    facts.years.push(...yrs);
  }

  // Projects metrics
  for (const proj of (data.projects || [])) {
    const m = (proj.description || '').match(/\b(\d[\d,.]*\s*%)/g) || [];
    facts.metrics.push(...m.map(x => x.trim()));
  }

  // Deduplicate
  for (const key of Object.keys(facts)) facts[key] = [...new Set(facts[key])];
  return facts;
}

/**
 * Validate optimized output against locked facts.
 * Warns and auto-corrects inline — so retries aren't wasted.
 * Returns { corrections: string[] }
 */
function validateFacts(original, optimized, facts) {
  const corrections = [];
  const originalStr  = JSON.stringify(original);

  const origExp = original.experience || [];
  const optExp  = optimized.experience || [];

  // If AI added extra experience entries, remove them silently
  if (optExp.length > origExp.length) {
    corrections.push(`AI added ${optExp.length - origExp.length} extra experience entries — removed`);
    optimized.experience = optExp.slice(0, origExp.length);
  }

  for (let i = 0; i < Math.min((optimized.experience || []).length, origExp.length); i++) {
    const orig = origExp[i];
    const opt  = optimized.experience[i];
    if (orig.company && opt.company && opt.company.toLowerCase() !== orig.company.toLowerCase()) {
      corrections.push(`Restored company: "${opt.company}" → "${orig.company}"`);
      opt.company = orig.company;
    }
    if (orig.startDate && opt.startDate && opt.startDate !== orig.startDate) {
      corrections.push(`Restored startDate: "${opt.startDate}" → "${orig.startDate}"`);
      opt.startDate = orig.startDate;
    }
    if (!orig.isCurrent && orig.endDate && opt.endDate && opt.endDate !== orig.endDate) {
      corrections.push(`Restored endDate: "${opt.endDate}" → "${orig.endDate}"`);
      opt.endDate = orig.endDate;
    }
    for (let b = 0; b < (opt.responsibilities || []).length; b++) {
      const bullet = opt.responsibilities[b] || '';
      const newPcts = (bullet.match(/\b(\d[\d,.]*\s*%)/g) || []).map(x => x.trim());
      for (const pct of newPcts) {
        if (!facts.metrics.includes(pct) && !originalStr.includes(pct)) {
          corrections.push(`Suspected invented metric "${pct}" stripped from bullet`);
          opt.responsibilities[b] = opt.responsibilities[b].replace(pct, '').replace(/\s{2,}/g, ' ').trim();
        }
      }
    }
  }

  if ((optimized.education || []).length > (original.education || []).length) {
    corrections.push('AI added education entries — reverted');
    optimized.education = original.education;
  }

  if ((optimized.certifications || []).length > (original.certifications || []).length) {
    corrections.push('AI added certifications — reverted');
    optimized.certifications = original.certifications;
  }

  if (corrections.length) {
    console.warn('[FactLock] Auto-corrections applied:', corrections);
  }
  return { corrections };
}

// ── Prompt builders (unchanged) ───────────────────────────────────────────────

function buildOptimizePrompt(resumeData, jobDescription, selectedKeywords, sectionsToOptimize, facts) {
  const keywordsStr = selectedKeywords.slice(0, 30).join(', ');
  const jdTruncated = (jobDescription || '').substring(0, 3000);

  return `You are a world-class ATS Resume Optimization Expert.

TASK: Optimize ONLY the specified sections of the resume JSON.

LOCKED FACTS (DO NOT CHANGE):
${JSON.stringify(facts)}

IRON-CLAD RULES:
1. NEVER change or remove any data in the LOCKED FACTS.
2. ONLY modify sections in: [${sectionsToOptimize.join(', ')}]
3. ALL other sections must remain BYTE-FOR-BYTE identical.
4. Output MUST be ONLY valid JSON matching the original structure exactly.

SELECTED KEYWORDS TO INCORPORATE: ${keywordsStr}

JOB DESCRIPTION:
${jdTruncated}

INPUT RESUME JSON:
${JSON.stringify(resumeData, null, 2)}`;
}

function buildSectionPrompt(sectionName, sectionData, context, facts) {
  return `You are an expert resume writer. Improve this ${sectionName} section for ATS optimization and impact.

LOCKED FACTS (DO NOT CHANGE): ${JSON.stringify(facts)}

RULES:
1. Do not change any dates, company names, or existing metrics in LOCKED FACTS.
2. Output ONLY valid JSON matching the input structure exactly.
3. Make bullet points action-oriented and quantified where possible.

Input (${sectionName}):
${JSON.stringify(sectionData, null, 2)}`;
}

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Optimize the full resume against a job description.
 * Uses gpt-4.1 (heavy rewriting task).
 */
async function optimizeEntireResume(resumeData, jobDescription, selectedKeywords, sectionsToOptimize) {
  const facts = extractFacts(resumeData);
  const prompt = buildOptimizePrompt(resumeData, jobDescription, selectedKeywords, sectionsToOptimize, facts);

  try {
    const optimizedJson = await generateJSON(prompt, MODELS.FULL);

    // Safety merge: only overwrite sections that were requested
    const safeResume = JSON.parse(JSON.stringify(resumeData));
    for (const section of sectionsToOptimize) {
      if (optimizedJson[section] !== undefined) {
        safeResume[section] = optimizedJson[section];
      }
    }

    // Fact-lock post-validation
    validateFacts(resumeData, safeResume, facts);
    return safeResume;
  } catch (err) {
    console.error('[OptimizeResume] AI failed:', err.message);
    throw new Error('Resume optimization is temporarily unavailable. Please try again.');
  }
}

/**
 * Optimize a single section (inline "AI Improve" button).
 * Uses gpt-4.1 (quality rewrite needed).
 */
async function optimizeSingleSection(sectionName, sectionData, context) {
  const facts = extractFacts(sectionData);
  const prompt = buildSectionPrompt(sectionName, sectionData, context, facts);

  try {
    const optimized = await generateJSON(prompt, MODELS.FULL);
    validateFacts(sectionData, optimized, facts);
    return optimized;
  } catch (err) {
    console.error('[OptimizeSection] AI failed:', err.message);
    throw new Error('Section optimization is temporarily unavailable. Please try again.');
  }
}

/**
 * Generate a cover letter.
 * Uses gpt-4.1 (writing quality matters).
 */
async function generateCoverLetter(resumeData, jobData, tone = 'professional') {
  const pi = resumeData.personalInfo || {};
  const name = [pi.firstName, pi.lastName].filter(Boolean).join(' ') || 'the applicant';
  const topSkills = [
    ...(resumeData.skills?.programming || []),
    ...(resumeData.skills?.frameworks  || []),
  ].slice(0, 6).join(', ');

  const prompt = `Write a ${tone} cover letter for ${name} applying for the role of ${jobData.title} at ${jobData.company}.

Resume summary: ${JSON.stringify(resumeData.summary)}
Top skills: ${topSkills}
Job description (first 1000 chars): ${(jobData.description || '').substring(0, 1000)}

RULES:
1. Keep it under 300 words.
2. Mention 2-3 specific achievements or skills from the resume.
3. Return ONLY the cover letter text — no subject line, no JSON wrapping.
4. Tone must be ${tone}.`;

  try {
    return await generateText(prompt, MODELS.FULL);
  } catch (err) {
    console.error('[CoverLetter] AI failed:', err.message);
    throw new Error('Cover letter generation is temporarily unavailable. Please try again.');
  }
}

/**
 * Apply a custom AI instruction to a section (inline AI assistant).
 * Uses gpt-4.1-mini (lightweight).
 */
async function generateAiSuggestion(instruction, sectionName, sectionData, context) {
  const facts = extractFacts(sectionData);
  const prompt = `Instruction: "${instruction}"

LOCKED FACTS (DO NOT CHANGE): ${JSON.stringify(facts)}

Apply the instruction to the following ${sectionName} section.
Do not change any locked facts.
Return ONLY valid JSON matching the input structure exactly.

${JSON.stringify(sectionData, null, 2)}`;

  try {
    const optimized = await generateJSON(prompt, MODELS.MINI);
    validateFacts(sectionData, optimized, facts);
    return optimized;
  } catch (err) {
    console.error('[AiSuggest] AI failed:', err.message);
    throw new Error('AI suggestion is temporarily unavailable. Please try again.');
  }
}

module.exports = {
  optimizeEntireResume,
  optimizeSingleSection,
  generateCoverLetter,
  generateAiSuggestion,
};
