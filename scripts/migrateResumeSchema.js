/**
 * migrateResumeSchema.js
 * 
 * One-time migration script to populate the new V2 `resumeData` field
 * from legacy fields (optimizedResume, parsedResume, parsed).
 * 
 * SAFE: Read-only on legacy fields. Only writes to `resumeData`.
 * Run once after deploying the new schema:
 *   node backend/scripts/migrateResumeSchema.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Resume = require('../models/Resume');

// ── Normalize any legacy resume shape into V2 resumeData structure ────────────
function normalizeToV2(source) {
  if (!source) return null;

  // Handle both flat and nested personalInfo shapes
  const pi = source.personalInfo || {};
  const fullName = source.fullName || source.name || pi.name || '';
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = pi.firstName || nameParts[0] || '';
  const lastName  = pi.lastName  || nameParts.slice(1).join(' ') || '';

  // Normalize skills — legacy can be flat array or object
  let skills = {
    programming: [],
    frameworks:  [],
    databases:   [],
    cloud:       [],
    devops:      [],
    tools:       [],
    softSkills:  [],
  };

  if (source.skills && typeof source.skills === 'object' && !Array.isArray(source.skills)) {
    // Already categorized
    skills = {
      programming: source.skills.programming || [],
      frameworks:  source.skills.frameworks  || [],
      databases:   source.skills.databases   || [],
      cloud:       source.skills.cloud       || [],
      devops:      source.skills.devops || source.skills.DevOps || [],
      tools:       source.skills.tools  || [],
      softSkills:  source.skills.softSkills || source.skills.SoftSkills || [],
    };
  } else if (Array.isArray(source.skills)) {
    // Flat array — put everything in 'tools' bucket
    skills.tools = source.skills.filter(Boolean);
  }

  // Frameworks may be stored separately
  if (Array.isArray(source.frameworks) && source.frameworks.length > 0) {
    skills.frameworks = [...new Set([...skills.frameworks, ...source.frameworks])];
  }
  if (Array.isArray(source.tools) && source.tools.length > 0) {
    skills.tools = [...new Set([...skills.tools, ...source.tools])];
  }
  if (Array.isArray(source.softSkills) && source.softSkills.length > 0) {
    skills.softSkills = [...new Set([...skills.softSkills, ...source.softSkills])];
  }

  // Normalize experience entries
  const experience = (source.experience || []).map(exp => ({
    id: exp.id || exp._id?.toString() || new mongoose.Types.ObjectId().toString(),
    company:   exp.company || exp.organization || '',
    role:      exp.role || exp.title || exp.position || '',
    location:  exp.location || '',
    startDate: exp.startDate || exp.start_date || exp.duration?.split('–')[0]?.trim() || '',
    endDate:   exp.endDate || exp.end_date || exp.duration?.split('–')[1]?.trim() || '',
    isCurrent: exp.isCurrent || exp.current || false,
    responsibilities: Array.isArray(exp.responsibilities)
      ? exp.responsibilities
      : typeof exp.responsibilities === 'string'
        ? exp.responsibilities.split('\n').map(s => s.replace(/^[-•*]\s*/, '')).filter(Boolean)
        : exp.achievements || [],
  }));

  // Normalize project entries
  const projects = (source.projects || []).map(proj => ({
    id:          proj.id || proj._id?.toString() || new mongoose.Types.ObjectId().toString(),
    name:        proj.name || proj.title || '',
    description: proj.description || '',
    technologies: Array.isArray(proj.technologies) 
      ? proj.technologies 
      : typeof proj.techStack === 'string' 
        ? proj.techStack.split(',').map(s => s.trim()).filter(Boolean) 
        : [],
    github:   proj.github || proj.githubLink || '',
    liveLink: proj.liveLink || proj.link || proj.url || '',
  }));

  // Normalize education entries
  const education = (source.education || []).map(edu => ({
    id:          edu.id || edu._id?.toString() || new mongoose.Types.ObjectId().toString(),
    institution: edu.institution || edu.school || edu.university || '',
    degree:      edu.degree || '',
    field:       edu.field || edu.major || '',
    startDate:   edu.startDate || edu.start_year || '',
    endDate:     edu.endDate || edu.end_year || edu.year || edu.duration || '',
    gpa:         edu.gpa || edu.cgpa || '',
  }));

  // Normalize certifications
  const certifications = (source.certifications || []).map(cert => {
    if (typeof cert === 'string') return { id: new mongoose.Types.ObjectId().toString(), name: cert, issuer: '', date: '', url: '' };
    return {
      id:     cert.id || cert._id?.toString() || new mongoose.Types.ObjectId().toString(),
      name:   cert.name || cert,
      issuer: cert.issuer || cert.organization || '',
      date:   cert.date || '',
      url:    cert.url || cert.credentialUrl || '',
    };
  });

  // Normalize languages
  const languages = (source.languages || []).map(lang => {
    if (typeof lang === 'string') return { language: lang, proficiency: '' };
    return { language: lang.language || lang.name || lang, proficiency: lang.proficiency || lang.level || '' };
  });

  return {
    personalInfo: {
      firstName,
      lastName,
      email:     source.email || pi.email || '',
      phone:     source.phone || pi.phone || '',
      location:  source.location || pi.location || '',
      linkedin:  source.linkedin || pi.linkedin || '',
      github:    source.github || pi.github || '',
      portfolio: source.portfolio || pi.portfolio || '',
      website:   source.website || pi.website || '',
    },
    summary:        source.summary || '',
    experience,
    projects,
    education,
    skills,
    certifications,
    languages,
    achievements:   (source.achievements || []).filter(a => typeof a === 'string'),
  };
}

async function run() {
  console.log('[Migration] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[Migration] Connected.');

  const resumes = await Resume.find({});
  console.log(`[Migration] Found ${resumes.length} resume(s) to process.`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const resume of resumes) {
    try {
      // Skip if already migrated
      if (resume.resumeData && resume.resumeData.personalInfo?.email) {
        console.log(`[Migration] ✓ Resume ${resume._id} already has V2 resumeData — skipping.`);
        skipped++;
        continue;
      }

      // Pick the best source: optimizedResume > parsedResume > parsed
      const source = resume.optimizedResume || resume.parsedResume || resume.parsed;
      if (!source) {
        console.log(`[Migration] ⚠ Resume ${resume._id} has no legacy data to migrate — skipping.`);
        skipped++;
        continue;
      }

      const v2Data = normalizeToV2(source);
      if (!v2Data) {
        console.log(`[Migration] ⚠ Resume ${resume._id} normalization returned null — skipping.`);
        skipped++;
        continue;
      }

      await Resume.findByIdAndUpdate(resume._id, {
        $set: {
          resumeData: v2Data,
          lastSavedAt: new Date(),
        }
      });

      console.log(`[Migration] ✓ Migrated resume ${resume._id} (user: ${resume.user})`);
      migrated++;
    } catch (err) {
      console.error(`[Migration] ✗ Failed for resume ${resume._id}:`, err.message);
      failed++;
    }
  }

  console.log('\n[Migration] Complete.');
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Failed:   ${failed}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('[Migration] Fatal error:', err);
  process.exit(1);
});
