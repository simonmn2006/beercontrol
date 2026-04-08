// server/routes/auth.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const path    = require('path');
const { db }  = require('../db');
const router  = express.Router();

// ── Login page ──────────────────────────────
router.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/app');
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'app.html'));
});

// ── Login POST ──────────────────────────────
router.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.json({ success: false, error: 'missing_fields' });
  }

  const user = db.prepare(`
    SELECT u.*, r.name as restaurant_name, r.language as rest_language, r.active as rest_active
    FROM users u
    LEFT JOIN restaurants r ON u.restaurant_id = r.id
    WHERE u.email = ? COLLATE NOCASE
  `).get(email.trim());

  if (!user) return res.json({ success: false, error: 'invalid_credentials' });
  if (!user.active) return res.json({ success: false, error: 'account_disabled' });
  if (user.role !== 'admin' && user.rest_active === 0) {
    return res.json({ success: false, error: 'restaurant_suspended' });
  }

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.json({ success: false, error: 'invalid_credentials' });

  // Update last login
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  // Store session
  req.session.user = {
    id:            user.id,
    name:          user.name,
    email:         user.email,
    role:          user.role,
    restaurant_id: user.restaurant_id,
    restaurant:    user.restaurant_name,
    language:      user.language || user.rest_language || 'en',
  };

  res.json({
    success:  true,
    role:     user.role,
    name:     user.name,
    language: user.language || user.rest_language || 'en',
    redirect: '/app',
  });
});

// ── Logout ──────────────────────────────────
router.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ── Session info ────────────────────────────
router.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

module.exports = router;
