const LikedJob = require('../models/LikedJob');

exports.getLikedJobs = async (req, res) => {
  try {
    const likedJobs = await LikedJob.find({ userId: req.user.id })
      .populate('jobId')
      .sort({ likedAt: -1 });
    res.json({ success: true, likedJobs });
  } catch (err) {
    console.error('Error in getLikedJobs:', err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

exports.likeJob = async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) {
      return res.status(400).json({ success: false, error: 'Job ID is required' });
    }

    const existing = await LikedJob.findOne({ userId: req.user.id, jobId });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Job already liked' });
    }

    const likedJob = new LikedJob({
      userId: req.user.id,
      jobId
    });

    await likedJob.save();
    res.status(201).json({ success: true, likedJob });
  } catch (err) {
    console.error('Error in likeJob:', err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

exports.unlikeJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const deleted = await LikedJob.findOneAndDelete({ userId: req.user.id, jobId });
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Liked job not found' });
    }
    res.json({ success: true, message: 'Job unliked' });
  } catch (err) {
    console.error('Error in unlikeJob:', err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
