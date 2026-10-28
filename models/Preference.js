const mongoose = require('mongoose');

const preferenceSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true
  },
  domains: [{ type: String }],
  roles: [{ type: String }],
  location: { type: String },
  workPreference: { type: String },
  experienceLevel: { type: String },
  salaryExpectation: { type: String },
  sponsorshipRequired: { type: String },
  skills: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Preference', preferenceSchema);
