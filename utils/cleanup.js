const mongoose = require('mongoose');
const Job = require('../models/Job');

/**
 * Utility to safely delete jobs by source (e.g. 'adzuna', 'Apify')
 * @param {string} sourceName - The source name to delete
 */
async function deleteJobsBySource(sourceName) {
    if (!sourceName) {
        console.error('Please provide a source name.');
        return;
    }

    try {
        const result = await Job.deleteMany({ source: new RegExp(`^${sourceName}$`, 'i') });
        console.log(`[Cleanup] Deleted ${result.deletedCount} jobs with source: ${sourceName}`);
        return result.deletedCount;
    } catch (error) {
        console.error(`[Cleanup] Error deleting jobs by source ${sourceName}:`, error);
        throw error;
    }
}

// If run directly from the command line: node cleanup.js <sourceName>
if (require.main === module) {
    const sourceName = process.argv[2];
    if (!sourceName) {
        console.error('Usage: node cleanup.js <source_name>');
        process.exit(1);
    }

    require('dotenv').config({ path: '../.env' });
    
    mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/apply4works')
        .then(async () => {
            await deleteJobsBySource(sourceName);
            process.exit(0);
        })
        .catch(err => {
            console.error('MongoDB connection error:', err);
            process.exit(1);
        });
}

module.exports = { deleteJobsBySource };
