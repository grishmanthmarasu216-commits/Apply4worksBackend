const mongoose = require('mongoose');

// ── Unified Resume Data Schema ─────────────────────────────────────────────────
// V2: Single source of truth. Legacy fields preserved for backward compatibility.
const resumeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },

  // File metadata
  fileName: { type: String, default: '' },
  fileType: { type: String, default: '' },   // pdf | docx | doc | scratch
  filePath: { type: String, default: '' },   // local path (empty for scratch)
  rawText:  { type: String, default: '' },

  // ── V2: Unified Resume Data (single source of truth) ──────────────────────
  resumeData: {
    personalInfo: {
      firstName:  { type: String, default: '' },
      lastName:   { type: String, default: '' },
      email:      { type: String, default: '' },
      phone:      { type: String, default: '' },
      location:   { type: String, default: '' },
      linkedin:   { type: String, default: '' },
      github:     { type: String, default: '' },
      portfolio:  { type: String, default: '' },
      website:    { type: String, default: '' },
    },
    summary: { type: String, default: '' },
    experience: [{
      _id:             false,
      id:              { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      company:         { type: String, default: '' },
      role:            { type: String, default: '' },
      location:        { type: String, default: '' },
      startDate:       { type: String, default: '' },
      endDate:         { type: String, default: '' },
      isCurrent:       { type: Boolean, default: false },
      responsibilities: [{ type: String }],
    }],
    projects: [{
      _id:          false,
      id:           { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      name:         { type: String, default: '' },
      description:  { type: String, default: '' },
      technologies: [{ type: String }],
      github:       { type: String, default: '' },
      liveLink:     { type: String, default: '' },
    }],
    education: [{
      _id:         false,
      id:          { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      institution: { type: String, default: '' },
      degree:      { type: String, default: '' },
      field:       { type: String, default: '' },
      startDate:   { type: String, default: '' },
      endDate:     { type: String, default: '' },
      gpa:         { type: String, default: '' },
    }],
    skills: {
      programming: [{ type: String }],
      frameworks:  [{ type: String }],
      databases:   [{ type: String }],
      cloud:       [{ type: String }],
      devops:      [{ type: String }],
      tools:       [{ type: String }],
      softSkills:  [{ type: String }],
    },
    certifications: [{
      _id:    false,
      id:     { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      name:   { type: String, default: '' },
      issuer: { type: String, default: '' },
      date:   { type: String, default: '' },
      url:    { type: String, default: '' },
    }],
    languages: [{
      _id:         false,
      language:    { type: String, default: '' },
      proficiency: { type: String, default: '' }, // Beginner | Intermediate | Fluent | Native
    }],
    achievements: [{ type: String }],
  },

  // ── V2: Version History (replaces old versionHistory) ─────────────────────
  versionHistory: [{
    _id:          { type: mongoose.Schema.Types.ObjectId, auto: true },
    timestamp:    { type: Date, default: Date.now },
    jobId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
    jobTitle:     { type: String, default: '' },
    resumeData:   { type: mongoose.Schema.Types.Mixed },
    atsScore:     { type: Number, default: 0 },
    label:        { type: String, default: '' }, // e.g. "Before optimization" or custom
  }],

  // ── V2: Optimization History ───────────────────────────────────────────────
  optimizationHistory: [{
    _id:                    { type: mongoose.Schema.Types.ObjectId, auto: true },
    timestamp:              { type: Date, default: Date.now },
    jobId:                  { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
    jobTitle:               { type: String, default: '' },
    sectionsOptimized:      [{ type: String }],
    keywordsUsed:           [{ type: String }],
    scoreBeforeOptimization: { type: Number, default: 0 },
    scoreAfterOptimization:  { type: Number, default: 0 },
  }],

  // ── V2: Analysis History ───────────────────────────────────────────────────
  analysisHistory: [{
    _id:             { type: mongoose.Schema.Types.ObjectId, auto: true },
    timestamp:       { type: Date, default: Date.now },
    jobId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
    jobTitle:        { type: String, default: '' },
    atsScore:        { type: Number, default: 0 },
    matchScore:      { type: Number, default: 0 }, // 0–10
    scoreBreakdown:  { type: mongoose.Schema.Types.Mixed, default: {} },
    matchedKeywords: [{ type: String }],
    missingKeywords: [{ type: String }],
  }],

  // ── Template & State ──────────────────────────────────────────────────────
  template: { type: String, default: 'Modern ATS' },
  lastSavedAt:     { type: Date, default: null },
  lastOptimizedAt: { type: Date, default: null },

  // ── LEGACY FIELDS (preserved for backward compatibility, read-only in V2) ──
  // These fields will not be written by new V2 code but are preserved so
  // existing user data is not lost during migration.
  parsed:          { type: mongoose.Schema.Types.Mixed, default: null },
  parsedResume:    { type: mongoose.Schema.Types.Mixed, default: null },
  optimizedResume: { type: mongoose.Schema.Types.Mixed, default: null },
  originalParsed:  { type: mongoose.Schema.Types.Mixed, default: null },
  userEdited:      { type: mongoose.Schema.Types.Mixed, default: null },
  jobMatchData: {
    atsScore:         { type: Number, default: 0 },
    matchedKeywords:  [{ type: String }],
    missingKeywords:  [{ type: String }],
    selectedKeywords: [{ type: String }],
  },

}, { timestamps: true });

module.exports = mongoose.model('Resume', resumeSchema);
