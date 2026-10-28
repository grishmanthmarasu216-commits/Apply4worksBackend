const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe, logoutUser, googleLogin, verifyOTP } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/google', googleLogin);
router.post('/verify-otp', verifyOTP);
router.get('/me', protect, getMe);
router.post('/logout', logoutUser);

module.exports = router;
