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
router.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.json({ success: false, error: 'missing_fields' });
    }

    const user = await db.get(`
      SELECT u.*, r.name as restaurant_name, r.language as rest_language, r.active as rest_active
      FROM users u
      LEFT JOIN restaurants r ON u.restaurant_id = r.id
      WHERE u.email = ?
    `, [email.trim()]);

    if (!user) {
      console.log(`❌ Login failed: User not found [${email.trim()}]`);
      return res.json({ success: false, error: 'invalid_credentials' });
    }
    if (!user.active) {
      console.log(`❌ Login failed: Account disabled [${email.trim()}]`);
      return res.json({ success: false, error: 'account_disabled' });
    }
    
    // In MySQL, boolean/tinyint 0/1 are used.
    if (user.role !== 'admin' && user.rest_active === 0) {
      console.log(`❌ Login failed: Restaurant suspended [${email.trim()}]`);
      return res.json({ success: false, error: 'restaurant_suspended' });
    }

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) {
      console.log(`❌ Login failed: Password mismatch [${email.trim()}]`);
      return res.json({ success: false, error: 'invalid_credentials' });
    }

    console.log(`✅ Login successful: ${user.email} (${user.role})`);

    // Update last login
    await db.run("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);

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
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
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
