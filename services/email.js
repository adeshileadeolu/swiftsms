// ─── services/email.js — Nodemailer email service ────────────────────────────
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.EMAIL_FROM || 'SwiftSMS <noreply@swiftsms.io>';

// ── Send email verification code ─────────────────────────────────────────────
const sendVerificationEmail = async (to, firstName, code) => {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Verify your SwiftSMS account',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d0f14;color:#f0f2f7;padding:32px;border-radius:12px">
        <h2 style="font-size:22px;font-weight:800;margin:0 0 6px">Swift<span style="color:#4ade80">SMS</span></h2>
        <p style="color:#8b95a8;font-size:12px;margin:0 0 28px;letter-spacing:.06em">GLOBAL SMS PLATFORM</p>
        <h3 style="font-size:17px;margin:0 0 12px">Hi ${firstName}, verify your email</h3>
        <p style="color:#8b95a8;font-size:14px;margin:0 0 24px">Enter this code on the SwiftSMS signup page to verify your email address. It expires in <strong style="color:#f0f2f7">15 minutes</strong>.</p>
        <div style="background:#181c24;border:1px solid #252a38;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px">
          <span style="font-family:monospace;font-size:36px;font-weight:700;letter-spacing:10px;color:#4ade80">${code}</span>
        </div>
        <p style="color:#4d5668;font-size:12px;margin:0">If you did not create a SwiftSMS account, you can safely ignore this email.</p>
      </div>`,
  });
};

// ── Send password reset link ──────────────────────────────────────────────────
const sendPasswordResetEmail = async (to, firstName, resetLink) => {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Reset your SwiftSMS password',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d0f14;color:#f0f2f7;padding:32px;border-radius:12px">
        <h2 style="font-size:22px;font-weight:800;margin:0 0 6px">Swift<span style="color:#4ade80">SMS</span></h2>
        <p style="color:#8b95a8;font-size:12px;margin:0 0 28px;letter-spacing:.06em">GLOBAL SMS PLATFORM</p>
        <h3 style="font-size:17px;margin:0 0 12px">Hi ${firstName}, reset your password</h3>
        <p style="color:#8b95a8;font-size:14px;margin:0 0 24px">Click the button below to set a new password. This link expires in <strong style="color:#f0f2f7">1 hour</strong>.</p>
        <a href="${resetLink}" style="display:inline-block;background:#4ade80;color:#000;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;margin-bottom:24px">Reset Password</a>
        <p style="color:#8b95a8;font-size:12px;margin:0 0 8px">Or copy this link into your browser:</p>
        <p style="color:#4ade80;font-size:11px;word-break:break-all;font-family:monospace;margin:0 0 24px">${resetLink}</p>
        <p style="color:#4d5668;font-size:12px;margin:0">If you did not request a password reset, ignore this email — your password will not change.</p>
      </div>`,
  });
};

// ── Send welcome email after verification ─────────────────────────────────────
const sendWelcomeEmail = async (to, firstName) => {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Welcome to SwiftSMS 🚀',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d0f14;color:#f0f2f7;padding:32px;border-radius:12px">
        <h2 style="font-size:22px;font-weight:800;margin:0 0 6px">Swift<span style="color:#4ade80">SMS</span></h2>
        <p style="color:#8b95a8;font-size:12px;margin:0 0 28px;letter-spacing:.06em">GLOBAL SMS PLATFORM</p>
        <h3 style="font-size:17px;margin:0 0 12px">Welcome aboard, ${firstName}! 🎉</h3>
        <p style="color:#8b95a8;font-size:14px;margin:0 0 16px">Your email is verified and your account is ready. Here's what you can do:</p>
        <ul style="color:#8b95a8;font-size:14px;padding-left:20px;margin:0 0 24px">
          <li style="margin-bottom:8px">Top up your wallet with <strong style="color:#f7931a">Bitcoin</strong></li>
          <li style="margin-bottom:8px">Send bulk SMS to <strong style="color:#f0f2f7">any country</strong></li>
          <li>Track delivery with <strong style="color:#f0f2f7">real-time campaign logs</strong></li>
        </ul>
        <p style="color:#4d5668;font-size:12px;margin:0">Questions? Reply to this email and we'll help.</p>
      </div>`,
  });
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail };
