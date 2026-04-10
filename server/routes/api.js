// server/routes/api.js  — routes for logged-in users (both admin and restaurant)
const express = require('express');
const { db, pool }  = require('../db');
const router  = express.Router();

// ── Dashboard stats ─────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const user = req.session.user;

    if (user.role === 'admin') {
      const active_restaurants_row = await db.get("SELECT COUNT(*) as c FROM restaurants WHERE active=1");
      const active_restaurants = active_restaurants_row.c;
      
      const kegs_online_row  = await db.get("SELECT COUNT(*) as c FROM kegs WHERE online=1 AND active=1");
      const kegs_online = kegs_online_row.c;

      const kegs_offline_row = await db.get("SELECT COUNT(*) as c FROM kegs WHERE online=0 AND active=1");
      const kegs_offline = kegs_offline_row.c;

      const liters_today_row = await db.get(`
        SELECT COALESCE(SUM(liters),0) as total FROM pour_events
        WHERE DATE(recorded_at) = CURDATE()
      `);
      const liters_today = liters_today_row.total;

      const low_alerts_row = await db.get(`
        SELECT COUNT(*) as c FROM alerts WHERE resolved=0 AND type IN ('low','critical')
      `);
      const low_alerts = low_alerts_row.c;

      const restaurants = await db.all(`
        SELECT r.*, 
          COUNT(DISTINCT k.id) as tap_count,
          COALESCE(SUM(CASE WHEN DATE(pe.recorded_at)=CURDATE() THEN pe.liters ELSE 0 END),0) as poured_today,
          COUNT(DISTINCT CASE WHEN ks.started_at >= CURDATE() THEN ks.id END) as keg_changes_today
        FROM restaurants r
        LEFT JOIN kegs k ON k.restaurant_id = r.id AND k.active=1
        LEFT JOIN pour_events pe ON pe.restaurant_id = r.id
        LEFT JOIN keg_sessions ks ON ks.restaurant_id = r.id
        GROUP BY r.id ORDER BY r.name
      `);
      return res.json({ active_restaurants, kegs_online, kegs_offline, liters_today, low_alerts, restaurants });
    }

    // Restaurant user
    const rid = user.restaurant_id;
    const kegs = await db.all(`
      SELECT k.*,
        COALESCE((SELECT SUM(pe.liters) FROM pour_events pe 
                  WHERE pe.keg_id=k.id AND DATE(pe.recorded_at)=CURDATE()),0) as poured_today
      FROM kegs k WHERE k.restaurant_id=? AND k.active=1 ORDER BY k.tap_number
    `, [rid]);

    const poured_today_row = await db.get(`
      SELECT COALESCE(SUM(liters),0) as t FROM pour_events 
      WHERE restaurant_id=? AND DATE(recorded_at)=CURDATE()
    `, [rid]);
    const poured_today = poured_today_row.t;

    const keg_changes_row = await db.get(`
      SELECT COUNT(*) as c FROM keg_sessions 
      WHERE restaurant_id=? AND DATE(started_at)=CURDATE()
    `, [rid]);
    const keg_changes = keg_changes_row.c;

    const alerts = await db.all(`
      SELECT * FROM alerts WHERE restaurant_id=? AND resolved=0 ORDER BY created_at DESC LIMIT 20
    `, [rid]);

    const activity = await db.all(`
      SELECT a.* FROM alerts a WHERE a.restaurant_id=? ORDER BY a.created_at DESC LIMIT 30
    `, [rid]);

    res.json({ kegs, poured_today, keg_changes, alerts, activity });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Kegs ────────────────────────────────────
router.get('/kegs', async (req, res) => {
  try {
    const user = req.session.user;
    const rid  = req.query.restaurant_id || user.restaurant_id;
    if (user.role !== 'admin' && String(rid) !== String(user.restaurant_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const kegs = await db.all(`
      SELECT k.*,
        COALESCE((SELECT SUM(pe.liters) FROM pour_events pe 
                  WHERE pe.keg_id=k.id AND DATE(pe.recorded_at)=CURDATE()),0) as poured_today,
        COALESCE((SELECT SUM(pe.liters) FROM pour_events pe WHERE pe.keg_id=k.id),0) as poured_total
      FROM kegs k WHERE k.restaurant_id=? AND k.active=1 ORDER BY k.tap_number
    `, [rid]);
    res.json(kegs);
  } catch (err) {
    console.error('Get kegs error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Reports ─────────────────────────────────
router.get('/reports', async (req, res) => {
  try {
    const user   = req.session.user;
    const rid    = req.query.restaurant_id || user.restaurant_id;
    const from   = req.query.from || new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
    const to     = req.query.to   || new Date().toISOString().slice(0,10);
    const keg_id = req.query.keg_id;

    if (user.role !== 'admin' && String(rid) !== String(user.restaurant_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    let pourFilter = "WHERE pe.restaurant_id=? AND DATE(pe.recorded_at) BETWEEN ? AND ?";
    let params     = [rid, from, to];
    if (keg_id) { pourFilter += ' AND pe.keg_id=?'; params.push(keg_id); }

    const total_poured_row = await db.get(`SELECT COALESCE(SUM(liters),0) as t FROM pour_events pe ${pourFilter}`, params);
    const total_poured = total_poured_row.t;

    const daily = await db.all(`
      SELECT DATE(recorded_at) as day, COALESCE(SUM(liters),0) as liters
      FROM pour_events pe ${pourFilter} GROUP BY day ORDER BY day
    `, params);

    const by_beer = await db.all(`
      SELECT k.beer_name, COALESCE(SUM(pe.liters),0) as liters
      FROM pour_events pe JOIN kegs k ON pe.keg_id=k.id
      ${pourFilter} GROUP BY k.beer_name ORDER BY liters DESC
    `, params);

    const keg_changes = await db.all(`
      SELECT ks.*, k.beer_name, k.tap_number
      FROM keg_sessions ks JOIN kegs k ON ks.keg_id=k.id
      WHERE ks.restaurant_id=? AND DATE(ks.started_at) BETWEEN ? AND ?
      ORDER BY ks.started_at DESC
    `, [rid, from, to]);

    const keg_changes_count = keg_changes.length;
    const daily_avg = daily.length ? (total_poured / daily.length).toFixed(1) : 0;
    const best_day  = daily.length ? Math.max(...daily.map(d => Number(d.liters))).toFixed(1) : 0;

    res.json({ total_poured: total_poured.toFixed(1), daily, by_beer, keg_changes, keg_changes_count, daily_avg, best_day });
  } catch (err) {
    console.error('Reports error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Alerts ──────────────────────────────────
router.get('/alerts', async (req, res) => {
  try {
    const user = req.session.user;
    const rid  = user.role === 'admin' ? req.query.restaurant_id : user.restaurant_id;
    let alerts;
    if (rid) {
      alerts = await db.all("SELECT a.*, k.beer_name, k.tap_number FROM alerts a LEFT JOIN kegs k ON a.keg_id=k.id WHERE a.restaurant_id=? ORDER BY a.created_at DESC LIMIT 50", [rid]);
    } else {
      alerts = await db.all("SELECT a.*, k.beer_name, k.tap_number, r.name as restaurant_name FROM alerts a LEFT JOIN kegs k ON a.keg_id=k.id LEFT JOIN restaurants r ON a.restaurant_id=r.id ORDER BY a.created_at DESC LIMIT 100");
    }
    res.json(alerts);
  } catch (err) {
    console.error('Get alerts error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/alerts/:id/resolve', async (req, res) => {
  try {
    await db.run("UPDATE alerts SET resolved=1 WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Resolve alert error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── User settings / recipients ───────────────
router.get('/settings/recipients', async (req, res) => {
  try {
    const rid = req.session.user.restaurant_id;
    if (!rid) return res.json({ email: [], telegram: [] });
    const rows = await db.all("SELECT type, value FROM alert_recipients WHERE restaurant_id=?", [rid]);
    res.json({
      email:    rows.filter(r => r.type==='email').map(r => r.value),
      telegram: rows.filter(r => r.type==='telegram').map(r => r.value),
    });
  } catch (err) {
    console.error('Get recipients error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/settings/recipients', async (req, res) => {
  try {
    const rid = req.session.user.restaurant_id;
    if (!rid) return res.status(400).json({ error: 'No restaurant' });
    const { email, telegram } = req.body;
    
    // Using a simple sequence for clarity, or can use transactions
    await db.run("DELETE FROM alert_recipients WHERE restaurant_id=?", [rid]);
    
    // MySQL bulk insert would be better, but keeping loop for similarity
    for (const v of (email || []).slice(0,5)) {
      await db.run("INSERT INTO alert_recipients (restaurant_id, type, value) VALUES (?,?,?)", [rid, 'email', v]);
    }
    for (const v of (telegram || []).slice(0,5)) {
      await db.run("INSERT INTO alert_recipients (restaurant_id, type, value) VALUES (?,?,?)", [rid, 'telegram', v]);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Update recipients error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/settings/schedule', async (req, res) => {
  try {
    const rid = req.session.user.restaurant_id;
    if (!rid) return res.json([]);
    res.json(await db.all("SELECT * FROM schedules WHERE restaurant_id=? ORDER BY day_of_week", [rid]));
  } catch (err) {
    console.error('Get schedule error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/settings/schedule', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const rid   = req.session.user.restaurant_id;
    const days  = req.body.days || [];
    
    await conn.beginTransaction();
    await conn.execute("DELETE FROM schedules WHERE restaurant_id=?", [rid]);
    for (const d of days) {
      await conn.execute("INSERT INTO schedules (restaurant_id,day_of_week,open_time,close_time,enabled) VALUES (?,?,?,?,?)", [rid, d.day, d.open, d.close, d.enabled ? 1 : 0]);
    }
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('Update schedule error:', err);
    res.status(500).json({ error: 'server_error' });
  } finally {
    conn.release();
  }
});

// ── MQTT simulator endpoint (for testing without real ESP32) ──
router.post('/simulate/pour', async (req, res) => {
  try {
    const { keg_id, liters } = req.body;
    const keg = await db.get("SELECT * FROM kegs WHERE id=?", [keg_id]);
    if (!keg) return res.status(404).json({ error: 'Keg not found' });
    const newRem = Math.max(0, (keg.remaining_liters || keg.keg_size_liters) - liters);
    await db.run("UPDATE kegs SET remaining_liters=?, current_flow=? WHERE id=?", [newRem, liters, keg_id]);
    await db.run("INSERT INTO pour_events (keg_id, restaurant_id, liters, temp, co2) VALUES (?,?,?,?,?)", [keg_id, keg.restaurant_id, liters, keg.current_temp, keg.current_co2]);
    res.json({ success: true, remaining: newRem });
  } catch (err) {
    console.error('Simulate pour error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
