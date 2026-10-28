const { ApifyClient } = require('apify-client');
const Job = require('../models/Job');

const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms} ms`)), ms)
    );
    return Promise.race([promise, timeout]);
};

/**
 * Normalizes job data into a consistent schema.
 * Preserved for frontend compatibility and apply URL redirects.
 */
const normalizeJobs = (rawJob) => {
    const fallbackId = Math.random().toString(36).substring(2, 15);
    
    let loc = rawJob.location || rawJob.city || 'United States';
    if (typeof loc === 'object') {
        loc = loc.city || loc.region || loc.country || 'United States';
    }

    // Ensure URL is absolute
    let rawUrl = rawJob.applyUrl || rawJob.jobUrl || rawJob.url || rawJob.link || '';
    if (rawUrl && !rawUrl.startsWith('http')) {
        rawUrl = 'https://' + rawUrl;
    }

    return {
        id: rawJob.id || rawJob.jobId || rawJob.url || fallbackId,
        title: rawJob.positionName || rawJob.title || rawJob.jobTitle || 'No Title',
        company: rawJob.companyName || rawJob.company || rawJob.employerName || 'Unknown Company',
        location: loc,
        workType: rawJob.workType || (rawJob.isRemote || rawJob.remote ? 'Remote' : (rawJob.description?.toLowerCase().includes('hybrid') ? 'Hybrid' : 'On-site')),
        experienceLevel: rawJob.experienceLevel || rawJob.seniorityLevel || 'Entry-Level',
        salary: rawJob.salary || rawJob.salaryText || rawJob.estimatedSalary || 'Not disclosed',
        postedAt: rawJob.postedAt || rawJob.postedDate || rawJob.datePosted || new Date().toISOString(),
        description: rawJob.description || rawJob.jobDescription || '',
        skills: Array.isArray(rawJob.skills) ? rawJob.skills : (rawJob.description ? extractSkills(rawJob.description) : []),
        applyUrl: rawUrl,
        companyLogo: rawJob.companyLogo || rawJob.logoUrl || rawJob.employerLogo || '',
        source: 'linkedin',
        employmentType: rawJob.employmentType || rawJob.jobType || 'Full-time',
        deadline: rawJob.deadline || rawJob.validThrough || '',
        responsibilities: rawJob.responsibilities || [],
        companyOverview: rawJob.companyOverview || '',
        preferredSkills: rawJob.preferredSkills || []
    };
};

const extractSkills = (description) => {
    if (!description) return [];
    const techKeywords = ['React', 'Node', 'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'Go', 'AWS', 'Docker', 'Kubernetes', 'SQL', 'NoSQL', 'MongoDB', 'Express', 'Vue', 'Angular', 'Next.js', 'NestJS', 'GraphQL', 'REST', 'Linux', 'Git', 'Agile', 'Machine Learning', 'AI'];
    const extracted = [];
    const descLower = description.toLowerCase();
    
    for (const keyword of techKeywords) {
        if (descLower.includes(keyword.toLowerCase())) {
            extracted.push(keyword);
        }
    }
    return extracted;
};

/**
 * Placeholder for fetching jobs from a new Apify scraper.
 */
const fetchJobs = async () => {
    const tasks = [
        { name: 'LinkedIn', id: process.env.LINKEDIN_TASK_ID },
        { name: 'Indeed', id: process.env.INDEED_TASK_ID }
    ].filter(t => t.id);

    if (tasks.length === 0) {
        console.error('[Apify] No configured tasks found in environment.');
        return [];
    }

    let allItems = [];

    for (const task of tasks) {
        if (task.name === 'Indeed') {
            console.log('[Apify] Indeed disabled');
            continue;
        }

        const taskId = task.id;
        const startTime = Date.now();
        console.log(`\n--- Triggering Apify Job Fetch ---`);
        console.log(`[Apify] Running ${task.name} Task`);
        
        try {
            // Apify task runs without overriding keywords or categories, relying strictly on UI configuration.
            const run = await withTimeout(
                taskId.includes('/') && !taskId.includes('~')
                ? client.actor(taskId).call()
                : client.task(taskId).call(),
                300000
            );
            
            console.log(`[Apify] Task Started`);
            console.log(`[Apify] Run ID: ${run.id}`);
            console.log(`[Apify] Dataset ID: ${run.defaultDatasetId}`);
            
            if (run.status !== 'SUCCEEDED') {
                console.error(`[Apify] ${task.name} Task failed. Reason: Status is ${run.status}`);
                continue;
            }

            const { items } = await client.dataset(run.defaultDatasetId).listItems();
            
            const execTime = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`[Apify] SUCCESS: ${task.name} task completed in ${execTime}s.`);
            console.log(`[Apify] Jobs Retrieved: ${items.length}`);
            
            allItems = allItems.concat(items.map(item => normalizeJobs(item)));
            
        } catch (error) {
            console.error(`[Apify] Error running ${task.name} task. Reason: ${error.message}`);
        }
    }
    return allItems;
};

/**
 * Saves jobs to MongoDB with robust deduplication logic.
 */
const saveJobs = async (jobs) => {
    if (!jobs || jobs.length === 0) return { fetched: 0, inserted: 0, skipped: 0 };

    try {
        const bulkOps = jobs.map(aj => ({
            updateOne: {
                filter: {
                    $or: [
                        ...(aj.applyUrl ? [{ apply_link: aj.applyUrl }] : []),
                        { title: aj.title, company: aj.company, location: aj.location }
                    ]
                },
                update: {
                    $setOnInsert: {
                        title: aj.title,
                        company: aj.company,
                        location: aj.location,
                        salary: aj.salary,
                        job_type: aj.workType ? aj.workType.toLowerCase() : 'on-site',
                        skills_required: aj.skills,
                        description: aj.description,
                        apply_link: aj.applyUrl,
                        source: aj.source,
                        companyLogo: aj.companyLogo,
                        employmentType: aj.employmentType,
                        experienceLevel: aj.experienceLevel,
                        deadline: aj.deadline,
                        responsibilities: aj.responsibilities,
                        companyOverview: aj.companyOverview,
                        preferredSkills: aj.preferredSkills,
                        created_at: new Date(aj.postedAt)
                    }
                },
                upsert: true
            }
        }));

        let insertedCount = 0;
        const countBefore = await Job.countDocuments();
        console.log(`Total DB count before: ${countBefore}`);
        try {
            await Job.bulkWrite(bulkOps, { ordered: false });
        } catch (e) {
            if (e.name !== 'BulkWriteError' && e.code !== 11000) {
                console.error('[Apify] Bulk write error:', e.message);
            }
        }
        const countAfter = await Job.countDocuments();
        insertedCount = Math.max(0, countAfter - countBefore);

        const skippedCount = jobs.length - insertedCount;
        console.log(`[MongoDB] Inserted: ${insertedCount}`);
        console.log(`[MongoDB] Duplicates: ${skippedCount}`);
        
        return { fetched: jobs.length, inserted: insertedCount, skipped: skippedCount };
    } catch (e) {
        console.error('[Apify] Fatal saveJobs error:', e.message);
        return { fetched: jobs?.length || 0, inserted: 0, skipped: 0 };
    }
};

module.exports = {
    fetchJobs,
    normalizeJobs,
    saveJobs
};
