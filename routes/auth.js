// ─── routes/auth.js ───────────────────────────────────────────────────────────
const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { User } = require('../models');
const { authenticate } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } = require('../services/email');

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// Generate a 6-digit code
const makeCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── POST /api/auth/signup — Step 1: register + send verification code ─────────
router.post('/signup', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      company,
      country,
      agreedToTos
    } = req.body;

    const normalizedEmail = email.trim().toLowerCase();

    if (!firstName || !lastName || !normalizedEmail || !password || !country) {
      return res.status(400).json({
        error: 'All fields are required'
      });
    }

    if (!agreedToTos) {
      return res.status(400).json({
        error: 'You must agree to the Terms of Service'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters'
      });
    }

    const existing = await User.findOne({
      email: normalizedEmail
    });

    if (existing && existing.isEmailVerified) {
      return res.status(409).json({
        error: 'An account with this email already exists'
      });
    }

    const code = makeCode();

    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    if (existing && !existing.isEmailVerified) {

      existing.firstName = firstName;
      existing.lastName = lastName;
      existing.password = password;
      existing.company = company;
      existing.country = country;
      existing.agreedToTos = agreedToTos;

      existing.emailVerifyCode = code;
      existing.emailVerifyExpiry = expiry;

      await existing.save();

      try {
        await sendVerificationEmail(
          normalizedEmail,
          firstName,
          code
        );
      } catch (emailErr) {
        console.error('Email send failed:', emailErr);
      }

      return res.json({
        message: 'Verification code sent',
        email: normalizedEmail,
        step: 'verify'
      });
    }

    const user = new User({
      firstName,
      lastName,
      email: normalizedEmail,
      password,
      company,
      country,
      agreedToTos,
      tosAgreedAt: new Date(),
      emailVerifyCode: code,
      emailVerifyExpiry: expiry
    });

    await user.save();

    try {
      await sendVerificationEmail(
        normalizedEmail,
        firstName,
        code
      );
    } catch (emailErr) {
      console.error('Email send failed:', emailErr);
    }

    res.status(201).json({
      message: 'Verification code sent to your email',
      email: normalizedEmail,
      step: 'verify'
    });

  } catch (err) {
    console.error('Signup error:', err);

    res.status(500).json({
      error: 'Could not create account'
    });
  }
});

// ── POST /api/auth/verify-email — Step 2: verify code + issue token ───────────
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (user.isEmailVerified) return res.status(400).json({ error: 'Email already verified. Please log in.' });
    if (!user.emailVerifyCode || user.emailVerifyCode !== code.trim()) return res.status(400).json({ error: 'Invalid verification code' });
    if (new Date() > user.emailVerifyExpiry) return res.status(400).json({ error: 'Code expired. Please request a new one.' });

    user.isEmailVerified   = true;
    user.emailVerifyCode   = undefined;
    user.emailVerifyExpiry = undefined;
    await user.save();

    // Send welcome email (don't await — non-blocking)
    sendWelcomeEmail(email, user.firstName).catch(console.error);

    const token = signToken(user._id);
    res.json({ token, user: user.toJSON(), message: 'Email verified successfully!' });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── POST /api/auth/resend-code — resend verification code ────────────────────
router.post('/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (user.isEmailVerified) return res.status(400).json({ error: 'Email already verified' });

    const code = makeCode();
    user.emailVerifyCode   = code;
    user.emailVerifyExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
//    await sendVerificationEmail(email, user.firstName, code);
    res.json({ message: 'New verification code sent' });
  } catch (err) {
    res.status(500).json({ error: 'Could not resend code' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.isActive) return res.status(403).json({ error: 'Account suspended. Contact support.' });
   
    const token = signToken(user._id);
    res.json({ token, user: user.toJSON() });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/forgot-password — send reset link ─────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const user = await User.findOne({ email: email.toLowerCase() });
    // Always return success to prevent email enumeration
    if (!user) return res.json({ message: 'If this email exists, a reset link has been sent.' });

    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    user.resetToken       = token;
    user.resetTokenExpiry = expiry;
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    await sendPasswordResetEmail(email, user.firstName, resetLink);
    res.json({ message: 'If this email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Could not send reset email' });
  }
});

// ── POST /api/auth/reset-password — set new password using token ──────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) return res.status(400).json({ error: 'All fields required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.resetToken !== token) return res.status(400).json({ error: 'Invalid or expired reset link' });
    if (new Date() > user.resetTokenExpiry) return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });

    user.password         = newPassword; // pre-save hook will hash it
    user.resetToken       = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();
    res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Could not reset password' });
  }
});

// ── POST /api/auth/change-password — change password while logged in ──────────
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both fields required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) return res.status(401).json({ error: 'Current password is incorrect' });

    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Could not change password' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

module.exports = router;
