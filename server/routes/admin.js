// server/routes/admin.js  — admin-only API routes
const express = require('express');
const bcrypt  = require('bcryptjs');
const { db }  = require('../db');
const router  = express.Router();

// ── Restaurants ─────────────────────────────
router.get('/restaurants', (req, res) => {
  const rows = db.prepare(`
    SELECT r.*,
      COUNT(DISTINCT u.id) as user_count,
      COUNT(DISTINCT k.id) as keg_count
    FROM restaurants r
    LEFT JOIN users u ON u.restaurant_id=r.id
    LEFT JOIN kegs  k ON k.restaurant_id=r.id AND k.active=1
    GROUP BY r.id ORDER BY r.name
  `).all();
  res.json(rows);
});

router.post('/restaurants', (req, res) => {
  const { name, city, country, timezone, language, plan, renewal_date, owner_name, owner_email, owner_password } = req.body;
  const r = db.prepare(`
    INSERT INTO restaurants (name,city,country,timezone,language,plan,renewal_date)
    VALUES (?,?,?,?,?,?,?)
  `).run(name, city||'', country||'', timezone||'Europe/Berlin', language||'en', plan||'starter', renewal_date||null);
  if (owner_email && owner_name) {
    const hash = bcrypt.hashSync(owner_password || 'changeme123', 10);
    db.prepare("INSERT OR IGNORE INTO users (name,email,password_hash,role,language,restaurant_id) VALUES (?,?,?,'user',?,?)")
      .run(owner_name, owner_email, hash, language||'en', r.lastInsertRowid);
  }
  res.json({ success: true, id: r.lastInsertRowid });
});

router.put('/restaurants/:id', (req, res) => {
  const { name, city, country, timezone, language, plan, renewal_date, active } = req.body;
  db.prepare(`
    UPDATE restaurants SET name=?,city=?,country=?,timezone=?,language=?,plan=?,renewal_date=?,active=? WHERE id=?
  `).run(name, city, country, timezone, language, plan, renewal_date, active?1:0, req.params.id);
  res.json({ success: true });
});

router.post('/restaurants/:id/suspend', (req, res) => {
  db.prepare("UPDATE restaurants SET active=0 WHERE id=?").run(req.params.id);
  res.json({ success: true });
});
router.post('/restaurants/:id/activate', (req, res) => {
  db.prepare("UPDATE restaurants SET active=1 WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

// ── Users ───────────────────────────────────
router.get('/users', (req, res) => {
  const rows = db.prepare(`
    SELECT u.*, r.name as restaurant_name FROM users u
    LEFT JOIN restaurants r ON u.restaurant_id=r.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(rows.map(u => ({ ...u, password_hash: undefined })));
});

router.post('/users', (req, res) => {
  const { name, email, password, role, restaurant_id, language } = req.body;
  const hash = bcrypt.hashSync(password || 'changeme123', 10);
  try {
    const r = db.prepare("INSERT INTO users (name,email,password_hash,role,restaurant_id,language) VALUES (?,?,?,?,?,?)")
      .run(name, email, hash, role||'user', restaurant_id||null, language||'en');
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Email already exists' });
  }
});

router.put('/users/:id', (req, res) => {
  const { name, email, role, restaurant_id, language, active } = req.body;
  db.prepare("UPDATE users SET name=?,email=?,role=?,restaurant_id=?,language=?,active=? WHERE id=?")
    .run(name, email, role, restaurant_id||null, language||'en', active?1:0, req.params.id);
  res.json({ success: true });
});

router.post('/users/:id/reset-password', (req, res) => {
  const { password } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hash, req.params.id);
  res.json({ success: true });
});

router.post('/users/:id/disable', (req, res) => {
  db.prepare("UPDATE users SET active=0 WHERE id=?").run(req.params.id);
  res.json({ success: true });
});
router.post('/users/:id/enable', (req, res) => {
  db.prepare("UPDATE users SET active=1 WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

// ── Kegs (admin) ─────────────────────────────
router.get('/kegs', (req, res) => {
  const rid = req.query.restaurant_id;
  let rows;
  if (rid) {
    rows = db.prepare(`SELECT k.*, r.name as restaurant_name FROM kegs k JOIN restaurants r ON k.restaurant_id=r.id WHERE k.restaurant_id=? AND k.active=1 ORDER BY k.tap_number`).all(rid);
  } else {
    rows = db.prepare(`SELECT k.*, r.name as restaurant_name FROM kegs k JOIN restaurants r ON k.restaurant_id=r.id WHERE k.active=1 ORDER BY r.name, k.tap_number`).all();
  }
  res.json(rows);
});

router.post('/kegs', (req, res) => {
  const { restaurant_id, tap_number, beer_name, keg_size_liters, esp32_sensor_id, esp32_display_id,
          co2_min_bar, temp_max_c, alert_low_pct, alert_critical_pct } = req.body;
  const r = db.prepare(`
    INSERT INTO kegs (restaurant_id,tap_number,beer_name,keg_size_liters,remaining_liters,
      esp32_sensor_id,esp32_display_id,co2_min_bar,temp_max_c,alert_low_pct,alert_critical_pct)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(restaurant_id, tap_number, beer_name, keg_size_liters, keg_size_liters,
         esp32_sensor_id||'', esp32_display_id||'', co2_min_bar||1.5, temp_max_c||6, alert_low_pct||20, alert_critical_pct||10);
  // Start a keg session
  db.prepare("INSERT INTO keg_sessions (keg_id,restaurant_id,keg_size) VALUES (?,?,?)").run(r.lastInsertRowid, restaurant_id, keg_size_liters);
  res.json({ success: true, id: r.lastInsertRowid });
});

router.put('/kegs/:id', (req, res) => {
  const { beer_name, keg_size_liters, esp32_sensor_id, esp32_display_id,
          co2_min_bar, temp_max_c, alert_low_pct, alert_critical_pct } = req.body;
  db.prepare(`UPDATE kegs SET beer_name=?,keg_size_liters=?,esp32_sensor_id=?,esp32_display_id=?,
    co2_min_bar=?,temp_max_c=?,alert_low_pct=?,alert_critical_pct=? WHERE id=?`)
    .run(beer_name, keg_size_liters, esp32_sensor_id, esp32_display_id,
         co2_min_bar, temp_max_c, alert_low_pct, alert_critical_pct, req.params.id);
  res.json({ success: true });
});

router.post('/kegs/:id/new-keg', (req, res) => {
  const keg = db.prepare("SELECT * FROM kegs WHERE id=?").get(req.params.id);
  if (!keg) return res.status(404).json({ error: 'Not found' });
  // Close current session
  db.prepare("UPDATE keg_sessions SET ended_at=datetime('now') WHERE keg_id=? AND ended_at IS NULL").run(keg.id);
  // Reset keg
  db.prepare("UPDATE kegs SET remaining_liters=?, fob_active=0 WHERE id=?").run(keg.keg_size_liters, keg.id);
  // New session
  db.prepare("INSERT INTO keg_sessions (keg_id,restaurant_id,keg_size) VALUES (?,?,?)").run(keg.id, keg.restaurant_id, keg.keg_size_liters);
  // Log alert
  db.prepare("INSERT INTO alerts (restaurant_id,keg_id,type,message) VALUES (?,?,'info',?)").run(keg.restaurant_id, keg.id, `Manual keg change — ${keg.beer_name} Tap #${keg.tap_number}`);
  res.json({ success: true });
});

// ── Platform settings ───────────────────────
router.get('/settings', (req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const obj  = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

router.post('/settings', (req, res) => {
  const upsert = db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)");
  db.transaction(() => {
    Object.entries(req.body).forEach(([k,v]) => upsert.run(k, v));
  })();
  res.json({ success: true });
});

// ── System stats ─────────────────────────────
router.get('/system', (req, res) => {
  const uptime    = process.uptime();
  const mem       = process.memoryUsage();
  const db_size   = (() => { try { return require('fs').statSync(require('path').join(__dirname,'../../data/beercontrol.db')).size; } catch { return 0; } })();
  const total_events = db.prepare("SELECT COUNT(*) as c FROM pour_events").get().c;
  const total_liters = db.prepare("SELECT COALESCE(SUM(liters),0) as t FROM pour_events").get().t;
  res.json({ uptime, mem_mb: (mem.rss/1024/1024).toFixed(1), db_size_kb: (db_size/1024).toFixed(0), total_events, total_liters: total_liters.toFixed(1) });
});

module.exports = router;
