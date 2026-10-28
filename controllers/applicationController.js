const Application = require('../models/Application');
const Job = require('../models/Job');
const Preference = require('../models/Preference');

exports.createApplication = async (req, res) => {
    try {
        const { jobId } = req.body;
        
        // Find existing application
        let app = await Application.findOne({ userId: req.user._id, jobId });
        if (app) {
            return res.json({ message: 'Application already exists', application: app });
        }

        app = new Application({
            userId: req.user._id,
            jobId,
            status: req.body.status || 'PENDING_SUBMISSION',
            source: req.body.source || req.body.appliedBy || 'Manual',
            matchScore: req.body.matchScore || 0
        });
        await app.save();

        res.status(201).json({ message: 'Application initiated', application: app });
    } catch (error) {
        console.error('Error creating application:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const app = await Application.findOne({ jobId: id, userId: req.user._id });
        if (!app) return res.status(404).json({ message: 'Application not found' });

        app.status = status;
        if (status === 'APPLIED' && !app.appliedDate) {
            app.appliedDate = new Date();
        }
        app.lastUpdated = new Date();
        await app.save();

        res.json({ message: 'Status updated', application: app });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getApplications = async (req, res) => {
    try {
        const apps = await Application.find({ userId: req.user._id }).populate('jobId').lean();
        
        res.json({ applications: apps });
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getFollowUps = async (req, res) => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const apps = await Application.find({ 
            userId: req.user._id, 
            status: 'APPLIED',
            appliedDate: { $lte: sevenDaysAgo }
        }).populate('jobId').lean();

        res.json({ followups: apps });
    } catch (error) {
        console.error('Error fetching follow-ups:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
