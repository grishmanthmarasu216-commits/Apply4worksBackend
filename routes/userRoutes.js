const express = require('express');
const router = express.Router();
const { savePreferences, completePricing, deleteAccount } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.post('/preferences', protect, savePreferences);
router.post('/complete-pricing', protect, completePricing);
router.delete('/', protect, deleteAccount);

module.exports = router;
