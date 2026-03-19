// server/routes/api.js  — routes for logged-in users (both admin and restaurant)
const express = require('express');
const { db }  = require('../db');
const router  = express.Router();

// ── Dashboard stats ─────────────────────────
router.get('/dashboard', (req, res) => {
  const user = req.session.user;

  if (user.role === 'admin') {
    const active_restaurants = db.prepare("SELECT COUNT(*) as c FROM restaurants WHERE active=1").get().c;
    const kegs_online  = db.prepare("SELECT COUNT(*) as c FROM kegs WHERE online=1 AND active=1").get().c;
    const kegs_offline = db.prepare("SELECT COUNT(*) as c FROM kegs WHERE online=0 AND active=1").get().c;
    const liters_today = db.prepare(`
      SELECT COALESCE(SUM(liters),0) as total FROM pour_events
      WHERE date(recorded_at) = date('now')
    `).get().total;
    const low_alerts = db.prepare(`
      SELECT COUNT(*) as c FROM alerts WHERE resolved=0 AND type IN ('low','critical')
    `).get().c;
    const restaurants = db.prepare(`
      SELECT r.*, 
        COUNT(DISTINCT k.id) as tap_count,
        COALESCE(SUM(CASE WHEN date(pe.recorded_at)=date('now') THEN pe.liters ELSE 0 END),0) as poured_today,
        COUNT(DISTINCT CASE WHEN ks.started_at >= date('now') THEN ks.id END) as keg_changes_today
      FROM restaurants r
      LEFT JOIN kegs k ON k.restaurant_id = r.id AND k.active=1
      LEFT JOIN pour_events pe ON pe.restaurant_id = r.id
      LEFT JOIN keg_sessions ks ON ks.restaurant_id = r.id
      GROUP BY r.id ORDER BY r.name
    `).all();
    return res.json({ active_restaurants, kegs_online, kegs_offline, liters_today, low_alerts, restaurants });
  }

  // Restaurant user
  const rid = user.restaurant_id;
  const kegs = db.prepare(`
    SELECT k.*,
      COALESCE((SELECT SUM(pe.liters) FROM pour_events pe 
                WHERE pe.keg_id=k.id AND date(pe.recorded_at)=date('now')),0) as poured_today
    FROM kegs k WHERE k.restaurant_id=? AND k.active=1 ORDER BY k.tap_number
  `).all(rid);
  const poured_today = db.prepare(`
    SELECT COALESCE(SUM(liters),0) as t FROM pour_events 
    WHERE restaurant_id=? AND date(recorded_at)=date('now')
  `).get(rid).t;
  const keg_changes = db.prepare(`
    SELECT COUNT(*) as c FROM keg_sessions 
    WHERE restaurant_id=? AND date(started_at)=date('now')
  `).get(rid).c;
  const alerts = db.prepare(`
    SELECT * FROM alerts WHERE restaurant_id=? AND resolved=0 ORDER BY created_at DESC LIMIT 20
  `).all(rid);
  const activity = db.prepare(`
    SELECT a.* FROM alerts a WHERE a.restaurant_id=? ORDER BY a.created_at DESC LIMIT 30
  `).all(rid);
  res.json({ kegs, poured_today, keg_changes, alerts, activity });
});

// ── Kegs ────────────────────────────────────
router.get('/kegs', (req, res) => {
  const user = req.session.user;
  const rid  = req.query.restaurant_id || user.restaurant_id;
  if (user.role !== 'admin' && String(rid) !== String(user.restaurant_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const kegs = db.prepare(`
    SELECT k.*,
      COALESCE((SELECT SUM(pe.liters) FROM pour_events pe 
                WHERE pe.keg_id=k.id AND date(pe.recorded_at)=date('now')),0) as poured_today,
      COALESCE((SELECT SUM(pe.liters) FROM pour_events pe WHERE pe.keg_id=k.id),0) as poured_total
    FROM kegs k WHERE k.restaurant_id=? AND k.active=1 ORDER BY k.tap_number
  `).all(rid);
  res.json(kegs);
});

// ── Reports ─────────────────────────────────
router.get('/reports', (req, res) => {
  const user   = req.session.user;
  const rid    = req.query.restaurant_id || user.restaurant_id;
  const from   = req.query.from || new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
  const to     = req.query.to   || new Date().toISOString().slice(0,10);
  const keg_id = req.query.keg_id;

  if (user.role !== 'admin' && String(rid) !== String(user.restaurant_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  let pourFilter = "WHERE pe.restaurant_id=? AND date(pe.recorded_at) BETWEEN ? AND ?";
  let params     = [rid, from, to];
  if (keg_id) { pourFilter += ' AND pe.keg_id=?'; params.push(keg_id); }

  const total_poured = db.prepare(`SELECT COALESCE(SUM(liters),0) as t FROM pour_events ${pourFilter}`).get(...params).t;
  const daily = db.prepare(`
    SELECT date(recorded_at) as day, COALESCE(SUM(liters),0) as liters
    FROM pour_events ${pourFilter} GROUP BY day ORDER BY day
  `).all(...params);
  const by_beer = db.prepare(`
    SELECT k.beer_name, COALESCE(SUM(pe.liters),0) as liters
    FROM pour_events pe JOIN kegs k ON pe.keg_id=k.id
    ${pourFilter} GROUP BY k.beer_name ORDER BY liters DESC
  `).all(...params);
  const keg_changes = db.prepare(`
    SELECT ks.*, k.beer_name, k.tap_number
    FROM keg_sessions ks JOIN kegs k ON ks.keg_id=k.id
    WHERE ks.restaurant_id=? AND date(ks.started_at) BETWEEN ? AND ?
    ORDER BY ks.started_at DESC
  `).all(rid, from, to);
  const keg_changes_count = keg_changes.length;
  const daily_avg = daily.length ? (total_poured / daily.length).toFixed(1) : 0;
  const best_day  = daily.length ? Math.max(...daily.map(d => d.liters)).toFixed(1) : 0;

  res.json({ total_poured: total_poured.toFixed(1), daily, by_beer, keg_changes, keg_changes_count, daily_avg, best_day });
});

// ── Alerts ──────────────────────────────────
router.get('/alerts', (req, res) => {
  const user = req.session.user;
  const rid  = user.role === 'admin' ? req.query.restaurant_id : user.restaurant_id;
  let alerts;
  if (rid) {
    alerts = db.prepare("SELECT a.*, k.beer_name, k.tap_number FROM alerts a LEFT JOIN kegs k ON a.keg_id=k.id WHERE a.restaurant_id=? ORDER BY a.created_at DESC LIMIT 50").all(rid);
  } else {
    alerts = db.prepare("SELECT a.*, k.beer_name, k.tap_number, r.name as restaurant_name FROM alerts a LEFT JOIN kegs k ON a.keg_id=k.id LEFT JOIN restaurants r ON a.restaurant_id=r.id ORDER BY a.created_at DESC LIMIT 100").all();
  }
  res.json(alerts);
});

router.post('/alerts/:id/resolve', (req, res) => {
  db.prepare("UPDATE alerts SET resolved=1 WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

// ── User settings / recipients ───────────────
router.get('/settings/recipients', (req, res) => {
  const rid = req.session.user.restaurant_id;
  if (!rid) return res.json({ email: [], telegram: [] });
  const rows = db.prepare("SELECT type, value FROM alert_recipients WHERE restaurant_id=?").all(rid);
  res.json({
    email:    rows.filter(r => r.type==='email').map(r => r.value),
    telegram: rows.filter(r => r.type==='telegram').map(r => r.value),
  });
});

router.post('/settings/recipients', (req, res) => {
  const rid = req.session.user.restaurant_id;
  if (!rid) return res.status(400).json({ error: 'No restaurant' });
  const { email, telegram } = req.body;
  db.prepare("DELETE FROM alert_recipients WHERE restaurant_id=?").run(rid);
  const ins = db.prepare("INSERT INTO alert_recipients (restaurant_id, type, value) VALUES (?,?,?)");
  (email    || []).slice(0,5).forEach(v => ins.run(rid,'email',v));
  (telegram || []).slice(0,5).forEach(v => ins.run(rid,'telegram',v));
  res.json({ success: true });
});

router.get('/settings/schedule', (req, res) => {
  const rid = req.session.user.restaurant_id;
  if (!rid) return res.json([]);
  res.json(db.prepare("SELECT * FROM schedule WHERE restaurant_id=? ORDER BY day_of_week").all(rid));
});

router.post('/settings/schedule', (req, res) => {
  const rid   = req.session.user.restaurant_id;
  const days  = req.body.days || [];
  const del   = db.prepare("DELETE FROM schedules WHERE restaurant_id=?");
  const ins   = db.prepare("INSERT INTO schedules (restaurant_id,day_of_week,open_time,close_time,enabled) VALUES (?,?,?,?,?)");
  db.transaction(() => {
    del.run(rid);
    days.forEach(d => ins.run(rid, d.day, d.open, d.close, d.enabled ? 1 : 0));
  })();
  res.json({ success: true });
});

// ── MQTT simulator endpoint (for testing without real ESP32) ──
router.post('/simulate/pour', (req, res) => {
  const { keg_id, liters } = req.body;
  const keg = db.prepare("SELECT * FROM kegs WHERE id=?").get(keg_id);
  if (!keg) return res.status(404).json({ error: 'Keg not found' });
  const newRem = Math.max(0, (keg.remaining_liters || keg.keg_size_liters) - liters);
  db.prepare("UPDATE kegs SET remaining_liters=?, current_flow=? WHERE id=?").run(newRem, liters, keg_id);
  db.prepare("INSERT INTO pour_events (keg_id, restaurant_id, liters, temp, co2) VALUES (?,?,?,?,?)").run(keg_id, keg.restaurant_id, liters, keg.current_temp, keg.current_co2);
  res.json({ success: true, remaining: newRem });
});

module.exports = router;
