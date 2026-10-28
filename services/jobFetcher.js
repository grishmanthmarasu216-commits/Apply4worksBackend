const apifyService = require('./apifyService');
const Job = require('../models/Job');
const jobsController = require('../controllers/jobsController');

const DEBUG_MODE = process.env.DEBUG_MODE === "true";

let isSyncRunning = false;

const fetchJobs = async () => {
    // ── Apify fetching enabled ──────────────────────────────────────────────────
    // Apify job fetching runs automatically based on the schedule.
    // ──────────────────────────────────────────────────────────────────────────

    if (isSyncRunning) {
        console.log('[Apify] Sync already running. Skipping duplicate trigger.');
        return;
    }
    isSyncRunning = true;
    
    try {
        if (DEBUG_MODE) {
            console.log('\n========================================');
            console.log('STARTING BACKGROUND JOB FETCH FROM APIFY');
            console.log('========================================');
            console.log(`\n>>> Executing configured Apify tasks...`);
        }
        console.time("Apify-Actor-Run-And-Fetch");
        const apifyJobs = await apifyService.fetchJobs();
        console.timeEnd("Apify-Actor-Run-And-Fetch");
        
        let allJobs = [];
        allJobs = allJobs.concat(apifyJobs);

        if (DEBUG_MODE) {
            console.log(`\n[Apify] Total Jobs Retrieved: ${allJobs.length}`);
            console.log(`[Merge] Combined Jobs Count: ${allJobs.length}`);
        }

        const uniqueJobs = [];
        const seenUrls = new Set();
        const seenSignatures = new Set();
        let duplicatesRemoved = 0;

        for (const job of allJobs) {
            const url = job.applyUrl || job.jobUrl;
            const sig = `${job.title}-${job.company}-${job.location}`.toLowerCase();
            
            if (url && seenUrls.has(url)) {
                duplicatesRemoved++;
                continue;
            }
            if (!url && seenSignatures.has(sig)) {
                duplicatesRemoved++;
                continue;
            }
            
            if (url) seenUrls.add(url);
            seenSignatures.add(sig);
            uniqueJobs.push(job);
        }

        if (DEBUG_MODE) {
            console.log(`[Dedupe] Duplicates Removed: ${duplicatesRemoved}`);
        }

        let totalInserted = 0;
        if (uniqueJobs.length > 0) {
            console.time("MongoDB-Batch-Insert");
            const stats = await apifyService.saveJobs(uniqueJobs);
            console.timeEnd("MongoDB-Batch-Insert");
            
            if (stats) {
                totalInserted = stats.inserted;
                if (totalInserted > 0) {
                    // Re-initialize the global cache in the background so it fetches the new _ids
                    jobsController.initializeJobsCache();
                    jobsController.incrementJobsVersion();
                }
            }
        }

        if (DEBUG_MODE) {
            console.log('\n========================================');
            console.log('BACKGROUND JOB FETCH CYCLE COMPLETE');
            console.log(`[Jobs] New Insertions: ${totalInserted}`);
            console.log(`[Jobs] Storage Complete`);
            const intervalHours = parseInt(process.env.JOB_FETCH_INTERVAL_HOURS) || 6;
            const nextSync = new Date(Date.now() + intervalHours * 60 * 60 * 1000);
            console.log(`Next Scheduled Sync Time: ~${nextSync.toLocaleString()}`);
            console.log('========================================\n');
        }

    } catch (error) {
        console.error('CRITICAL: Failed to execute background fetch cycle:', error.message);
    } finally {
        isSyncRunning = false;
    }
};

module.exports = { fetchJobs };
