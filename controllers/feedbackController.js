const Feedback = require('../models/Feedback');

exports.submitFeedback = async (req, res) => {
  try {
    const {
      feedbackType,
      subject,
      message,
      rating,
      screenshotUrl,
      recommendPlatform,
      priority,
      isAnonymous
    } = req.body;

    const feedbackData = {
      feedbackType,
      subject,
      message,
      rating,
      screenshotUrl,
      recommendPlatform,
      priority,
      isAnonymous
    };

    if (req.user && !isAnonymous) {
      feedbackData.userId = req.user.id;
      feedbackData.name = req.user.name;
      feedbackData.email = req.user.email;
    }

    const newFeedback = await Feedback.create(feedbackData);

    console.log(`[Admin Notice] New feedback submitted: [${feedbackType}] ${subject}`);

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      feedback: newFeedback
    });
  } catch (error) {
    console.error('Feedback Submission Error:', error);
    res.status(500).json({ success: false, message: 'Server error saving feedback' });
  }
};

exports.getFeedbackForAdmin = async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ createdAt: -1 });
    res.json({ success: true, count: feedbacks.length, feedbacks });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ success: false, message: 'Server error fetching feedback' });
  }
};
