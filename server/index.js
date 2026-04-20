'use strict';
require('dotenv').config();

const express      = require('express');
const session      = require('express-session');
const cookieParser = require('cookie-parser');
const path         = require('path');

const { db, runMigrations } = require('./db');
const authRouter   = require('./routes/auth');
const apiRouter    = require('./routes/api');
const adminRouter  = require('./routes/admin');
const billingRouter= require('./routes/billing');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Webhooks & Billing ────────────────────
app.use('/api/billing', billingRouter); // Mounted before global express.json() for webhook raw body

// ── Middleware ──────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'keghero-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// Static files with Cache-Busting middleware
app.use((req, res, next) => {
  if (req.url.endsWith('.html') || req.url.endsWith('.css') || req.url.endsWith('.js')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'data', 'uploads')));

// ── Auth middleware ─────────────────────────
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect('/login');
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).json({ error: 'Admin only' });
}

// ── Routes ─────────────────────────────────
app.use('/', authRouter);
app.use('/api', requireLogin, apiRouter);
app.use('/api/admin', requireLogin, requireAdmin, adminRouter);

// ── Main app (served after login) ──────────
app.get('/app', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
});

// ── Root redirect ───────────────────────────
app.get('/', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/app');
  res.redirect('/login');
});

// ── Start ───────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🍺  KegHero running at http://localhost:${PORT}`);
  
  // Await migrations before anything else
  await runMigrations();

  console.log(`    Admin: admin / admin\n`);
  
  // Ensure default admin exists
  try {
    const bcrypt = require('bcryptjs');
    const existing = await db.get("SELECT id FROM users WHERE email = 'admin'");
    if (!existing) {
      const hash = bcrypt.hashSync('admin', 10);
      await db.run("INSERT INTO users (name, email, password_hash, role, active) VALUES (?,?,?,?,?)",
        ['Admin', 'admin', hash, 'admin', 1]);
      console.log('🛡️  System: Default admin account created (admin / admin)');
    } else {
      console.log('🛡️  System: Admin account verified.');
    }
  } catch (e) {
    console.error('🛡️  System: Error checking admin account:', e.message);
  }

  // Start MQTT Service
  require('./mqtt').init();
  require('./mqttLogic'); // Initialize logic engine
});

// ── Display Dashboard (Raspi) ───────────────
app.get('/display/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'display.html'));
});

module.exports = app;
