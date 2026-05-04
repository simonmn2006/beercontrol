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

    console.log(`✅ Login successful: ${user.email} (${user.role}) | SID: ${req.sessionID}`);

    // Fetch all accessible restaurants for this user
    let access = [];
    if (user.role === 'admin') {
      // Admins see all active restaurants
      const allRests = await db.all("SELECT id, name FROM restaurants WHERE active=1");
      access = allRests.map(r => ({ id: r.id, name: r.name }));
    } else {
      // Check the mapping table
      const userAccess = await db.all(`
        SELECT r.id, r.name 
        FROM user_restaurant_access ura
        JOIN restaurants r ON ura.restaurant_id = r.id
        WHERE ura.user_id = ? AND r.active = 1
      `, [user.id]);
      
      access = userAccess.map(r => ({ id: r.id, name: r.name }));
      
      // Also include the primary restaurant if not already in the list
      if (user.restaurant_id && !access.find(a => a.id === user.restaurant_id)) {
        access.push({ id: user.restaurant_id, name: user.restaurant_name });
      }
    }

    // Store session
    req.session.user = {
      id:            user.id,
      name:          user.name,
      email:         user.email,
      role:          user.role,
      restaurant_id: user.restaurant_id || (access.length > 0 ? access[0].id : null),
      restaurant:    user.restaurant_name || (access.length > 0 ? access[0].name : null),
      language:      user.language || user.rest_language || 'en',
      access:        access
    };

    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error:', err);
        return res.status(500).json({ success: false, error: 'session_error' });
      }
      res.json({
        success:  true,
        role:     user.role,
        name:     user.name,
        language: user.language || user.rest_language || 'en',
        redirect: '/app',
      });
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

// ── Switch Restaurant ───────────────────────
router.post('/api/me/switch-restaurant', async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'unauthorized' });
  
  const { restaurant_id } = req.body;
  if (!restaurant_id) return res.status(400).json({ error: 'missing_id' });

  // Verify access
  const hasAccess = req.session.user.access.find(a => Number(a.id) === Number(restaurant_id));
  if (!hasAccess && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'no_access' });
  }

  // Update session
  const rest = await db.get("SELECT name FROM restaurants WHERE id=?", [restaurant_id]);
  if (!rest) return res.status(404).json({ error: 'not_found' });

  req.session.user.restaurant_id = Number(restaurant_id);
  req.session.user.restaurant = rest.name;
  
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'save_error' });
    res.json({ success: true, restaurant: rest.name });
  });
});

module.exports = router;
