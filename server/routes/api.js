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

    const financials_row = await db.get(`
      SELECT 
        SUM(pe.liters * COALESCE(ks.sale_price, k.sale_price)) as revenue,
        SUM(pe.liters * COALESCE(ks.cost_price, k.cost_price)) as cost
      FROM pour_events pe
      JOIN kegs k ON pe.keg_id = k.id
      LEFT JOIN keg_sessions ks ON pe.session_id = ks.id
      WHERE pe.restaurant_id=? AND DATE(pe.recorded_at) = CURDATE()
    `, [rid]);
    const revenue_today = financials_row.revenue || 0;
    const cost_today    = financials_row.cost || 0;

    res.json({ kegs, poured_today, keg_changes, alerts, activity, revenue_today, cost_today });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/me/restaurant', async (req, res) => {
  try {
    const user = req.session.user;
    if (!user.restaurant_id && user.role !== 'admin') {
      return res.status(400).json({ error: 'No restaurant assigned' });
    }
    const rid = user.restaurant_id;
    const restaurant = await db.get("SELECT * FROM restaurants WHERE id=?", [rid]);
    if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
    res.json(restaurant);
  } catch (err) {
    console.error('Me restaurant error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/me/users', async (req, res) => {
  try {
    const user = req.session.user;
    if (!user.restaurant_id && user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const rid = user.restaurant_id;
    const users = await db.all("SELECT id, name, email, role, active, last_login, restaurant_id FROM users WHERE restaurant_id=?", [rid]);
    res.json(users);
  } catch (err) {
    console.error('Me users error:', err);
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

router.get('/kegs/:id/price-history', async (req, res) => {
  try {
    const user = req.session.user;
    const { id } = req.params;
    const history = await db.all("SELECT * FROM keg_price_history WHERE keg_id=? ORDER BY created_at DESC", [id]);
    res.json(history);
  } catch (err) {
    console.error('Price history error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/reports/refrigerators', async (req, res) => {
  try {
    const user = req.session.user;
    const rid = user.restaurant_id;
    const from = req.query.from || new Date(Date.now() - 7*86400000).toISOString().slice(0,10);
    const to = req.query.to || new Date().toISOString().slice(0,10);
    
    // Join logs with sensors to get names/units
    const logs = await db.all(`
      SELECT sl.*, fs.name as sensor_name, fs.type as sensor_type
      FROM sensor_logs sl
      JOIN facility_sensors fs ON sl.sensor_id = fs.sensor_id
      WHERE fs.restaurant_id=? AND sl.recorded_at BETWEEN ? AND ?
      ORDER BY sl.recorded_at ASC
    `, [rid, from + ' 00:00:00', to + ' 23:59:59']);
    
    res.json(logs);
  } catch (err) {
    console.error('Refrig reports error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/refrigerators/status', async (req, res) => {
  try {
    const user = req.session.user;
    const rid = user.restaurant_id;
    const sensors = await db.all("SELECT * FROM facility_sensors WHERE restaurant_id=?", [rid]);
    res.json(sensors);
  } catch (err) {
    console.error('Refrig status error:', err);
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

// Update user alert settings
router.put('/me/alerts', async (req, res) => {
  try {
    const user = req.session.user;
    const settings = req.body;
    await db.run("UPDATE users SET alert_settings=? WHERE id=?", [JSON.stringify(settings), user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Save alerts error:', err);
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
 
router.post('/alerts/clear', async (req, res) => {
  try {
    const user = req.session.user;
    if (user.role === 'admin') {
      await db.run("UPDATE alerts SET resolved=1 WHERE resolved=0");
    } else {
      await db.run("UPDATE alerts SET resolved=1 WHERE resolved=0 AND restaurant_id=?", [user.restaurant_id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Clear alerts error:', err);
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

// ── Facility Sensors ─────────────────────────
router.get('/sensors', async (req, res) => {
  try {
    const user = req.session.user;
    const rid  = req.query.restaurant_id || user.restaurant_id;
    if (user.role !== 'admin' && String(rid) !== String(user.restaurant_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    let query = `
      SELECT s.*, s.type_id as refrig_type_id, t.name as type_name, t.icon as type_icon, r.name as restaurant_name
      FROM facility_sensors s
      LEFT JOIN refrigerator_types t ON s.type_id = t.id
      LEFT JOIN restaurants r ON s.restaurant_id = r.id
    `;
    let params = [];
    if (rid) {
      query += " WHERE s.restaurant_id=? ";
      params.push(rid);
    }
    query += " ORDER BY r.name, s.name";
    
    const sensors = await db.all(query, params);
    res.json(sensors);
  } catch (err) {
    console.error('Get sensors error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/sensors', async (req, res) => {
  try {
    const user = req.session.user;
    const { restaurant_id, sensor_id, name, type, type_id, refrig_type_id, min_threshold, max_threshold } = req.body;
    const rid = restaurant_id || user.restaurant_id;
    if (user.role !== 'admin' && String(rid) !== String(user.restaurant_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Map either refrig_type_id (frontend) or type_id (backend legacy)
    const tid = refrig_type_id || type_id || null;

    await db.run(
      "INSERT INTO facility_sensors (restaurant_id, sensor_id, name, type, type_id, min_threshold, max_threshold) VALUES (?,?,?,?,?,?,?)",
      [
        rid || null, 
        sensor_id || '', 
        name || 'Unnamed', 
        type || 'temperature', 
        tid, 
        min_threshold ?? 1.0, 
        max_threshold ?? 8.0
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Create sensor error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/sensors/:id', async (req, res) => {
  try {
    const user = req.session.user;
    const { id } = req.params;
    const { name, sensor_id, type, type_id, refrig_type_id, min_threshold, max_threshold } = req.body;
    
    const sensor = await db.get("SELECT restaurant_id FROM facility_sensors WHERE id=?", [id]);
    if (!sensor) return res.status(404).json({ error: 'Sensor not found' });
    if (user.role !== 'admin' && String(sensor.restaurant_id) !== String(user.restaurant_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Map either refrig_type_id (frontend) or type_id (backend legacy)
    const tid = refrig_type_id || type_id || null;

    await db.run(
      "UPDATE facility_sensors SET name=?, sensor_id=?, type=?, type_id=?, min_threshold=?, max_threshold=? WHERE id=?",
      [
        name || 'Unnamed', 
        sensor_id || '', 
        type || 'temperature', 
        tid, 
        min_threshold ?? 1.0, 
        max_threshold ?? 8.0, 
        id
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Update sensor error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.delete('/sensors/:id', async (req, res) => {
  try {
    const user = req.session.user;
    const { id } = req.params;
    const sensor = await db.get("SELECT restaurant_id FROM facility_sensors WHERE id=?", [id]);
    if (!sensor) return res.status(404).json({ error: 'Sensor not found' });
    if (user.role !== 'admin' && String(sensor.restaurant_id) !== String(user.restaurant_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await db.run("DELETE FROM facility_sensors WHERE id=?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete sensor error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/sensors/:sensorId/history', async (req, res) => {
  try {
    const user = req.session.user;
    const { sensorId } = req.params;
    const from = req.query.from || new Date(Date.now() - 24*3600000).toISOString();
    const to   = req.query.to   || new Date().toISOString();

    const sensor = await db.get("SELECT restaurant_id FROM facility_sensors WHERE sensor_id=?", [sensorId]);
    if (!sensor) return res.status(404).json({ error: 'Sensor not found' });
    if (user.role !== 'admin' && String(sensor.restaurant_id) !== String(user.restaurant_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Aggregation logic: if timeframe > 48h, average by hour
    const dateDiff = new Date(to) - new Date(from);
    let query = "";
    if (dateDiff > 48 *3600000) {
      query = `
        SELECT 
          DATE_FORMAT(recorded_at, '%Y-%m-%d %H:00:00') as time,
          AVG(value) as value
        FROM sensor_logs
        WHERE sensor_id=? AND recorded_at BETWEEN ? AND ?
        GROUP BY time
        ORDER BY time
      `;
    } else {
      query = `
        SELECT recorded_at as time, value 
        FROM sensor_logs 
        WHERE sensor_id=? AND recorded_at BETWEEN ? AND ?
        ORDER BY recorded_at
      `;
    }

    const logs = await db.all(query, [sensorId, from, to]);
    res.json(logs);
  } catch (err) {
    console.error('Get sensor history error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Refrigerator Types ───────────────────────
router.get('/refrig-types', async (req, res) => {
  try {
    const types = await db.all("SELECT * FROM refrigerator_types ORDER BY name");
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/refrig-types', async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { name, min_temp, max_temp, icon } = req.body;
    await db.run("INSERT INTO refrigerator_types (name, min_temp, max_temp, icon) VALUES (?,?,?,?)", [name, min_temp, max_temp, icon]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
});

router.put('/refrig-types/:id', async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    const { name, min_temp, max_temp, icon } = req.body;
    await db.run("UPDATE refrigerator_types SET name=?, min_temp=?, max_temp=?, icon=? WHERE id=?", [name, min_temp, max_temp, icon, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
});

router.delete('/refrig-types/:id', async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    await db.run("DELETE FROM refrigerator_types WHERE id=?", [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Real-time MQTT Stream (SSE) ──────────────────
router.get('/mqtt/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const mqttService = require('../mqtt');

  // Send current status immediately
  res.write(`data: ${JSON.stringify({ type: 'status', data: mqttService.getStatus() })}\n\n`);

  const onMessage = (msg) => {
    res.write(`data: ${JSON.stringify({ type: 'message', data: msg })}\n\n`);
  };

  const onStatus = (status) => {
    res.write(`data: ${JSON.stringify({ type: 'status', data: status })}\n\n`);
  };

  mqttService.on('message', onMessage);
  mqttService.on('status', onStatus);

  req.on('close', () => {
    mqttService.off('message', onMessage);
    mqttService.off('status', onStatus);
  });
});

// ── Alert Recipients ────────────────────────
router.get('/alert-recipients', async (req, res) => {
  try {
    const { restaurant_id } = req.query;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });
    
    // Check permission
    const user = req.session.user;
    if (user.role !== 'admin' && String(user.restaurant_id) !== String(restaurant_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const recs = await db.all("SELECT * FROM alert_recipients WHERE restaurant_id=?", [restaurant_id]);
    res.json(recs);
  } catch (err) {
    console.error('Get recipients error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/alert-recipients', async (req, res) => {
  try {
    const { restaurant_id, recipients } = req.body;
    if (!restaurant_id || !Array.isArray(recipients)) return res.status(400).json({ error: 'Invalid data' });

    // Check permission
    const user = req.session.user;
    if (user.role !== 'admin' && String(user.restaurant_id) !== String(restaurant_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Atomic update: Delete all and re-insert
    await db.run("DELETE FROM alert_recipients WHERE restaurant_id=?", [restaurant_id]);
    for (const r of recipients) {
      if (r.type && r.value) {
        await db.run("INSERT INTO alert_recipients (restaurant_id, type, value) VALUES (?,?,?)", [restaurant_id, r.type, r.value]);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Update recipients error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
