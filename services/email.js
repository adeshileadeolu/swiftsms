// email.js
const nodemailer = require('nodemailer');

const createTransporter = () => nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
});

const FROM = process.env.EMAIL_FROM || `SwiftSMS <${process.env.SMTP_USER}>`;

const sendVerificationEmail = async (to, firstName, code) => {
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Your SwiftSMS verification code',
    text: `Hi ${firstName},\n\nYour SwiftSMS verification code is: ${code}\n\nIt expires in 15 minutes.\n\nIf you did not sign up, ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0d0f14;color:#f0f2f7;border-radius:12px">
        <h2 style="margin:0 0 4px;font-size:22px">Swift<span style="color:#4ade80">SMS</span></h2>
        <p style="color:#8b95a8;font-size:11px;margin:0 0 28px;letter-spacing:.06em">GLOBAL SMS PLATFORM</p>
        <h3 style="margin:0 0 12px;font-size:17px">Hi ${firstName}, here is your verification code</h3>
        <p style="color:#8b95a8;font-size:14px;margin:0 0 20px">Enter this code to activate your SwiftSMS account. It expires in <strong style="color:#f0f2f7">15 minutes</strong>.</p>
        <div style="background:#181c24;border:2px solid #4ade8040;border-radius:12px;padding:28px;text-align:center;margin-bottom:24px">
          <span style="font-family:monospace;font-size:42px;font-weight:700;letter-spacing:14px;color:#4ade80">${code}</span>
        </div>
        <p style="color:#4d5668;font-size:12px">If you did not create a SwiftSMS account, ignore this email.</p>
      </div>`,
  });
  console.log('✓ Verification email sent to', to, '| MessageId:', info.messageId);
  return info;
};

const sendPasswordResetEmail = async (to, firstName, resetLink) => {
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Reset your SwiftSMS password',
    text: `Hi ${firstName},\n\nReset your password using this link:\n${resetLink}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0d0f14;color:#f0f2f7;border-radius:12px">
        <h2 style="margin:0 0 4px;font-size:22px">Swift<span style="color:#4ade80">SMS</span></h2>
        <p style="color:#8b95a8;font-size:11px;margin:0 0 28px;letter-spacing:.06em">GLOBAL SMS PLATFORM</p>
        <h3 style="margin:0 0 12px;font-size:17px">Hi ${firstName}, reset your password</h3>
        <p style="color:#8b95a8;font-size:14px;margin:0 0 20px">Click below to set a new password. This link expires in <strong style="color:#f0f2f7">1 hour</strong>.</p>
        <a href="${resetLink}" style="display:inline-block;background:#4ade80;color:#000;font-weight:700;font-size:14px;padding:14px 28px;border-radius:8px;text-decoration:none;margin-bottom:20px">Reset Password →</a>
        <p style="color:#8b95a8;font-size:12px;margin:0 0 8px">Or copy this link into your browser:</p>
        <p style="color:#4ade80;font-size:11px;word-break:break-all;font-family:monospace;margin:0 0 24px">${resetLink}</p>
        <p style="color:#4d5668;font-size:12px">If you did not request this, ignore this email.</p>
      </div>`,
  });
  console.log('✓ Password reset email sent to', to, '| MessageId:', info.messageId);
  return info;
};

const sendWelcomeEmail = async (to, firstName) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `Welcome to SwiftSMS, ${firstName}!`,
    text: `Hi ${firstName},\n\nYour SwiftSMS account is verified and ready.\n\nTop up with Bitcoin and start sending SMS globally.\n\nWelcome aboard!`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0d0f14;color:#f0f2f7;border-radius:12px">
        <h2 style="margin:0 0 4px;font-size:22px">Swift<span style="color:#4ade80">SMS</span></h2>
        <p style="color:#8b95a8;font-size:11px;margin:0 0 28px;letter-spacing:.06em">GLOBAL SMS PLATFORM</p>
        <h3 style="margin:0 0 12px;font-size:17px">Welcome, ${firstName}! 🎉</h3>
        <p style="color:#8b95a8;font-size:14px;margin:0 0 16px">Your account is verified and ready. Here is what you can do:</p>
        <ul style="color:#8b95a8;font-size:14px;padding-left:20px;margin:0 0 20px">
          <li style="margin-bottom:8px">Top up your wallet with <strong style="color:#f7931a">Bitcoin</strong></li>
          <li style="margin-bottom:8px">Send bulk SMS to <strong style="color:#f0f2f7">any country worldwide</strong></li>
          <li>Track campaigns with <strong style="color:#f0f2f7">real-time delivery logs</strong></li>
        </ul>
        <p style="color:#4d5668;font-size:12px">Questions? Reply to this email and we will help.</p>
      </div>`,
  });
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail };