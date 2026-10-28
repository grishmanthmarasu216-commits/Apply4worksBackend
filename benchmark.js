const mongoose = require('mongoose');
const Job = require('./models/Job');
const fs = require('fs');
require('dotenv').config({ path: './.env' });

const code = fs.readFileSync('./controllers/jobsController.js', 'utf-8');

const keywordRegex = /const getKeywordsForRole = \(role\) => \{([\s\S]*?)\n\};/g;
const kwMatch = keywordRegex.exec(code);
const getKeywordsForRole = new Function('role', kwMatch[1]);

const scoreRegex = /const calculateDetailedMatchScore = \(job, userPrefs, userCountry\) => \{([\s\S]*?)\n\};/g;
const scoreMatch = scoreRegex.exec(code);
const calculateDetailedMatchScore = new Function('job', 'userPrefs', 'userCountry', 
    `const getKeywordsForRole = ${getKeywordsForRole.toString()};\n` + scoreMatch[1]);

async function benchmark() {
    await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    
    console.time("MongoDB Query (Light)");
    let lightJobs = await Job.find({}).select('_id title company location job_type experienceLevel created_at skills_required apply_link companyLogo source employmentType deadline h1bSponsor').lean();
    console.timeEnd("MongoDB Query (Light)");
    
    console.log(`Total light jobs retrieved: ${lightJobs.length}`);

    console.time("MongoDB Query (Heavy)");
    let rawJobs = await Job.find({}).select('_id title company location job_type experienceLevel created_at skills_required apply_link companyLogo source employmentType deadline h1bSponsor responsibilities preferredSkills requirements description').lean();
    console.timeEnd("MongoDB Query (Heavy)");

    const userPrefs = { roles: ['Software Engineer', 'Backend Developer'], skills: ['React', 'Node.js', 'MongoDB', 'AWS'] };

    console.time("Scoring 4000 jobs");
    for (let i = 0; i < rawJobs.length; i++) {
        calculateDetailedMatchScore(rawJobs[i], userPrefs, 'US');
    }
    console.timeEnd("Scoring 4000 jobs");

    console.time("Sorting 4000 jobs");
    rawJobs.sort((a, b) => {
        const tierA = a.tier || 5;
        const tierB = b.tier || 5;
        if (tierA !== tierB) return tierA - tierB;
        const dateB = b._id && typeof b._id.getTimestamp === 'function' ? b._id.getTimestamp().getTime() : new Date(b?.created_at || 0).getTime();
        const dateA = a._id && typeof a._id.getTimestamp === 'function' ? a._id.getTimestamp().getTime() : new Date(a?.created_at || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        const scoreA = a.matchScore || 0;
        const scoreB = b.matchScore || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return a._id.toString().localeCompare(b._id.toString());
    });
    console.timeEnd("Sorting 4000 jobs");

    mongoose.disconnect();
}
benchmark();
