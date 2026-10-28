const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  company: {
    type: String,
    required: true,
  },
  location: {
    type: String,
  },
  salary: {
    type: String,
  },
  job_type: {
    type: String,
  },
  skills_required: {
    type: [String],
    default: [],
  },
  description: {
    type: String,
  },
  apply_link: {
    type: String,
  },
  source: {
    type: String,
  },
  experienceLevel: {
    type: String,
  },
  companyLogo: {
    type: String,
  },
  employmentType: {
    type: String,
  },
  deadline: {
    type: String,
  },
  responsibilities: {
    type: [String],
    default: [],
  },
  companyOverview: {
    type: String,
  },
  preferredSkills: {
    type: [String],
    default: [],
  },
  created_at: {
    type: Date,
    default: Date.now,
  }
});

// Create a compound index to ensure title + company uniqueness
jobSchema.index({ title: 1, company: 1 }, { unique: true });

// Create a unique sparse index for apply_link to prevent duplicate URLs
jobSchema.index({ apply_link: 1 }, { unique: true, sparse: true });

// Performance indexes
jobSchema.index({ created_at: -1 });
jobSchema.index({ location: 1 });
jobSchema.index({ source: 1 });
jobSchema.index({ job_type: 1 });
jobSchema.index({ title: 1 });
jobSchema.index({ company: 1 });
jobSchema.index({ skills_required: 1 });

const Job = mongoose.model('Job', jobSchema, 'jobs');

module.exports = Job;
