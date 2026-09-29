const nodemailer = require('nodemailer');

let transporter = null;

if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  });
}

async function sendPasswordResetEmail(toEmail, userName, tempPassword) {
  const from = process.env.SMTP_FROM || '"TaskHive Security" <no-reply@taskhive.app>';
  const subject = 'TaskHive — Temporary Password & Account Reset';
  const html = `
    <div style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="display: flex; align-items: center; margin-bottom: 20px;">
        <h2 style="color: #6366f1; margin: 0; font-size: 22px;">TaskHive</h2>
      </div>
      <p style="color: #334155; font-size: 15px; line-height: 1.5;">Hello <strong>${userName}</strong>,</p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        We received a request to reset your password for your TaskHive account (<strong>${toEmail}</strong>).
      </p>
      <p style="color: #475569; font-size: 14px;">Your new temporary password is:</p>
      <div style="background: #f1f5f9; padding: 16px 20px; border-radius: 8px; border: 1px dashed #cbd5e1; font-family: monospace; font-size: 20px; font-weight: bold; color: #4338ca; text-align: center; margin: 18px 0; letter-spacing: 2px;">
        ${tempPassword}
      </div>
      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        You can now sign in using this password. We recommend updating your password once you are logged in.
      </p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;">
      <p style="font-size: 12px; color: #94a3b8; margin: 0;">
        If you did not request a password reset, please secure your account immediately or contact support.
      </p>
    </div>
  `;

  console.log(`\n==================================================`);
  console.log(`[EMAIL DISPATCH] Password Reset Email to: ${toEmail}`);
  console.log(`[EMAIL DISPATCH] Temporary Password: ${tempPassword}`);
  console.log(`==================================================\n`);

  if (transporter) {
    try {
      await transporter.sendMail({ from, to: toEmail, subject, html });
      console.log(`[EMAIL DISPATCH] Email sent successfully via SMTP to ${toEmail}`);
      return { sent: true, method: 'smtp' };
    } catch (err) {
      console.error(`[EMAIL DISPATCH] SMTP send error:`, err.message);
      return { sent: false, error: err.message, tempPassword };
    }
  }

  return { sent: true, method: 'logger', tempPassword };
}

module.exports = { sendPasswordResetEmail };
