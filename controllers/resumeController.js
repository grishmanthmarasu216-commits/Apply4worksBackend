/**
 * resumeController.js V2
 * Complete rewrite — unified resumeData, proper error handling, full feature set.
 */

const path    = require('path');
const fs      = require('fs');
const pdfParse = require('pdf-parse');
const mammoth  = require('mammoth');
const Resume   = require('../models/Resume');
const User     = require('../models/User');
const { parseResumeAdvanced }   = require('../services/resumeParser');
const { extractKeywordsFromText } = require('../services/keywordExtractor');
const { calculateAtsScore }       = require('../services/atsScoringEngine');
const {
  optimizeEntireResume,
  optimizeSingleSection,
  generateCoverLetter,
  generateAiSuggestion,
} = require('../services/resumeAiEnhancer');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Ensures a resume document exists or creates an empty one for the user.
 */
async function getOrCreateResume(userId) {
  let resume = await Resume.findOne({ user: userId });
  if (!resume) {
    resume = await Resume.create({
      user: userId,
      fileName: 'scratch',
      fileType: 'scratch',
      filePath: '',
      resumeData: {
        personalInfo: {},
        summary: '',
        experience: [],
        projects: [],
        education: [],
        skills: { programming: [], frameworks: [], databases: [], cloud: [], devops: [], tools: [], platforms: [], softSkills: [] },
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
      },
    });
    await User.findByIdAndUpdate(userId, { resume: resume._id });
  }
  return resume;
}

/**
 * Normalize any legacy/AI-parsed shape into V2 resumeData
 */
function normalizeToV2(source) {
  if (!source) return null;

  const pi = source.personalInfo || {};
  const fullName = source.fullName || source.name || pi.name || '';
  const nameParts = fullName.trim().split(/\s+/);

    const experience = (source.experience || []).map((exp, i) => {
    let bullets = [];
    if (Array.isArray(exp.responsibilities)) {
      bullets = exp.responsibilities;
    } else if (typeof exp.responsibilities === 'string') {
      bullets = exp.responsibilities.split('\n').map(s => s.replace(/^[-•*]\s*/, '')).filter(Boolean);
    } else if (Array.isArray(exp.achievements)) {
      bullets = exp.achievements;
    } else if (typeof exp.description === 'string') {
      bullets = exp.description.split('\n').map(s => s.replace(/^[-•*]\s*/, '')).filter(Boolean);
    }
    
    return {
      id: exp.id || `exp-${i}`,
      company:   exp.company || exp.organization || '',
      role:      exp.role || exp.title || exp.position || '',
      location:  exp.location || '',
      startDate: exp.startDate || exp.start_date || '',
      endDate:   exp.isCurrent ? '' : (exp.endDate || exp.end_date || ''),
      isCurrent: exp.isCurrent || exp.current || false,
      responsibilities: bullets,
    };
  });

  const projects = (source.projects || []).map((proj, i) => {
    let desc = proj.description || '';
    if (Array.isArray(desc)) {
      desc = desc.join('\n'); // Ensure bullet array is kept as string or mapped correctly. Wait, template expects string for description? 
      // V2 templates render `proj.description` as a paragraph or map it if it's bullets. Let's keep it string for now as per previous logic.
    }
    return {
      id:          proj.id || `proj-${i}`,
      name:        proj.name || proj.title || '',
      description: desc,
      technologies: Array.isArray(proj.technologies) ? proj.technologies
        : typeof proj.techStack === 'string' ? proj.techStack.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      github:   proj.github || proj.githubLink || '',
      liveLink: proj.liveLink || proj.link || proj.url || '',
    };
  });

  const education = (source.education || []).map((edu, i) => ({
    id:          edu.id || `edu-${i}`,
    institution: edu.institution || edu.school || edu.university || '',
    degree:      edu.degree || '',
    branch:      edu.branch || edu.field || edu.major || '',
    location:    edu.location || '',
    startDate:   edu.startDate || edu.start_year || '',
    endDate:     edu.endDate || edu.end_year || edu.year || '',
    duration:    edu.duration || '',
    gpa:         edu.gpa || edu.cgpa || '',
  }));

  // Handle skills
  let skills = { programming: [], frameworks: [], databases: [], cloud: [], devops: [], tools: [], softSkills: [] };
  if (source.skills && typeof source.skills === 'object' && !Array.isArray(source.skills)) {
    skills = {
      programming: source.skills.programming || [],
      frameworks:  source.skills.frameworks  || source.skills.Frameworks || [],
      databases:   source.skills.databases   || source.skills.Databases  || [],
      cloud:       source.skills.cloud       || source.skills.Cloud      || [],
      devops:      source.skills.devops      || source.skills.DevOps     || [],
      tools:       source.skills.tools       || source.skills.Tools      || [...(source.tools || [])],
      softSkills:  source.skills.softSkills  || source.skills.SoftSkills || [...(source.softSkills || [])],
    };
  } else if (Array.isArray(source.skills)) {
    skills.tools = source.skills.filter(Boolean);
    if (Array.isArray(source.frameworks)) skills.frameworks = source.frameworks;
    if (Array.isArray(source.tools)) skills.tools = [...new Set([...skills.tools, ...source.tools])];
    if (Array.isArray(source.softSkills)) skills.softSkills = source.softSkills;
  }

  const certifications = (source.certifications || []).map((cert, i) => {
    if (typeof cert === 'string') return { id: `cert-${i}`, name: cert, issuer: '', date: '', url: '' };
    return { id: cert.id || `cert-${i}`, name: cert.name || '', issuer: cert.issuer || '', date: cert.date || '', url: cert.url || '' };
  });

  const languages = (source.languages || []).map(lang => {
    if (typeof lang === 'string') return { language: lang, proficiency: '' };
    return { language: lang.language || lang.name || '', proficiency: lang.proficiency || lang.level || '' };
  });

  return {
    personalInfo: {
      firstName:  pi.firstName || nameParts[0] || '',
      lastName:   pi.lastName  || nameParts.slice(1).join(' ') || '',
      professionalTitle: source.professionalTitle || pi.professionalTitle || '',
      email:      source.email || pi.email || '',
      phone:      source.phone || pi.phone || '',
      location:   source.location || pi.location || '',
      linkedin:   source.linkedin || pi.linkedin || '',
      github:     source.github   || pi.github   || '',
      portfolio:  source.portfolio || pi.portfolio || '',
      website:    source.website   || pi.website   || '',
    },
    summary: source.summary || '',
    experience,
    projects,
    education,
    skills,
    certifications,
    languages,
    achievements: (source.achievements || []).filter(a => typeof a === 'string'),
    internships: source.internships || [],
    research: source.research || [],
    publications: source.publications || [],
    awards: source.awards || [],
    volunteering: source.volunteering || [],
    extracurricular: source.extracurricular || [],
    hackathons: source.hackathons || [],
    codingProfiles: source.codingProfiles || { leetcode: '', codeforces: '', codechef: '', hackerrank: '', geeksforgeeks: '' },
    interests: source.interests || [],
  };
}

// ── POST /api/resume/upload ────────────────────────────────────────────────────
async function uploadResume(req, res) {
  const filePath = req.file?.path;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const { originalname, path: fp, size } = req.file;
    const ext = path.extname(originalname).toLowerCase();
    const allowed = ['.pdf', '.doc', '.docx'];

    if (!allowed.includes(ext)) {
      try { fs.unlinkSync(fp); } catch {}
      return res.status(400).json({ success: false, code: 'UNSUPPORTED_FILE',
        message: `Unsupported file type "${ext || 'unknown'}". Please upload a PDF, DOC, or DOCX file.` });
    }
    if (size > 10 * 1024 * 1024) {
      try { fs.unlinkSync(fp); } catch {}
      return res.status(400).json({ success: false, code: 'FILE_TOO_LARGE',
        message: `File is too large (${(size / (1024*1024)).toFixed(1)} MB). Maximum allowed size is 10 MB.` });
    }

    // 1. Extract raw text
    let rawText = '';
    let extractionError = null;
    try {
      if (ext === '.pdf') {
        const fileBuffer = fs.readFileSync(fp);
        const parsed = await pdfParse(fileBuffer);
        rawText = parsed.text || '';
        // Detect password-protected PDFs (pdfParse returns empty text)
        if (!rawText.trim() && parsed.numpages > 0) {
          extractionError = { code: 'PASSWORD_PROTECTED',
            message: 'Resume parsing failed because the PDF appears to be password-protected. Please remove the password and try again.' };
        }
      } else {
        rawText = (await mammoth.extractRawText({ path: fp })).value || '';
      }
    } catch (e) {
      console.error('[Upload] Text extraction failed:', e.message);
      extractionError = { code: 'EXTRACTION_FAILED',
        message: `Resume parsing failed: could not read file contents. ${e.message}` };
    }

    if (extractionError && !rawText.trim()) {
      try { fs.unlinkSync(fp); } catch {}
      return res.status(422).json({ success: false, ...extractionError });
    }

    // 2. Parse structured fields
    let parsedData = null;
    let fieldConfidence = {};
    let usedGemini = false;
    try {
      const parseResult = await parseResumeAdvanced(fp, rawText);
      parsedData = parseResult.parsed;
      fieldConfidence = parseResult.fieldConfidence || {};
      usedGemini = parseResult.usedGemini || false;

      console.log('[Upload] Parser success:');
      console.log('  - Name:', `${parsedData?.personalInfo?.firstName || ''} ${parsedData?.personalInfo?.lastName || ''}`.trim() || '(empty)');
      console.log('  - Email:', parsedData?.personalInfo?.email || '(empty)');
      console.log('  - Experience entries:', (parsedData?.experience || []).length);
      console.log('  - Education entries:', (parsedData?.education || []).length);
      console.log('  - Skills count:', Object.values(parsedData?.skills || {}).flat().length);
      console.log('  - Used Gemini:', usedGemini);
    } catch (parseErr) {
      console.error('[Upload] Parser error:', parseErr.message);
      console.error('[Upload] Error code:', parseErr.code || 'UNKNOWN');

      const code = parseErr.code || 'PARSE_FAILED';

      // Map known error codes to user-friendly messages
      const errorMessages = {
        PASSWORD_PROTECTED: 'Your PDF appears to be password-protected. Please remove the password and re-upload.',
        PDF_EXTRACTION_FAILED: `Could not read your PDF file: ${parseErr.message}`,
        DOCX_EXTRACTION_FAILED: `Could not read your DOCX file: ${parseErr.message}`,
        NO_TEXT_EXTRACTED: 'No readable text was found in your file. If this is a scanned image, please use a text-based PDF.',
        GEMINI_FAILED: `AI parsing failed: ${parseErr.message}. Please try again.`,
        UNSUPPORTED_FORMAT: parseErr.message,
        PARSER_TIMEOUT: 'Resume parsing timed out. Please try again with a simpler PDF.',
      };

      try { fs.unlinkSync(fp); } catch {}
      return res.status(422).json({
        success: false,
        code,
        message: errorMessages[code] || `Resume parsing failed: ${parseErr.message}`,
      });
    }

    // ── Normalize to V2 ───────────────────────────────────────────────────────
    const resumeData = normalizeToV2(parsedData || {});

    // Fallback: extract email from raw text if parser missed it
    if (!resumeData.personalInfo.email && rawText) {
      const emailMatch = rawText.match(/[\w.%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        resumeData.personalInfo.email = emailMatch[0];
        console.log('[Upload] Email recovered from raw text:', emailMatch[0]);
      }
    }

    // ── Save to database ──────────────────────────────────────────────────────
    const userId = req.user._id;
    console.log('[Upload] Saving to database for user:', userId);

    const resume = await Resume.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          user: userId,
          fileName: originalname,
          fileType: ext.replace('.', ''),
          filePath: fp,
          rawText: rawText.substring(0, 10000), // limit stored rawText
          resumeData,
          lastSavedAt: new Date(),
          // Reset histories on fresh upload
          versionHistory: [],
          optimizationHistory: [],
          analysisHistory: [],
          // Legacy compatibility
          parsedResume: parsedData,
          optimizedResume: parsedData,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await User.findByIdAndUpdate(userId, { resume: resume._id });
    console.log('[Upload] Saved successfully. Resume ID:', resume._id);
    console.log('[Upload] ─────────────────────────────────────────');

    return res.status(200).json({
      success: true,
      message: 'Resume uploaded and parsed successfully.',
      resume: {
        id:         resume._id,
        fileName:   resume.fileName,
        fileType:   resume.fileType,
        resumeData: resume.resumeData,
      },
      fieldConfidence,
      usedGemini,
    });

  } catch (err) {
    if (filePath) { try { fs.unlinkSync(filePath); } catch {} }
    console.error('[Upload] Unexpected error:', err.message);
    console.error('[Upload] Stack:', err.stack);

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        code: 'FILE_TOO_LARGE',
        message: 'File is too large. Maximum allowed size is 10 MB.',
      });
    }
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: `Upload failed: ${err.message}. Please try again.`,
    });
  }
}

// ── GET /api/resume/me ─────────────────────────────────────────────────────────
async function getMyResume(req, res) {
  try {
    let resume = await Resume.findOne({ user: req.user._id }).select('-rawText -filePath');
    if (!resume) {
      // Return empty resume structure for scratch builders
      return res.json({
        success: true,
        resume: null,
        isEmpty: true,
      });
    }

    // If V2 data missing but legacy data exists, normalize on-the-fly
    if (!resume.resumeData?.personalInfo?.email) {
      const source = resume.optimizedResume || resume.parsedResume || resume.parsed;
      if (source) {
        const v2Data = normalizeToV2(source);
        if (v2Data) {
          resume.resumeData = v2Data;
          // Save the normalized data for next time (non-blocking)
          Resume.findByIdAndUpdate(resume._id, { $set: { resumeData: v2Data } }).catch(() => {});
        }
      }
    }

    return res.json({ success: true, resume });
  } catch (err) {
    console.error('[GetResume] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── PUT /api/resume/save ───────────────────────────────────────────────────────
async function saveResume(req, res) {
  try {
    const { resumeData, template } = req.body;
    if (!resumeData) {
      return res.status(400).json({ success: false, message: 'resumeData is required.' });
    }

    const update = { resumeData, lastSavedAt: new Date() };
    if (template) update.template = template;

    let resume = await Resume.findOneAndUpdate(
      { user: req.user._id },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (!resume.fileName) {
      await Resume.findByIdAndUpdate(resume._id, { fileName: 'scratch', fileType: 'scratch' });
    }

    await User.findByIdAndUpdate(req.user._id, { resume: resume._id });

    return res.json({ success: true, message: 'Resume saved.', lastSavedAt: resume.lastSavedAt });
  } catch (err) {
    console.error('[SaveResume] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error during save.' });
  }
}

// ── POST /api/resume/analyze-job ──────────────────────────────────────────────
async function analyzeJob(req, res) {
  try {
    const { jobId, jobDescription, jobTitle, experienceLevel } = req.body;
    if (!jobDescription) {
      return res.status(400).json({ success: false, message: 'jobDescription is required.' });
    }

    const resume = await Resume.findOne({ user: req.user._id });
    const resumeData = resume?.resumeData
      || normalizeToV2(resume?.optimizedResume || resume?.parsedResume)
      || null;

    if (!resumeData) {
      return res.status(400).json({ success: false, message: 'No resume found. Please build or upload your resume first.' });
    }

    const extractedCategories = extractKeywordsFromText(jobDescription);
    const jobData = {
      title: jobTitle || '',
      experienceLevel: experienceLevel || '',
      description: jobDescription,
    };
    const atsData = calculateAtsScore(resumeData, extractedCategories, jobData);

    // Save to analysis history (non-blocking)
    if (resume) {
      Resume.findByIdAndUpdate(resume._id, {
        $push: {
          analysisHistory: {
            $each: [{
              jobId: jobId || null,
              jobTitle: jobTitle || '',
              atsScore: atsData.atsScore,
              matchScore: atsData.matchScore,
              scoreBreakdown: atsData.scoreBreakdown,
              matchedKeywords: atsData.presentSkills,
              missingKeywords: atsData.missingSkills,
            }],
            $slice: -20, // Keep last 20 analyses
          }
        }
      }).catch(() => {});
    }

    // Flatten atsData fields to top-level for frontend compatibility
    return res.json({
      success: true,
      atsScore:        atsData.atsScore         || 0,
      matchScore:      atsData.matchScore        || 0,
      matchedKeywords: atsData.presentSkills     || [],
      missingKeywords: atsData.missingSkills     || [],
      suggestions:     atsData.recommendations   || atsData.suggestions || [],
      scoreBreakdown:  atsData.scoreBreakdown    || {},
      extractedCategories,
      atsData, // keep full object for backward compat
    });
  } catch (err) {
    console.error('[AnalyzeJob] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error analyzing job.' });
  }
}

// ── POST /api/resume/optimize ─────────────────────────────────────────────────
async function optimizeResume(req, res) {
  try {
    const { jobId, jobDescription, jobTitle, selectedKeywords, sectionsToOptimize } = req.body;

    if (!jobDescription) {
      return res.status(400).json({ success: false, message: 'jobDescription is required.' });
    }

    const resume = await Resume.findOne({ user: req.user._id });
    if (!resume) {
      return res.status(400).json({ success: false, message: 'No resume found.' });
    }

    const sourceResume = resume.resumeData
      || normalizeToV2(resume.optimizedResume || resume.parsedResume);

    if (!sourceResume) {
      return res.status(400).json({ success: false, message: 'No resume data found to optimize.' });
    }

    const keywords = Array.isArray(selectedKeywords) && selectedKeywords.length > 0
      ? selectedKeywords
      : [];
    const sections = Array.isArray(sectionsToOptimize) && sectionsToOptimize.length > 0
      ? sectionsToOptimize
      : ['summary', 'skills', 'experience', 'projects'];

    // Score before optimization
    const extractedCategories = extractKeywordsFromText(jobDescription);
    const jobData = { title: jobTitle || '', description: jobDescription };
    const beforeAts = calculateAtsScore(sourceResume, extractedCategories, jobData);

    // Run AI optimization
    const newResumeData = await optimizeEntireResume(
      sourceResume, jobDescription, keywords, sections
    );

    // Score after optimization
    const afterAts = calculateAtsScore(newResumeData, extractedCategories, jobData);

    // Save: push old version to history, update resumeData
    const historyEntry = {
      jobId: jobId || null,
      jobTitle: jobTitle || '',
      resumeData: sourceResume,
      atsScore: beforeAts.atsScore,
      label: `Before optimization for ${jobTitle || 'job'}`,
    };

    const optimizationEntry = {
      jobId: jobId || null,
      jobTitle: jobTitle || '',
      sectionsOptimized: sectionsToOptimize,
      keywordsUsed: selectedKeywords,
      scoreBeforeOptimization: beforeAts.atsScore,
      scoreAfterOptimization: afterAts.atsScore,
    };

    await Resume.findByIdAndUpdate(resume._id, {
      $set: {
        resumeData: newResumeData,
        lastOptimizedAt: new Date(),
        // Keep legacy field in sync
        optimizedResume: newResumeData,
      },
      $push: {
        versionHistory: { $each: [historyEntry], $slice: -50 },
        optimizationHistory: { $each: [optimizationEntry], $slice: -50 },
      },
    });

    return res.json({
      success: true,
      optimizedResume: newResumeData,   // primary field — frontend checks this
      resumeData: newResumeData,         // alias for any other consumers
      atsData: afterAts,
      scoreDelta: afterAts.atsScore - beforeAts.atsScore,
      scoreBefore: beforeAts.atsScore,
      scoreAfter: afterAts.atsScore,
    });
  } catch (err) {
    console.error('[OptimizeResume] Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error during optimization.' });
  }
}

// ── POST /api/resume/optimize-section ─────────────────────────────────────────
async function optimizeSection(req, res) {
  try {
    const { sectionName, sectionData, context } = req.body;
    if (!sectionName || sectionData === undefined) {
      return res.status(400).json({ success: false, message: 'sectionName and sectionData are required.' });
    }

    const improvedSection = await optimizeSingleSection(sectionName, sectionData, context || {});
    return res.json({ success: true, improvedSection });
  } catch (err) {
    console.error('[OptimizeSection] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error during section optimization.' });
  }
}

// ── POST /api/resume/ai-suggest ───────────────────────────────────────────────
async function aiSuggest(req, res) {
  try {
    const { instruction, sectionName, sectionData, context } = req.body;
    if (!instruction || !sectionName || sectionData === undefined) {
      return res.status(400).json({ success: false, message: 'instruction, sectionName, and sectionData are required.' });
    }

    const result = await generateAiSuggestion(instruction, sectionName, sectionData, context || {});
    return res.json({ success: true, result });
  } catch (err) {
    console.error('[AiSuggest] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error processing AI suggestion.' });
  }
}

// ── POST /api/resume/generate-cover-letter ────────────────────────────────────
async function generateCoverLetterHandler(req, res) {
  try {
    const { jobId, jobTitle, jobDescription, company, tone } = req.body;

    const resume = await Resume.findOne({ user: req.user._id });
    const resumeData = resume?.resumeData
      || normalizeToV2(resume?.optimizedResume || resume?.parsedResume);

    if (!resumeData) {
      return res.status(400).json({ success: false, message: 'No resume found. Build your resume first.' });
    }

    const jobData = { title: jobTitle || '', company: company || '', description: jobDescription || '' };
    const coverLetter = await generateCoverLetter(resumeData, jobData, tone || 'professional');

    return res.json({ success: true, coverLetter });
  } catch (err) {
    console.error('[CoverLetter] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error generating cover letter.' });
  }
}

// ── POST /api/resume/restore-version ─────────────────────────────────────────
async function restoreVersion(req, res) {
  try {
    const { versionId } = req.body;
    if (!versionId) {
      return res.status(400).json({ success: false, message: 'versionId is required.' });
    }

    const resume = await Resume.findOne({ user: req.user._id });
    if (!resume) {
      return res.status(404).json({ success: false, message: 'Resume not found.' });
    }

    const version = resume.versionHistory.id(versionId);
    if (!version) {
      return res.status(404).json({ success: false, message: 'Version not found.' });
    }

    // Save current state before restoring
    const currentEntry = {
      jobId:      null,
      jobTitle:   '',
      resumeData: resume.resumeData,
      atsScore:   0,
      label:      'Before version restore',
    };

    resume.versionHistory.push(currentEntry);
    resume.resumeData      = version.resumeData;
    resume.optimizedResume = version.resumeData; // keep legacy in sync
    await resume.save();

    return res.json({ success: true, resumeData: resume.resumeData });
  } catch (err) {
    console.error('[RestoreVersion] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error restoring version.' });
  }
}

// ── PUT /api/resume/edit (legacy compat) ──────────────────────────────────────
async function editUserResume(req, res) {
  try {
    const { editedResume } = req.body;
    if (!editedResume) {
      return res.status(400).json({ success: false, message: 'editedResume is required.' });
    }
    // Normalize to V2 if it looks like a legacy flat object
    const resumeData = editedResume.personalInfo ? editedResume : normalizeToV2(editedResume);

    const resume = await Resume.findOneAndUpdate(
      { user: req.user._id },
      { $set: { resumeData, optimizedResume: editedResume, lastSavedAt: new Date() } },
      { new: true }
    );

    if (!resume) {
      return res.status(404).json({ success: false, message: 'Resume not found.' });
    }
    return res.json({ success: true, message: 'Resume saved.', resume });
  } catch (err) {
    console.error('[EditResume] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error during edit.' });
  }
}

// ── GET /api/resume/versions ──────────────────────────────────────────────────
async function listVersions(req, res) {
  try {
    const resume = await Resume.findOne({ user: req.user._id }).select('versionHistory');
    if (!resume) return res.json({ success: true, versions: [] });
    // Return newest-first, capped at 50
    const versions = (resume.versionHistory || []).slice(-50).reverse().map(v => ({
      _id:       v._id,
      label:     v.label || '',
      timestamp: v.timestamp,
      jobTitle:  v.jobTitle || '',
      atsScore:  v.atsScore || 0,
    }));
    return res.json({ success: true, versions });
  } catch (err) {
    console.error('[ListVersions] Error:', err);
    return res.status(500).json({ success: false, message: 'Could not load version history. Please refresh and try again.' });
  }
}

// ── POST /api/resume/versions/save ────────────────────────────────────────────
async function saveVersion(req, res) {
  try {
    const { label } = req.body;
    const resume = await Resume.findOne({ user: req.user._id });
    if (!resume) {
      return res.status(404).json({ success: false, message: 'No resume found. Please create your resume first.' });
    }
    const entry = {
      jobId:      null,
      jobTitle:   '',
      resumeData: resume.resumeData,
      atsScore:   0,
      label:      label || `Manual save — ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    };
    await Resume.findByIdAndUpdate(resume._id, {
      $push: { versionHistory: { $each: [entry], $slice: -50 } },
    });
    return res.json({ success: true, message: 'Version saved.' });
  } catch (err) {
    console.error('[SaveVersion] Error:', err);
    return res.status(500).json({ success: false, message: 'Could not save version. Please try again.' });
  }
}

// ── DELETE /api/resume/versions/:id ──────────────────────────────────────────
async function deleteVersion(req, res) {
  try {
    const { id } = req.params;
    await Resume.findOneAndUpdate(
      { user: req.user._id },
      { $pull: { versionHistory: { _id: id } } }
    );
    return res.json({ success: true, message: 'Version deleted.' });
  } catch (err) {
    console.error('[DeleteVersion] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── POST /api/resume/test-parse (dev diagnostics only) ───────────────────────
async function testParse(req, res) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, message: 'Not found.' });
  }
  try {
    const { rawText } = req.body;
    if (!rawText) {
      return res.status(400).json({ success: false, message: 'rawText is required.' });
    }
    const { parseResumeAdvanced } = require('../services/resumeParser');
    // Write text to a temp file so we can reuse parseResumeAdvanced
    const os   = require('os');
    const tmpPath = require('path').join(os.tmpdir(), `test-parse-${Date.now()}.txt`);
    require('fs').writeFileSync(tmpPath, rawText, 'utf8');
    const result = await parseResumeAdvanced(tmpPath, rawText);
    try { require('fs').unlinkSync(tmpPath); } catch {}
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(422).json({ success: false, code: err.code || 'PARSE_ERROR', message: err.message });
  }
}

module.exports = {
  uploadResume,
  getMyResume,
  saveResume,
  editUserResume,
  analyzeJob,
  optimizeResume,
  optimizeSection,
  aiSuggest,
  generateCoverLetterHandler,
  restoreVersion,
  listVersions,
  deleteVersion,
  saveVersion,
  testParse,
};
