/**
 * atsScoringEngine.js V2
 * 
 * Weighted ATS scoring engine.
 * Scores resume against a job description using:
 *   Skills = 35%
 *   Experience = 25%
 *   Projects = 15%
 *   Title Alignment = 10%
 *   Education = 5%
 *   Keyword Coverage = 10% (soft skills, tools, misc)
 *   Total = 100 pts → converted to matchScore 0–10
 */

const { flattenKeywords, extractKeywordsFromText } = require('./keywordExtractor');

/**
 * Flattens V2 skills object into a single searchable array
 */
function flattenV2Skills(skills) {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills;
  if (typeof skills === 'object') {
    return Object.values(skills).flat().filter(Boolean);
  }
  return [];
}

/**
 * Get all text content from a resume for keyword matching
 */
function getResumeText(resumeData) {
  if (!resumeData) return '';
  return JSON.stringify(resumeData).toLowerCase();
}

/**
 * Safely extract experience entries from V2 or legacy resume
 */
function getExperienceEntries(resumeData) {
  return resumeData?.experience || [];
}

/**
 * Estimate years of experience from experience array
 */
function estimateYearsOfExperience(experience) {
  if (!experience || experience.length === 0) return 0;
  
  let totalMonths = 0;
  const currentYear = new Date().getFullYear();
  
  for (const exp of experience) {
    try {
      const start = exp.startDate || exp.start_date || exp.duration?.split('–')[0] || '';
      const end   = exp.isCurrent || exp.current 
        ? new Date().toISOString() 
        : (exp.endDate || exp.end_date || exp.duration?.split('–')[1] || '');
      
      if (!start) continue;
      
      const startYear = parseInt(start.match(/\d{4}/)?.[0] || '0');
      const endYear   = parseInt((end || '').match(/\d{4}/)?.[0] || String(currentYear));
      
      if (startYear > 0 && endYear >= startYear) {
        totalMonths += (endYear - startYear) * 12;
      }
    } catch {}
  }
  
  return Math.round(totalMonths / 12 * 10) / 10;
}

/**
 * Main scoring function — works with both V2 resumeData and legacy formats
 */
function calculateAtsScore(resumeData, extractedJobKeywords, jobData) {
  if (!resumeData) return { 
    atsScore: 0, matchScore: 0, presentSkills: [], missingSkills: [], 
    recommendations: [], scoreBreakdown: {} 
  };

  // ── Normalize input ─────────────────────────────────────────────────────────
  // Support both V2 (resumeData.personalInfo) and legacy flat formats
  const isV2 = !!(resumeData.personalInfo);
  const resumeText = getResumeText(resumeData);
  const experience = getExperienceEntries(resumeData);
  const projects   = resumeData.projects   || [];
  const education  = resumeData.education  || [];
  const skills     = isV2 ? flattenV2Skills(resumeData.skills) : (resumeData.skills || []);
  const summary    = resumeData.summary || '';
  const yearsExp   = estimateYearsOfExperience(experience);
  
  // ── Job keywords ────────────────────────────────────────────────────────────
  const jobSkills = flattenKeywords(extractedJobKeywords);

  // ── 1. Skills Match (35%) ───────────────────────────────────────────────────
  let skillMatchScore = 0;
  const presentSkills = [];
  const missingSkills = [];
  
  if (jobSkills.length > 0) {
    for (const skill of jobSkills) {
      const lowerSkill = skill.toLowerCase();
      const escapedSkill = lowerSkill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|[^a-zA-Z0-9])(${escapedSkill})(?:[^a-zA-Z0-9]|$)`, 'i');
      if (regex.test(resumeText)) {
        presentSkills.push(skill);
      } else {
        missingSkills.push(skill);
      }
    }
    skillMatchScore = Math.round((presentSkills.length / jobSkills.length) * 35);
  } else {
    // No recognized tech keywords in JD — give partial credit
    skillMatchScore = 25;
  }

  // ── 2. Experience Match (25%) ───────────────────────────────────────────────
  let experienceScore = 0;
  const requiredExp = (jobData?.experienceLevel || '').toLowerCase();

  if (requiredExp.includes('senior') || requiredExp.includes('lead') || requiredExp.includes('staff')) {
    if (yearsExp >= 5) experienceScore = 25;
    else if (yearsExp >= 3) experienceScore = 15;
    else if (experience.length > 0) experienceScore = 8;
  } else if (requiredExp.includes('mid') || requiredExp.includes('intermediate')) {
    if (yearsExp >= 2) experienceScore = 25;
    else if (experience.length > 0) experienceScore = 15;
    else experienceScore = 8;
  } else if (requiredExp.includes('junior') || requiredExp.includes('entry') || requiredExp.includes('intern') || requiredExp.includes('graduate')) {
    if (experience.length > 0) experienceScore = 25;
    else experienceScore = 18;
  } else {
    // No explicit level — base on presence + quality
    if (experience.length >= 3) experienceScore = 25;
    else if (experience.length >= 1) experienceScore = 18;
    else experienceScore = 8;
  }

  // ── 3. Projects Match (15%) ─────────────────────────────────────────────────
  let projectsScore = 0;
  if (projects.length > 0) {
    projectsScore = 10;
    const projectsText = JSON.stringify(projects).toLowerCase();
    const hasTechSkill = presentSkills.some(s => projectsText.includes(s.toLowerCase()));
    if (hasTechSkill) projectsScore = 15;
  }

  // ── 4. Title Alignment (10%) ────────────────────────────────────────────────
  let titleMatchScore = 0;
  const targetTitle = (jobData?.title || '').toLowerCase();
  if (targetTitle) {
    const titleWords = targetTitle.split(/\s+/).filter(w => w.length > 3);
    const expTitles  = experience.map(e => (e.role || e.title || '').toLowerCase());
    const isDirectMatch = expTitles.some(t => t.includes(targetTitle) || targetTitle.includes(t));
    if (isDirectMatch) {
      titleMatchScore = 10;
    } else if (resumeText.includes(targetTitle)) {
      titleMatchScore = 6;
    } else if (titleWords.some(w => resumeText.includes(w))) {
      titleMatchScore = 3;
    }
  } else {
    titleMatchScore = 10; // No title to match against
  }

  // ── 5. Education Match (5%) ─────────────────────────────────────────────────
  let educationScore = 0;
  if (education.length > 0) {
    educationScore = 5;
  }

  // ── 6. Keyword Coverage / Soft Skills (10%) ─────────────────────────────────
  // Checks if JD soft skills and general terms appear in the resume
  let keywordCoverageScore = 0;
  const softSkillKeywords = flattenKeywords(
    extractKeywordsFromText(jobData?.description || '')
  ).filter(k => {
    const category = Object.entries(extractedJobKeywords).find(([, vals]) => vals.includes(k))?.[0];
    return category === 'SoftSkills' || category === 'Tools';
  });

  if (softSkillKeywords.length > 0) {
    const matched = softSkillKeywords.filter(k => resumeText.includes(k.toLowerCase()));
    keywordCoverageScore = Math.round((matched.length / softSkillKeywords.length) * 10);
  } else {
    keywordCoverageScore = 5; // Partial if no soft skills to match
  }

  // ── Total & Conversion ──────────────────────────────────────────────────────
  const rawScore = skillMatchScore + experienceScore + projectsScore + titleMatchScore + educationScore + keywordCoverageScore;
  const atsScore = Math.min(100, Math.max(0, rawScore));
  const matchScore = parseFloat((atsScore / 10).toFixed(1));

  // ── Recommendations ─────────────────────────────────────────────────────────
  const recommendations = [];
  if (missingSkills.length > 0) {
    recommendations.push(`Add these missing keywords to your resume: ${missingSkills.slice(0, 4).join(', ')}`);
  }
  if (skillMatchScore < 20) {
    recommendations.push('Your skills section needs more keywords matching this job description');
  }
  if (experienceScore < 15) {
    recommendations.push(`Strengthen your experience section — add more specific responsibilities and achievements`);
  }
  if (projectsScore < 15) {
    recommendations.push('Add relevant projects that demonstrate the required technologies');
  }
  if (titleMatchScore < 6 && targetTitle) {
    recommendations.push(`Consider tailoring your role titles closer to "${jobData?.title || 'the role'}"`);
  }
  if (!summary || summary.length < 50) {
    recommendations.push('Add a strong professional summary that mentions the target role');
  }

  return {
    atsScore,
    matchScore,
    presentSkills,
    missingSkills,
    recommendations,
    scoreBreakdown: {
      skills:          skillMatchScore,
      experience:      experienceScore,
      projects:        projectsScore,
      titleAlignment:  titleMatchScore,
      education:       educationScore,
      keywordCoverage: keywordCoverageScore,
    },
    metadata: {
      yearsOfExperienceEstimated: yearsExp,
      totalJobKeywords: jobSkills.length,
      matchedKeywords:  presentSkills.length,
    }
  };
}

module.exports = { calculateAtsScore };
