// ─── services/email.js ────────────────────────────────────────────────────────
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT   === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.EMAIL_FROM || 'SwiftSMS <noreply@swiftsms.io>';

const baseStyle = `font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d0f14;color:#f0f2f7;padding:32px;border-radius:12px`;
const logoHtml  = `<h2 style="font-size:22px;font-weight:800;margin:0 0 4px">Swift<span style="color:#4ade80">SMS</span></h2><p style="color:#8b95a8;font-size:11px;margin:0 0 28px;letter-spacing:.06em">GLOBAL SMS PLATFORM</p>`;

// ── Signup email verification code (only for new signups) ─────────────────────
const sendVerificationEmail = async (to, firstName, code) => {
  await transporter.sendMail({
    from: FROM, to,
    subject: 'Verify your SwiftSMS account',
    html: `<div style="${baseStyle}">${logoHtml}
      <h3 style="font-size:17px;margin:0 0 10px">Hi ${firstName}, verify your email</h3>
      <p style="color:#8b95a8;font-size:14px;margin:0 0 20px">Enter this 6-digit code to activate your account. It expires in <strong style="color:#f0f2f7">15 minutes</strong>.</p>
      <div style="background:#181c24;border:1px solid #252a38;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px">
        <span style="font-family:monospace;font-size:40px;font-weight:700;letter-spacing:12px;color:#4ade80">${code}</span>
      </div>
      <p style="color:#4d5668;font-size:12px;margin:0">If you didn't create a SwiftSMS account, ignore this email.</p>
    </div>`,
  });
};

// ── Password reset link ───────────────────────────────────────────────────────
const sendPasswordResetEmail = async (to, firstName, resetLink) => {
  await transporter.sendMail({
    from: FROM, to,
    subject: 'Reset your SwiftSMS password',
    html: `<div style="${baseStyle}">${logoHtml}
      <h3 style="font-size:17px;margin:0 0 10px">Hi ${firstName}, reset your password</h3>
      <p style="color:#8b95a8;font-size:14px;margin:0 0 20px">Click the button below to set a new password. This link expires in <strong style="color:#f0f2f7">1 hour</strong>.</p>
      <a href="${resetLink}" style="display:inline-block;background:#4ade80;color:#000;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;margin-bottom:20px">Reset Password →</a>
      <p style="color:#8b95a8;font-size:12px;margin:0 0 8px">Or copy this link:</p>
      <p style="color:#4ade80;font-size:11px;word-break:break-all;font-family:monospace;margin:0 0 24px">${resetLink}</p>
      <p style="color:#4d5668;font-size:12px;margin:0">If you didn't request this, ignore this email — your password won't change.</p>
    </div>`,
  });
};

// ── Welcome email after successful verification ───────────────────────────────
const sendWelcomeEmail = async (to, firstName) => {
  await transporter.sendMail({
    from: FROM, to,
    subject: 'Welcome to SwiftSMS 🚀',
    html: `<div style="${baseStyle}">${logoHtml}
      <h3 style="font-size:17px;margin:0 0 10px">Welcome, ${firstName}! 🎉</h3>
      <p style="color:#8b95a8;font-size:14px;margin:0 0 16px">Your account is verified and ready. Here's what you can do:</p>
      <ul style="color:#8b95a8;font-size:14px;padding-left:20px;margin:0 0 20px">
        <li style="margin-bottom:8px">Top up your wallet with <strong style="color:#f7931a">Bitcoin</strong></li>
        <li style="margin-bottom:8px">Send bulk SMS to <strong style="color:#f0f2f7">any country</strong></li>
        <li>Track campaigns with <strong style="color:#f0f2f7">real-time delivery logs</strong></li>
      </ul>
      <p style="color:#4d5668;font-size:12px;margin:0">Questions? Reply to this email.</p>
    </div>`,
  });
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail };