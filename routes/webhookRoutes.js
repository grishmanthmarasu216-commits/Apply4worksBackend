const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Razorpay webhook endpoint
router.post('/razorpay', webhookController.razorpayWebhook);

module.exports = router;
