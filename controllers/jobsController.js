const Job = require('../models/Job');
const apifyService = require('../services/apifyService');
const mongoose = require('mongoose');

const Preference = require('../models/Preference');
const Application = require('../models/Application');
const SavedJob = require('../models/SavedJob');
const crypto = require('crypto');

const DEBUG_MODE = process.env.DEBUG_MODE === "true";

// Global Caching Mechanism
const recommendationCache = new Map();
let globalJobsVersion = Date.now();

let GLOBAL_JOBS_CACHE = [];
let isCacheInitializing = false;

exports.initializeJobsCache = async () => {
    if (isCacheInitializing) return;
    isCacheInitializing = true;
    try {
        console.log("[JobsCache] Loading all jobs into memory...");
        console.time("jobs-cache-load");
        // We load the heavy fields ONCE into memory.
        const allJobs = await Job.find({}).lean();
        GLOBAL_JOBS_CACHE = allJobs;
        console.timeEnd("jobs-cache-load");
        console.log(`[JobsCache] Successfully loaded ${GLOBAL_JOBS_CACHE.length} jobs.`);
    } catch (err) {
        console.error("[JobsCache] Error loading jobs:", err);
    } finally {
        isCacheInitializing = false;
    }
};

exports.addNewJobsToCache = (newJobsArray) => {
    if (!newJobsArray || newJobsArray.length === 0) return;
    GLOBAL_JOBS_CACHE.push(...newJobsArray);
    exports.incrementJobsVersion();
    console.log(`[JobsCache] Appended ${newJobsArray.length} new jobs. Total jobs in memory: ${GLOBAL_JOBS_CACHE.length}`);
};

exports.incrementJobsVersion = () => {
    globalJobsVersion = Date.now();
    if (DEBUG_MODE) console.log("[Cache] Invalidation Triggered by new jobs");
};

const getKeywordsForRole = (role) => {
    const r = role.toLowerCase();
    
    // Core Engineering
    if (r.includes('mechanical')) return ['mechanical', 'mechanical engineer', 'mechanical field engineer', 'mechanical project engineer', 'mechanical reliability engineer', 'mechanical maintenance engineer', 'mechanical design engineer', 'commissioning engineer', 'building engineer', 'datacenter mechanical'];
    if (r.includes('civil')) return ['civil', 'civil engineer', 'site engineer', 'structural engineer', 'design engineer', 'land development engineer', 'transportation engineer', 'construction engineer', 'environmental design engineer'];
    
    // Software & QA
    if (r.includes('qa') || r.includes('quality assurance')) return ['qa', 'quality assurance', 'qa engineer', 'qa analyst', 'test engineer', 'software tester', 'automation tester', 'sdet', 'automation testing specialist'];
    if (r.includes('frontend') || r.includes('front-end')) return ['frontend', 'front-end', 'frontend developer', 'frontend engineer', 'react', 'reactjs', 'javascript', 'typescript', 'ui developer', 'web developer'];
    if (r.includes('software')) return ['software engineer', 'software developer', 'backend developer', 'backend engineer', 'full stack', 'full-stack', 'programmer', 'application developer', 'platform engineer', 'systems engineer', 'application engineer'];
    
    // Infrastructure & Network
    if (r.includes('network')) return ['network', 'network engineer', 'network administrator', 'network analyst', 'infrastructure engineer', 'noc engineer', 'systems network engineer', 'networking', 'infrastructure', 'systems', 'system administrator', 'datacenter', 'cloud infrastructure', 'noc'];
    
    // Business & Data Analysts
    if (r.includes('business analyst')) return ['business analyst', 'business systems analyst', 'strategy analyst', 'functional analyst', 'operations analyst', 'process analyst', 'consulting analyst', 'product analyst', 'solutions analyst', 'business intelligence'];
    if (r.includes('data analyst')) return ['data analyst', 'data analysis', 'business intelligence', 'bi analyst', 'sql analyst', 'reporting analyst', 'insights analyst', 'analytics consultant', 'data specialist'];
    
    // Data & Cyber
    if (r.includes('cybersecurity') || r.includes('security')) return ['cybersecurity', 'security engineer', 'information security', 'infosec', 'cyber security', 'soc analyst', 'penetration tester', 'security analyst'];
    
    // Fallback
    const core = r.replace(/engineer|developer|manager|analyst|specialist|consultant|architect|designer/ig, '').trim();
    let keywords = [r];
    if (core.length > 2) keywords.push(core);
    return keywords;
};

const calculateDetailedMatchScore = (job, userPrefs, userCountry) => {
    let bestScore = 0;
    let bestKeywords = [];
    let bestReason = "Fair Match";
    let bestFallbackStage = "Step 5: Related role matches";

    if (!userPrefs || !userPrefs.roles || userPrefs.roles.length === 0) {
        return { score: 50, matchedKeywords: [], matchReason: "General Match", fallbackStage: bestFallbackStage };
    }

    const jobTitle = (job.title || '').toLowerCase();
    const jobSkills = Array.isArray(job.skills_required) ? job.skills_required.map(s=>s.toLowerCase()) : (typeof job.skills_required === 'string' ? job.skills_required.toLowerCase().split(',').map(s=>s.trim()) : []);
    const desc = (job.description || '').toLowerCase();
    const reqs = (job.requirements || '').toLowerCase();
    const userSkills = (userPrefs.skills || []).map(s => s.toLowerCase());
    const jobLoc = (job.location || '').toLowerCase();
    const prefCountry = (userCountry || '').toLowerCase();
    const jobType = (job.job_type || '').toLowerCase();
    const prefType = (userPrefs.workMode || '').toLowerCase();
    const userExp = (userPrefs.experienceLevel || '').toLowerCase();
    const jobExp = (job.experienceLevel || '').toLowerCase();

    for (const r of userPrefs.roles) {
        const keywords = getKeywordsForRole(r);
        let currentScore = 0;
        let matchedKw = [];
        let fallbackStage = "Step 5: Related role matches";

        let baseScore = 0;
        let maxBonus = 0;

        // 1. Role Base Score
        if (jobTitle === r.toLowerCase()) {
            baseScore = 95;
            maxBonus = 5;
            fallbackStage = "Step 1: Direct role matches";
            matchedKw.push(r.toLowerCase());
        } else if (jobTitle.includes(r.toLowerCase())) {
            baseScore = 92;
            maxBonus = 8;
            fallbackStage = "Step 1: Direct role matches";
            matchedKw.push(r.toLowerCase());
        } else {
            for (const kw of keywords) {
                if (kw.length > 2 && jobTitle.includes(kw)) {
                    baseScore = Math.max(baseScore, 90);
                    maxBonus = 5;
                    matchedKw.push(kw);
                    fallbackStage = "Step 2: Synonym matches";
                }
            }
            if (baseScore === 0) {
                const roleWords = r.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !['engineer','developer','manager','analyst','specialist','consultant','architect','designer'].includes(w));
                for (const rw of roleWords) {
                    if (jobTitle.includes(rw)) {
                        baseScore = Math.max(baseScore, 80);
                        maxBonus = 10;
                        matchedKw.push(rw);
                        fallbackStage = "Step 3: Partial keyword matches";
                    } else if (desc.includes(rw) || jobSkills.some(s => s.includes(rw))) {
                        baseScore = Math.max(baseScore, 60);
                        maxBonus = 20;
                        matchedKw.push(rw);
                        fallbackStage = "Step 4: Skill/Industry match";
                    }
                }
            }
        }

        if (baseScore === 0) {
           baseScore = 40;
           maxBonus = 20;
           fallbackStage = "Step 5: Related role matches";
        }

        // Stage 4: Bonus Score (Skills, Exp, Loc, Pref)
        let bonusPoints = 0;
        
        let skillMatches = 0;
        if (userSkills.length > 0) {
            for (const s of userSkills) {
                if (jobSkills.some(js => js.includes(s)) || desc.includes(s) || reqs.includes(s)) {
                    skillMatches++;
                    matchedKw.push(s);
                }
            }
            // Heavily reward skill matches
            bonusPoints += (skillMatches / userSkills.length) * (maxBonus * 0.8);
        } else {
            bonusPoints += (maxBonus * 0.25); 
        }

        if (userExp && jobExp) {
            if (jobExp.includes(userExp) || userExp.includes(jobExp)) bonusPoints += (maxBonus * 0.25);
        } else {
            bonusPoints += (maxBonus * 0.25);
        }

        if (prefCountry && jobLoc.includes(prefCountry)) bonusPoints += (maxBonus * 0.15);
        else if (jobLoc.includes('remote')) bonusPoints += (maxBonus * 0.15);
        
        if (prefType && prefType !== 'all' && jobType.includes(prefType)) bonusPoints += (maxBonus * 0.10);
        else bonusPoints += (maxBonus * 0.10);

        // Stage 5: Recency Boost
        const now = Date.now();
        const jobDate = job._id && typeof job._id.getTimestamp === 'function' ? job._id.getTimestamp() : new Date(job.created_at || 0);
        const ageDays = (now - jobDate.getTime()) / (1000 * 60 * 60 * 24);
        
        let recencyBoost = 0;
        if (ageDays <= 1) recencyBoost = 5;
        else if (ageDays <= 3) recencyBoost = 3;
        else if (ageDays <= 7) recencyBoost = 1;

        // Stage 6: Final Ranking (Base + Bonus + Recency)
        currentScore = Math.min(100, Math.round(baseScore + bonusPoints + recencyBoost));

        if (currentScore > bestScore) {
            bestScore = currentScore;
            bestKeywords = [...new Set(matchedKw)];
            bestFallbackStage = fallbackStage;
        }
    }

    if (bestScore >= 90) bestReason = `Excellent Match`;
    else if (bestScore >= 80) bestReason = `Strong Match`;
    else if (bestScore >= 70) bestReason = `Good Match`;
    else if (bestScore >= 50) bestReason = `Partial Match`;
    else bestReason = `Low Match`;

    let tier = 5;
    if (bestFallbackStage.includes('Step 1')) tier = 1;
    else if (bestFallbackStage.includes('Step 2')) tier = 2;
    else if (bestFallbackStage.includes('Step 3')) tier = 3;
    else if (bestFallbackStage.includes('Step 4')) tier = 4;
    else tier = 5;

    const coreWords = userPrefs.roles.map(r => r.replace(/engineer|developer|manager|analyst|specialist|consultant|architect|designer/ig, '').trim().toLowerCase()).filter(w => w.length > 2);
    for (const cw of coreWords) {
        if (jobTitle.includes(cw) && tier > 2) {
            tier = 2;
            break;
        }
    }

    return { score: bestScore, matchedKeywords: bestKeywords.slice(0, 5), matchReason: bestReason, fallbackStage: bestFallbackStage, tier: tier };
};

const formatJobResponse = (job, userPrefs, userCountry, appMap = {}, savedSet = new Set()) => {
    let status = 'New';
    if (appMap[job._id.toString()]) {
        status = appMap[job._id.toString()];
    } else if (savedSet.has(job._id.toString())) {
        status = 'Saved';
    }

    return {
        id: job._id.toString(),
        title: job.title,
        company: job.company,
        location: job.location,
        workType: job.job_type === 'remote' ? 'Remote' : (job.job_type === 'hybrid' ? 'Hybrid' : 'On-site'),
        experienceLevel: job.experienceLevel || 'Entry-Level',
        salary: job.salary,
        postedAt: job.created_at,
        postedDate: new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        created_at: job._id && typeof job._id.getTimestamp === 'function' ? job._id.getTimestamp() : job.created_at,
        description: job.description,
        skills: Array.isArray(job.skills_required) ? job.skills_required.slice(0, 5) : (typeof job.skills_required === 'string' ? job.skills_required.split(',').map(s=>s.trim()).slice(0,5) : []),
        applyUrl: job.apply_link,
        apply_link: job.apply_link,
        companyLogo: job.companyLogo || '',
        logo: job.company.charAt(0).toUpperCase(),
        logoColor: job.logoColor || `hsl(${Math.random() * 360}, 70%, 50%)`,
        source: job.source || 'Apify',
        employmentType: job.employmentType || 'Full-time',
        jobType: job.employmentType || 'Full-time',
        status: status,
        deadline: job.deadline || 'Not specified',
        responsibilities: Array.isArray(job.responsibilities) ? job.responsibilities : (typeof job.responsibilities === 'string' ? job.responsibilities.split(',').map(s=>s.trim()) : []),
        tools: Array.isArray(job.skills_required) ? job.skills_required : (typeof job.skills_required === 'string' ? job.skills_required.split(',').map(s=>s.trim()) : []),
        companyOverview: job.companyOverview || `Learn more about ${job.company} and their open positions.`,
        suggestedKeywords: Array.isArray(job.skills_required) ? job.skills_required : (typeof job.skills_required === 'string' ? job.skills_required.split(',').map(s=>s.trim()) : []),
        preferredSkills: Array.isArray(job.preferredSkills) ? job.preferredSkills : (typeof job.preferredSkills === 'string' ? job.preferredSkills.split(',').map(s=>s.trim()) : [])
    };
};

exports.getJobs = async (req, res) => {
    try {
        const { search, location, workMode, employmentType, experience, role, sort, company, datePosted, industry, h1b, page = 1, limit = 50 } = req.query;
        
        let userPrefs = null;
        let userCountry = '';
        let appMap = {};
        let savedSet = new Set();
        
        if (req.user) {
            if (req.user.preferences) {
                userPrefs = await Preference.findById(req.user.preferences).lean();
            }
            userCountry = req.user.preferredCountry || '';
            
            const apps = await Application.find({ userId: req.user._id }).lean();
            apps.forEach(a => { appMap[a.jobId.toString()] = a.status; });
            
            const saved = await SavedJob.find({ userId: req.user._id }).lean();
            saved.forEach(s => { savedSet.add(s.jobId.toString()); });
        }

        let matchQuery = {}; 

        if (search) {
            matchQuery.$or = [
                { title: { $regex: search, $options: 'i' } },
                { company: { $regex: search, $options: 'i' } },
                { skills_required: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (location && location !== 'All') matchQuery.location = { $regex: location, $options: 'i' };
        if (company) matchQuery.company = { $regex: company, $options: 'i' };
        if (workMode && workMode !== 'All') matchQuery.job_type = { $regex: workMode, $options: 'i' };
        if (employmentType && employmentType !== 'All') matchQuery.employmentType = { $regex: employmentType, $options: 'i' };
        if (experience && experience !== 'All') matchQuery.experienceLevel = { $regex: experience, $options: 'i' };
        if (industry && industry !== 'All') matchQuery.industry = { $regex: industry, $options: 'i' };

        if (h1b) {
            if (h1b === 'Sponsors H1B') matchQuery.h1bSponsor = { $in: [true, 'Likely'] };
            if (h1b === 'No Sponsorship') matchQuery.h1bSponsor = { $nin: [true, 'Likely'] };
        }

        if (datePosted && datePosted !== 'All') {
            const today = new Date();
            if (datePosted === 'Past 24 hours') {
                today.setDate(today.getDate() - 1);
                matchQuery.created_at = { $gte: today };
            } else if (datePosted === 'Past week') {
                today.setDate(today.getDate() - 7);
                matchQuery.created_at = { $gte: today };
            } else if (datePosted === 'Past month') {
                today.setMonth(today.getMonth() - 1);
                matchQuery.created_at = { $gte: today };
            }
        }

        let broadKeywords = [];
        if (role) {
            const roleList = role.split(',').filter(r => r.trim());
            roleList.forEach(r => broadKeywords.push(...getKeywordsForRole(r)));
            const userRoles = userPrefs?.roles || [];
            userRoles.forEach(r => broadKeywords.push(...getKeywordsForRole(r)));
        } else if (userPrefs && userPrefs.roles && userPrefs.roles.length > 0 && sort === 'match') {
            userPrefs.roles.forEach(r => broadKeywords.push(...getKeywordsForRole(r)));
        }

        broadKeywords = [...new Set(broadKeywords)].filter(k => k && k.length > 2);

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        let cacheKey, prefHash, reqHash, fullHash;
        if (sort === 'match') {
            cacheKey = req.user ? req.user._id.toString() : 'guest';
            prefHash = userPrefs ? JSON.stringify(userPrefs) : 'none';
            // Exclude page and limit to ensure pagination uses the exact same cached array
            const queryForHash = { ...req.query };
            delete queryForHash.page;
            delete queryForHash.limit;
            reqHash = JSON.stringify(queryForHash);
            fullHash = crypto.createHash('md5').update(prefHash + reqHash).digest('hex');
        }

        // DISABLED STRICT MongoDB KEYWORD FILTERING
        // We now retrieve the broad candidate set and let the Node.js Matching Engine
        // determine the final relevance scores, preventing over-filtering.
        if (broadKeywords.length > 0 && sort === 'match') {
            const cached = recommendationCache.get(cacheKey);
            
            if (cached && cached.prefHash === fullHash && cached.version >= globalJobsVersion) {
                if (DEBUG_MODE) console.log(`[Cache Hit] Serving scored jobs for user: ${cacheKey} in < 5ms`);
                
                const paginatedCachedJobs = cached.rawJobs.slice((pageNum - 1) * limitNum, pageNum * limitNum);
                const dynamicJobs = paginatedCachedJobs.map(j => {
                    const formatted = formatJobResponse(j, userPrefs, userCountry, appMap, savedSet);
                    formatted.matchScore = j.matchScore;
                    formatted.matchPercentage = j.matchPercentage;
                    formatted.matchedKeywords = j.matchedKeywords;
                    formatted.matchReason = j.matchReason;
                    formatted.fallbackStage = j.fallbackStage;
                    return formatted;
                });
                
                return res.json({
                    success: true,
                    jobs: dynamicJobs,
                    generatedKeywords: cached.generatedKeywords,
                    page: pageNum,
                    pages: Math.ceil(cached.totalJobsInDB / limitNum),
                    totalPages: Math.ceil(cached.totalJobsInDB / limitNum),
                    totalJobs: cached.totalJobsInDB
                });
            }
        }

        if (sort === 'match') {
            if (DEBUG_MODE) console.time("jobs-query-match");
            // OPTIMIZATION: Use the Global Jobs Cache in-memory array instead of MongoDB.
            let rawJobs = [];
            if (GLOBAL_JOBS_CACHE.length === 0) {
                // Fallback in case cache is still initializing
                rawJobs = await Job.find(matchQuery).lean();
            } else {
                rawJobs = GLOBAL_JOBS_CACHE.filter(j => {
                    let match = true;
                    
                    if (search) {
                        const regex = new RegExp(search, 'i');
                        if (!regex.test(j.title) && !regex.test(j.company) && !(Array.isArray(j.skills_required) && j.skills_required.some(s => regex.test(s)))) {
                            match = false;
                        }
                    }
                    
                    if (location && location !== 'All' && !(new RegExp(location, 'i').test(j.location))) match = false;
                    if (company && !(new RegExp(company, 'i').test(j.company))) match = false;
                    if (workMode && workMode !== 'All' && !(new RegExp(workMode, 'i').test(j.job_type))) match = false;
                    if (employmentType && employmentType !== 'All' && !(new RegExp(employmentType, 'i').test(j.employmentType))) match = false;
                    if (experience && experience !== 'All' && !(new RegExp(experience, 'i').test(j.experienceLevel))) match = false;
                    if (industry && industry !== 'All' && !(new RegExp(industry, 'i').test(j.industry))) match = false;
                    
                    if (h1b === 'Sponsors H1B' && j.h1bSponsor !== true && j.h1bSponsor !== 'Likely') match = false;
                    if (h1b === 'No Sponsorship' && (j.h1bSponsor === true || j.h1bSponsor === 'Likely')) match = false;
                    
                    if (datePosted && datePosted !== 'All') {
                        const jobDate = j._id && typeof j._id.getTimestamp === 'function' ? j._id.getTimestamp() : new Date(j.created_at || 0);
                        const today = new Date();
                        if (datePosted === 'Past 24 hours') {
                            today.setDate(today.getDate() - 1);
                            if (jobDate < today) match = false;
                        } else if (datePosted === 'Past week') {
                            today.setDate(today.getDate() - 7);
                            if (jobDate < today) match = false;
                        } else if (datePosted === 'Past month') {
                            today.setMonth(today.getMonth() - 1);
                            if (jobDate < today) match = false;
                        }
                    }
                    
                    return match;
                });
                
                // Deep clone the matching jobs so that matchScore assignment doesn't permanently pollute the global cache
                rawJobs = rawJobs.map(j => ({ ...j }));
            }
            if (DEBUG_MODE) console.timeEnd("jobs-query-match");
            
            if (DEBUG_MODE) console.time("jobs-scoring");
            const now = Date.now();
            const DAY_MS = 24 * 60 * 60 * 1000;

            rawJobs.forEach(j => {
                if (!j) return;
                const md = calculateDetailedMatchScore(j, userPrefs, userCountry);
                const score = md?.score ?? j?.score ?? j?.matchAnalysis?.score ?? j?.matchScore ?? 0;
                
                j.matchScore = score;
                j.matchPercentage = score;
                j.matchedKeywords = md?.matchedKeywords || [];
                j.matchReason = md?.matchReason || "Low Match";
                j.fallbackStage = md?.fallbackStage || "Step 5: Related role matches";
                j.tier = md?.tier || 5;

                if (score >= 80) {
                    // Reduce individual job console logging to avoid terminal spam, since we will aggregate it at the end
                }
            });

            // NO HARD FILTERING: Allow all matched jobs.
            // FINAL SORTING FORMULA:
            // 1. Tier ASC (Group by relevance: Tier 1 > Tier 2 > etc)
            // 2. Date DESC (Prioritize newest relevant jobs within the tier)
            // 3. Match Score DESC (Tie-breaker for same day/tier)
            rawJobs.sort((a, b) => {
                const tierA = a.tier || 5;
                const tierB = b.tier || 5;
                
                if (tierA !== tierB) return tierA - tierB; // Lower tier is better (1 is best)
                
                // If same tier, sort by insertion Date DESC (newest fetched first)
                const dateB = b._id && typeof b._id.getTimestamp === 'function' ? b._id.getTimestamp().getTime() : new Date(b?.created_at || 0).getTime();
                const dateA = a._id && typeof a._id.getTimestamp === 'function' ? a._id.getTimestamp().getTime() : new Date(a?.created_at || 0).getTime();
                
                if (dateB !== dateA) return dateB - dateA;

                // Fallback to strict match score if dates are identical
                const scoreA = a.matchScore || 0;
                const scoreB = b.matchScore || 0;
                if (scoreB !== scoreA) return scoreB - scoreA;
                
                // Absolute fallback for identical tier, date, and score to guarantee stable pagination
                return a._id.toString().localeCompare(b._id.toString());
            });
            if (DEBUG_MODE) console.timeEnd("jobs-scoring");

            const totalJobsInDB = rawJobs.length;
            
            // Generate overall Debug Output
            if (DEBUG_MODE && userPrefs && userPrefs.roles && userPrefs.roles.length > 0) {
                const scores = rawJobs.map(j => j.matchScore || 0);
                console.log(`\n--- DEBUG OUTPUT ---`);
                console.log(`Role: ${userPrefs.roles.join(', ')}`);
                console.log(`Total Matches: ${rawJobs.length}`);
                console.log(`Highest Score: ${scores.length > 0 ? Math.max(...scores) : 0}%`);
                console.log(`Lowest Score: ${scores.length > 0 ? Math.min(...scores) : 0}%`);
                console.log(`Sorting Mode:`);
                console.log(`1. Score DESC`);
                console.log(`2. Date DESC`);
                console.log(`3. Timestamp DESC`);
                console.log(`First 10 Returned Jobs:`);
                rawJobs.slice(0, 10).forEach((j, i) => {
                    console.log(`${i+1}. [${j.matchScore}%] ${j.title} | ${j.postedDate || j.created_at}`);
                });
                console.log(`--------------------\n`);
            }

            // Save Heavy CPU computations to Cache
            recommendationCache.set(cacheKey, {
                prefHash: fullHash,
                version: Date.now(),
                rawJobs: rawJobs,
                generatedKeywords: broadKeywords,
                totalJobsInDB: totalJobsInDB
            });

            const paginatedJobs = rawJobs.slice((pageNum - 1) * limitNum, pageNum * limitNum);
            
            const formattedJobs = paginatedJobs.map(j => {
                const formatted = formatJobResponse(j, userPrefs, userCountry, appMap, savedSet);
                const score = j?.matchScore ?? j?.matchAnalysis?.score ?? j?.score ?? 50;
                formatted.matchScore = score;
                formatted.matchPercentage = score;
                formatted.matchedKeywords = j?.matchedKeywords || [];
                formatted.matchReason = j?.matchReason || "Low Match";
                formatted.fallbackStage = j?.fallbackStage || "Step 5: Related role matches";
                formatted.tier = j?.tier || 5;

                return formatted;
            });

            return res.json({
                success: true,
                jobs: formattedJobs,
                generatedKeywords: broadKeywords,
                page: pageNum,
                pages: Math.ceil(totalJobsInDB / limitNum),
                totalPages: Math.ceil(totalJobsInDB / limitNum),
                totalJobs: totalJobsInDB
            });
        } else {
            if (DEBUG_MODE) console.time("jobs-query-latest");
            
            let totalJobsInDB = 0;
            if (Object.keys(matchQuery).length === 0) {
                totalJobsInDB = await Job.estimatedDocumentCount();
            } else {
                totalJobsInDB = await Job.countDocuments(matchQuery);
            }

            let rawJobs = await Job.find(matchQuery)
                .select('_id title company location job_type experienceLevel created_at skills_required apply_link companyLogo source employmentType deadline h1bSponsor responsibilities preferredSkills requirements description')
                .sort({ _id: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean();
            if (DEBUG_MODE) console.timeEnd("jobs-query-latest");

            const formattedJobs = rawJobs.map(j => {
                const formatted = formatJobResponse(j, userPrefs, userCountry, appMap, savedSet);
                formatted.matchScore = 50;
                formatted.matchPercentage = 50;
                formatted.matchReason = "General Match";
                return formatted;
            });

            res.json({
                success: true,
                jobs: formattedJobs,
                page: pageNum,
                pages: Math.ceil(totalJobsInDB / limitNum),
                totalPages: Math.ceil(totalJobsInDB / limitNum),
                totalJobs: totalJobsInDB
            });
        }
    } catch (error) {
        console.error('Error in getJobs:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getJobById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ message: 'Job not found' });
        }
        
        const job = await Job.findById(id).lean();
        if (!job) return res.status(404).json({ message: 'Job not found' });
        
        let userPrefs = null;
        let userCountry = '';
        let appMap = {};
        let savedSet = new Set();
        
        if (req.user) {
            if (req.user.preferences) {
                userPrefs = await Preference.findById(req.user.preferences).lean();
            }
            userCountry = req.user.preferredCountry || '';
            const app = await Application.findOne({ userId: req.user._id, jobId: id }).lean();
            if (app) appMap[id] = app.status;
            
            const saved = await SavedJob.findOne({ userId: req.user._id, jobId: id }).lean();
            if (saved) savedSet.add(id);
        }
        
        const formatted = formatJobResponse(job, userPrefs, userCountry, appMap, savedSet);
        if (userPrefs) {
             const md = calculateDetailedMatchScore(job, userPrefs);
             formatted.matchScore = md.score;
             formatted.matchPercentage = md.score;
             formatted.matchedKeywords = md.matchedKeywords;
             formatted.matchReason = md.matchReason;
        } else {
             formatted.matchScore = 50;
             formatted.matchPercentage = 50;
             formatted.matchedKeywords = [];
             formatted.matchReason = "General Match";
        }
        
        res.json(formatted);
    } catch (error) {
        console.error('Error in getJobById:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.searchJobs = async (req, res) => {
    return exports.getJobs(req, res);
};

exports.getStats = async (req, res) => {
    try {
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const totalJobsToday = await Job.countDocuments({ created_at: { $gte: last24h } });
        const appliedCount = await Application.countDocuments({ 
            userId: req.user._id,
            status: 'APPLIED'
        });
        const manualCount = await Application.countDocuments({
            userId: req.user._id,
            source: { $regex: /^manual$/i },
            status: { $ne: 'PENDING_SUBMISSION' }
        });
        const interviewCount = await Application.countDocuments({
            userId: req.user._id,
            status: 'INTERVIEW'
        });
        const savedCount = await SavedJob.countDocuments({ userId: req.user._id });

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const followUpCount = await Application.countDocuments({
            userId: req.user._id,
            status: 'APPLIED',
            appliedDate: { $lte: sevenDaysAgo }
        });
        
        let prefMatchCount = 0;
        if (req.user.preferences) {
            const prefs = await Preference.findById(req.user.preferences).lean();
            if (prefs && prefs.roles && prefs.roles.length > 0) {
                let broadKeywords = [];
                prefs.roles.forEach(r => broadKeywords.push(...getKeywordsForRole(r)));
                broadKeywords = [...new Set(broadKeywords)].filter(k => k && k.length > 2);
                if (broadKeywords.length > 0) {
                     const regexes = broadKeywords.map(kw => new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
                     prefMatchCount = await Job.countDocuments({ 
                         $or: [
                             { title: { $in: regexes } },
                             { skills_required: { $in: regexes } }
                         ]
                     });
                }
            }
        }
        
        res.json({
            totalJobsToday,
            appliedCount,
            manualCount,
            interviewCount,
            savedCount,
            followUpCount,
            prefMatchCount
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
