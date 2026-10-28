const SavedJob = require('../models/SavedJob');
const Job = require('../models/Job');

exports.saveJob = async (req, res) => {
    try {
        const { jobId } = req.body;
        
        let savedJob = await SavedJob.findOne({ userId: req.user._id, jobId });
        if (savedJob) {
            return res.json({ message: 'Job already saved', saved: true });
        }

        savedJob = new SavedJob({ userId: req.user._id, jobId });
        await savedJob.save();

        res.status(201).json({ message: 'Job saved', saved: true });
    } catch (error) {
        console.error('Error saving job:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.unsaveJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        await SavedJob.findOneAndDelete({ userId: req.user._id, jobId });
        res.json({ message: 'Job unsaved', saved: false });
    } catch (error) {
        console.error('Error unsaving job:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getSavedJobs = async (req, res) => {
    try {
        const savedJobs = await SavedJob.find({ userId: req.user._id }).populate('jobId').lean();
        res.json({ savedJobs });
    } catch (error) {
        console.error('Error fetching saved jobs:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
