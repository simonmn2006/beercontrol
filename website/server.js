const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 8082;

app.use(express.json());
app.use(express.static(__dirname));
app.use(session({
  secret: 'standalone-website-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const DATA_FILE = path.join(__dirname, 'content.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Initialize data file if not exists
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    de: {
      hero_title: 'Übernehmen Sie die volle Kontrolle über Ihr <span>Fassbier</span>',
      hero_subtitle: 'Vermeiden Sie Verschwendung, beeindrucken Sie Kunden mit Live-Displays...'
    },
    en: {
      hero_title: 'Take full control of your <span>draft beer</span>',
      hero_subtitle: 'Avoid waste, impress customers...'
    }
  }, null, 2));
}

// ── Admin Routes ───────────────────────────
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin') {
    req.session.admin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

app.get('/admin/check', (req, res) => {
  res.json({ loggedIn: !!req.session.admin });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ── API ────────────────────────────────────
app.get('/api/content', (req, res) => {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  res.json(data);
});

// Save contact inquiry and send email
app.post('/api/contact', async (req, res) => {
  const inquiry = {
    ...req.body,
    timestamp: new Date().toISOString()
  };
  
  // 1. Save to JSON
  const INQUIRIES_FILE = path.join(__dirname, 'inquiries.json');
  let inquiries = [];
  if (fs.existsSync(INQUIRIES_FILE)) inquiries = JSON.parse(fs.readFileSync(INQUIRIES_FILE, 'utf8'));
  inquiries.push(inquiry);
  fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(inquiries, null, 2));

  // 2. Try to send Email notification
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (config.smtp && config.smtp.host) {
      const { host, port, secure, user, pass, from } = config.smtp;
      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(port),
        secure: secure === 'true' || secure === true,
        auth: { user, pass }
      });

      await transporter.sendMail({
        from: from || 'no-reply@keghero.de',
        to: from || 'info@keghero.de', // Send to admin
        subject: `New KegHero Inquiry from ${inquiry.name}`,
        html: `
          <h3>New Website Inquiry</h3>
          <p><strong>Name:</strong> ${inquiry.name}</p>
          <p><strong>Email:</strong> ${inquiry.email}</p>
          <p><strong>Message:</strong></p>
          <p style="padding: 15px; background: #f5f5f5; border-radius: 5px;">${inquiry.message}</p>
          <hr>
          <p style="font-size: 11px; color: #999;">Sent from KegHero Website Server</p>
        `
      });
    }
  } catch (err) {
    console.error('[Contact Email Error]', err);
  }

  res.json({ success: true });
});

app.get('/api/admin/inquiries', (req, res) => {
  if (!req.session.admin) return res.status(403).send('Forbidden');
  const INQUIRIES_FILE = path.join(__dirname, 'inquiries.json');
  let inquiries = [];
  if (fs.existsSync(INQUIRIES_FILE)) inquiries = JSON.parse(fs.readFileSync(INQUIRIES_FILE, 'utf8'));
  res.json(inquiries);
});

// ── SMTP Settings ──────────────────────────
app.get('/api/admin/smtp', (req, res) => {
  if (!req.session.admin) return res.status(403).send('Forbidden');
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  res.json(config.smtp || {});
});

app.post('/api/admin/smtp', (req, res) => {
  if (!req.session.admin) return res.status(403).send('Forbidden');
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  config.smtp = req.body;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  res.json({ success: true });
});

app.post('/api/admin/test-email', async (req, res) => {
  if (!req.session.admin) return res.status(403).send('Forbidden');
  const { host, port, secure, user, pass, from } = req.body;
  
  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port),
      secure: secure === 'true' || secure === true,
      auth: { user, pass }
    });

    await transporter.verify();
    
    await transporter.sendMail({
      from,
      to: from,
      subject: 'KegHero SMTP Test',
      text: 'Your SMTP settings are working correctly!'
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/content', (req, res) => {
  if (!req.session.admin) return res.status(403).send('Forbidden');
  const { lang, key, value } = req.body;
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!data[lang]) data[lang] = {};
  data[lang][key] = value;
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

app.post('/api/content/restore', (req, res) => {
  if (!req.session.admin) return res.status(403).send('Forbidden');
  const DEFAULTS_FILE = path.join(__dirname, 'content_defaults.json');
  if (fs.existsSync(DEFAULTS_FILE)) {
    const defaults = fs.readFileSync(DEFAULTS_FILE, 'utf8');
    fs.writeFileSync(DATA_FILE, defaults);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: 'Defaults file not found' });
  }
});

// Serve Admin UI
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🌐 Standalone Website Server running at http://localhost:${PORT}`);
  console.log(`   Admin: http://localhost:${PORT}/admin (admin / admin)\n`);
});
