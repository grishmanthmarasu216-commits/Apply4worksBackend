const express = require('express');
const router = express.Router();
const jobsController = require('../controllers/jobsController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');

const savedJobController = require('../controllers/savedJobController');
const applicationController = require('../controllers/applicationController');

router.get('/jobs', optionalAuth, jobsController.getJobs);
router.get('/jobs/search', optionalAuth, jobsController.searchJobs);
router.get('/dashboard/stats', protect, jobsController.getStats);
// Saved Jobs
router.get('/jobs/saved', protect, savedJobController.getSavedJobs);
router.post('/jobs/save', protect, savedJobController.saveJob);
router.delete('/jobs/save/:jobId', protect, savedJobController.unsaveJob);

// Liked Jobs
const likedJobController = require('../controllers/likedJobController');
router.get('/jobs/liked', protect, likedJobController.getLikedJobs);
router.post('/jobs/like', protect, likedJobController.likeJob);
router.delete('/jobs/like/:jobId', protect, likedJobController.unlikeJob);

router.get('/jobs/:id', optionalAuth, jobsController.getJobById);

// Applications
router.get('/applications', protect, applicationController.getApplications);
router.post('/applications', protect, applicationController.createApplication);
router.patch('/applications/:id/status', protect, applicationController.updateStatus);
router.get('/applications/followups', protect, applicationController.getFollowUps);

module.exports = router;
