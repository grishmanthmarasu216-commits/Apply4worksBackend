const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sendWelcomeEmail, sendVerificationCodeEmail } = require('../services/emailService');

// Helper to generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret', {
    expiresIn: '30d',
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, firstName, lastName, email, password } = req.body;

    console.log("Request Body:", req.body);

    const missingFields = [];
    if (!name && !firstName && !lastName) missingFields.push('firstName or lastName');
    if (!email) missingFields.push('email');
    if (!password) missingFields.push('password');

    if (missingFields.length > 0) {
      return res.status(400).json({ success: false, message: `Missing required field(s): ${missingFields.join(', ')}` });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      name: name || `${firstName} ${lastName}`,
      firstName,
      lastName,
      email,
      password: hashedPassword,
    });

    if (user) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.verification = {
        code: await bcrypt.hash(otp, 10),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        verified: false
      };
      await user.save();
      await sendVerificationCodeEmail(user, otp);

      return res.status(403).json({ 
        success: false, 
        requireOTP: true, 
        email: user.email, 
        message: 'OTP sent to your email.' 
      });
    } else {
      res.status(400).json({ success: false, message: 'Invalid user data' });
    }
  } catch (error) {
    console.error('Registration Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for user email
    const user = await User.findOne({ email }).populate('preferences');

    if (user && (await bcrypt.compare(password, user.password))) {
      // Always require OTP for manual login (2FA style)
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.verification = {
        code: await bcrypt.hash(otp, 10),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        verified: user.verification?.verified || false
      };
      await user.save();
      await sendVerificationCodeEmail(user, otp);
      return res.status(403).json({ success: false, requireOTP: true, email: user.email, message: 'OTP verification required to log in.' });

      res.json({
        success: true,
        token: generateToken(user._id),
        user: {
          _id: user._id,
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          preferences: user.preferences,
          pricingCompleted: user.pricingCompleted,
          onboardingCompleted: user.onboardingCompleted,
          plan: user.plan,
          paymentStatus: user.paymentStatus
        }
      });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// @desc    Get user data
// @route   GET /api/users/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password').populate('preferences');
    res.json({ success: true, user });
  } catch (error) {
    console.error('Get Me Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error fetching profile' });
  }
};

// @desc    Logout user (invalidate token from client-side usually, but endpoint provided for completion)
// @route   POST /api/auth/logout
// @access  Public (or Private)
const logoutUser = (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
};

const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID);

// @desc    Google Sign In
// @route   POST /api/auth/google
// @access  Public
const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, given_name, family_name, name, email_verified } = payload;

    // Check if user already exists
    let user = await User.findOne({ email }).populate('preferences');

    if (!user) {
      if (!email_verified) {
        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Create user but mark as unverified
        user = await User.create({
          name: name || `${given_name} ${family_name}`,
          firstName: given_name,
          lastName: family_name,
          email,
          password: await bcrypt.hash(Math.random().toString(36).slice(-8), 10), // Random password
          provider: 'google',
          googleId: payload.sub,
          avatar: payload.picture,
          verification: {
            code: await bcrypt.hash(otp, 10),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            verified: false
          }
        });
        
        await sendVerificationCodeEmail(user, otp);
        return res.status(403).json({ requireOTP: true, email, message: 'Email verification required.' });
      }

      // Create user if they don't exist and email is verified
      user = await User.create({
        name: name || `${given_name} ${family_name}`,
        firstName: given_name,
        lastName: family_name,
        email,
        password: await bcrypt.hash(Math.random().toString(36).slice(-8), 10), // Random password
        provider: 'google',
        googleId: payload.sub,
        avatar: payload.picture,
        verification: { verified: true }
      });

      sendWelcomeEmail(user).catch(err => console.error('[Auth] Welcome email error:', err));
    } else {
      // Merge account if logging in with Google but existing email
      let updated = false;
      if (user.provider !== 'google' || !user.googleId) {
        user.provider = 'google';
        user.googleId = payload.sub;
        updated = true;
      }
      if (!user.avatar && payload.picture) {
        user.avatar = payload.picture;
        updated = true;
      }
      if (!user.verification || !user.verification.verified) {
        if (!email_verified) {
           const otp = Math.floor(100000 + Math.random() * 900000).toString();
           user.verification = {
             code: await bcrypt.hash(otp, 10),
             expiresAt: new Date(Date.now() + 10 * 60 * 1000),
             verified: false
           };
           await user.save();
           await sendVerificationCodeEmail(user, otp);
           return res.status(403).json({ requireOTP: true, email, message: 'Email verification required.' });
        } else {
           user.verification = { verified: true };
           updated = true;
        }
      }
      if (updated) {
        await user.save();
      }
    }

    res.json({
      success: true,
      token: generateToken(user._id),
      user: {
        _id: user._id,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        preferences: user.preferences,
        pricingCompleted: user.pricingCompleted,
        onboardingCompleted: user.onboardingCompleted,
        plan: user.plan,
        paymentStatus: user.paymentStatus
      }
    });
  } catch (error) {
    console.error('Google Login Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error during Google login' });
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    let user = await User.findOne({ email }).populate('preferences');
    if (!user || !user.verification || !user.verification.code) {
      return res.status(400).json({ success: false, message: 'OTP expired or not found.' });
    }
    
    if (new Date() > user.verification.expiresAt) {
      user.verification.code = null;
      await user.save();
      return res.status(400).json({ success: false, message: 'OTP has expired.' });
    }
    
    const isValid = await bcrypt.compare(otp, user.verification.code);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid OTP.' });
    }
    
    // OTP matches, check if it's their first time verifying
    const isFirstTimeVerification = !user.verification || !user.verification.verified;
    
    // Mark verified
    user.verification.verified = true;
    user.verification.code = null;
    await user.save();

    if (isFirstTimeVerification) {
      sendWelcomeEmail(user).catch(err => console.error('[Auth] Welcome email error:', err));
    }
    
    res.json({
      success: true,
      token: generateToken(user._id),
      user: {
        _id: user._id,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        preferences: user.preferences,
        pricingCompleted: user.pricingCompleted,
        onboardingCompleted: user.onboardingCompleted,
        plan: user.plan,
        paymentStatus: user.paymentStatus
      }
    });
  } catch (error) {
    console.error('Verify OTP Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error during OTP verification' });
  }
};


module.exports = {
  registerUser,
  loginUser,
  googleLogin,
  verifyOTP,
  getMe,
  logoutUser
};
