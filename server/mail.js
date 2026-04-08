// server/mail.js
const nodemailer = require('nodemailer');
const { db } = require('./db');

async function sendMail({ to, subject, html, text }) {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'admin_email')").all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);

  if (!settings.smtp_host) {
    console.error('[Mail] SMTP not configured. Skipping email.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: parseInt(settings.smtp_port) || 587,
    secure: settings.smtp_port == 465,
    auth: settings.smtp_user ? {
      user: settings.smtp_user,
      pass: settings.smtp_pass
    } : undefined
  });

  try {
    const info = await transporter.sendMail({
      from: settings.smtp_from || 'no-reply@beercontrol.io',
      to: to || settings.admin_email,
      subject,
      text,
      html
    });
    console.log('[Mail] Sent:', info.messageId);
    return info;
  } catch (err) {
    console.error('[Mail] Error:', err.message);
    throw err;
  }
}

module.exports = { sendMail };
