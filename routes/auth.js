// auth.js
const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { User }    = require('../models');
const { authenticate } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } = require('../services/email');

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
const makeCode  = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password, company, country, agreedToTos } = req.body;

    if (!firstName || !lastName || !email || !password || !country)
      return res.status(400).json({ error: 'All fields are required' });
    if (!agreedToTos)
      return res.status(400).json({ error: 'You must agree to the Terms of Service' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const code   = makeCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      if (existing.isEmailVerified)
        return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
      // Resend code to unverified account
      existing.firstName         = firstName;
      existing.lastName          = lastName;
      existing.emailVerifyCode   = code;
      existing.emailVerifyExpiry = expiry;
      await existing.save();
      try {
        await sendVerificationEmail(email, firstName, code);
      } catch (emailErr) {
        console.error('Email send failed:', emailErr.message);
        return res.status(500).json({ error: `Account exists but email failed to send: ${emailErr.message}. Check SMTP settings in Railway.` });
      }
      return res.json({ message: 'Verification code sent to your email.', email, step: 'verify' });
    }

    const user = new User({
      firstName, lastName, email, password, company, country,
      agreedToTos, tosAgreedAt: new Date(),
      emailVerifyCode: code, emailVerifyExpiry: expiry,
    });
    await user.save();

    try {
      await sendVerificationEmail(email, firstName, code);
    } catch (emailErr) {
      console.error('Email send failed:', emailErr.message);
      // Delete the user so they can try again once SMTP is fixed
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({ error: `Account created but verification email failed: ${emailErr.message}. Check SMTP_HOST, SMTP_USER, SMTP_PASS in Railway Variables.` });
    }

    res.status(201).json({ message: 'Account created. Check your email for the 6-digit verification code.', email, step: 'verify' });

  } catch (err) {
    console.error('Signup error:', err.message);
    res.status(500).json({ error: `Could not create account: ${err.message}` });
  }
});

// ── POST /api/auth/verify-email ───────────────────────────────────────────────
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (user.isEmailVerified) return res.status(400).json({ error: 'Email already verified. Please log in.' });
    if (!user.emailVerifyCode || user.emailVerifyCode !== code.trim())
      return res.status(400).json({ error: 'Invalid verification code. Check your email and try again.' });
    if (new Date() > user.emailVerifyExpiry)
      return res.status(400).json({ error: 'Code has expired. Click Resend to get a new one.' });

    user.isEmailVerified   = true;
    user.emailVerifyCode   = undefined;
    user.emailVerifyExpiry = undefined;
    await user.save();

    sendWelcomeEmail(email, user.firstName).catch(e => console.error('Welcome email failed:', e.message));

    const token = signToken(user._id);
    res.json({ token, user: user.toJSON(), message: 'Email verified! Welcome to SwiftSMS.' });

  } catch (err) {
    console.error('Verify error:', err.message);
    res.status(500).json({ error: `Verification failed: ${err.message}` });
  }
});

// ── POST /api/auth/resend-code ────────────────────────────────────────────────
router.post('/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)              return res.status(404).json({ error: 'Account not found' });
    if (user.isEmailVerified) return res.status(400).json({ error: 'Email already verified. Please log in.' });

    const code = makeCode();
    user.emailVerifyCode   = code;
    user.emailVerifyExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    try {
      await sendVerificationEmail(email, user.firstName, code);
      res.json({ message: 'New verification code sent. Check your email.' });
    } catch (emailErr) {
      res.status(500).json({ error: `Could not send email: ${emailErr.message}. Check SMTP settings.` });
    }
  } catch (err) {
    res.status(500).json({ error: `Could not resend code: ${err.message}` });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// NO code required for login — just email and password
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.isActive)
      return res.status(403).json({ error: 'Account suspended. Contact support.' });
    if (!user.isEmailVerified)
      return res.status(403).json({
        error: 'Email not verified. Please complete signup verification first.',
        step: 'verify',
        email: user.email,
      });

    const token = signToken(user._id);
    res.json({ token, user: user.toJSON() });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: `Login failed: ${err.message}` });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ message: 'If this email exists, a reset link has been sent.' });

    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    user.resetToken       = token;
    user.resetTokenExpiry = expiry;
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}?token=${token}&email=${encodeURIComponent(email)}`;
    try {
      await sendPasswordResetEmail(email, user.firstName, resetLink);
      res.json({ message: 'If this email exists, a reset link has been sent.' });
    } catch (emailErr) {
      res.status(500).json({ error: `Could not send reset email: ${emailErr.message}` });
    }
  } catch (err) {
    res.status(500).json({ error: `Could not process request: ${err.message}` });
  }
});

// ── POST /api/auth/reset-password ────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) return res.status(400).json({ error: 'All fields required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.resetToken !== token) return res.status(400).json({ error: 'Invalid or expired reset link' });
    if (new Date() > user.resetTokenExpiry) return res.status(400).json({ error: 'Reset link expired. Please request a new one.' });

    user.password         = newPassword;
    user.resetToken       = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();
    res.json({ message: 'Password updated. You can now log in.' });

  } catch (err) {
    res.status(500).json({ error: `Could not reset password: ${err.message}` });
  }
});

// ── POST /api/auth/change-password ───────────────────────────────────────────
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both fields required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword)))
      return res.status(401).json({ error: 'Current password is incorrect' });

    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password changed successfully.' });

  } catch (err) {
    res.status(500).json({ error: `Could not change password: ${err.message}` });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

module.exports = router;
