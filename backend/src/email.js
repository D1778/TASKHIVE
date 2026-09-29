const nodemailer = require('nodemailer');

if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.warn('[email] SMTP_HOST / SMTP_USER / SMTP_PASS not set — password reset emails will fail.');
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendPasswordResetEmail(toEmail, userName, tempPassword) {
  const from = process.env.SMTP_FROM || `"TaskHive" <${process.env.SMTP_USER}>`;
  const subject = 'TaskHive — Your Temporary Password';
  const html = `
    <div style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #6366f1; margin: 0; font-size: 26px;">🐝 TaskHive</h2>
        <p style="color: #94a3b8; font-size: 13px; margin-top: 4px;">Password Reset</p>
      </div>
      <p style="color: #334155; font-size: 15px; line-height: 1.5;">Hello <strong>${userName}</strong>,</p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        We received a request to reset your password for your TaskHive account (<strong>${toEmail}</strong>).
      </p>
      <p style="color: #475569; font-size: 14px;">Your new temporary password is:</p>
      <div style="background: linear-gradient(135deg, #eef2ff, #f1f5f9); padding: 18px 24px; border-radius: 10px; border: 2px dashed #6366f1; font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; color: #4338ca; text-align: center; margin: 20px 0; letter-spacing: 3px;">
        ${tempPassword}
      </div>
      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        Use this password to sign in. We strongly recommend changing your password after logging in.
      </p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;">
      <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">
        If you did not request this, please ignore this email or secure your account immediately.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({ from, to: toEmail, subject, html });
    console.log(`[email] Password reset email sent to ${toEmail}`);
    return { sent: true };
  } catch (err) {
    console.error(`[email] Failed to send email to ${toEmail}:`, err.message);
    throw new Error('Failed to send email. Please try again later or contact support.');
  }
}

module.exports = { sendPasswordResetEmail };
