const express = require('express');
const bcrypt  = require('bcryptjs');
const { db, pool }  = require('../db');
const { sendMail }  = require('../mail');
const router  = express.Router();

// ── Restaurants ─────────────────────────────
router.get('/restaurants', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT r.*,
        COUNT(DISTINCT u.id) as user_count,
        COUNT(DISTINCT k.id) as keg_count
      FROM restaurants r
      LEFT JOIN users u ON u.restaurant_id=r.id
      LEFT JOIN kegs  k ON k.restaurant_id=r.id AND k.active=1
      GROUP BY r.id ORDER BY r.name
    `);
    
    // Transform to match frontend expectations
    const transformed = rows.map(r => ({
      ...r,
      devices: [], // To be implemented when devices table exists
      kegs: new Array(r.keg_count || 0).fill({}),
      users: new Array(r.user_count || 0).fill({}),
      poured_today: 0,
      renewal: r.renewal_date || 'N/A',
      emoji: '🍺'
    }));
    
    res.json(transformed);
  } catch (err) {
    console.error('Get restaurants error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/restaurants/:id', async (req, res) => {
  try {
    const r = await db.get("SELECT * FROM restaurants WHERE id=?", [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Not found' });
    
    // We don't have a devices table yet? Let's check. 
    // Actually, looking at the schema in db.js, we have 'kegs' which have esp32_sensor_id and esp32_display_id.
    // In the mock, 'devices' was a separate list.
    // For now, let's just return an empty list or mock it until we add a devices table.
    // Wait, let's check if there's a devices table in db.js.
    
    const [users, kegs, alerts] = await Promise.all([
      db.all("SELECT id, name, email, phone, role, active, created_at FROM users WHERE restaurant_id=?", [r.id]),
      db.all("SELECT * FROM kegs WHERE restaurant_id=? AND active=1 ORDER BY tap_number", [r.id]),
      db.all("SELECT * FROM alerts WHERE restaurant_id=? ORDER BY created_at DESC LIMIT 20", [r.id])
    ]);
    
    res.json({ ...r, users, kegs, activity: alerts, devices: [] });
  } catch (err) {
    console.error('Get restaurant detail error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/restaurants', async (req, res) => {
  try {
    const { name, city, country, language, plan, renewal_date, owner_name, owner_email, owner_password, 
            phone, address, postal_code, timezone, opening_hours } = req.body;
    const r = await db.run(`
      INSERT INTO restaurants (name,city,country,language,plan,renewal_date,phone,address,postal_code,timezone,opening_hours)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `, [name, city||'', country||'', language||'en', plan||'starter', renewal_date||null, 
        phone||'', address||'', postal_code||'', timezone||'Europe/Madrid', opening_hours||'']);
    
    if (owner_email && owner_name) {
      const hash = bcrypt.hashSync(owner_password || 'changeme123', 10);
      await db.run("INSERT IGNORE INTO users (name,email,password_hash,role,language,restaurant_id) VALUES (?,?,?,'owner',?,?)",
        [owner_name, owner_email, hash, language||'en', r.lastInsertRowid]);
    }
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (err) {
    console.error('Create restaurant error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.put('/restaurants/:id', async (req, res) => {
  try {
    const { name, city, country, language, plan, renewal_date, active, 
            phone, address, postal_code, timezone, opening_hours, wifi } = req.body;
    await db.run(`
      UPDATE restaurants SET name=?,city=?,country=?,language=?,plan=?,renewal_date=?,active=?,
      phone=?,address=?,postal_code=?,timezone=?,opening_hours=?,wifi=? WHERE id=?
    `, [name||null, city||'', country||'', language||'en', plan||'starter', renewal_date||null, active?1:0, 
        phone||'', address||'', postal_code||'', timezone||'Europe/Madrid', opening_hours||'', wifi||null, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Update restaurant error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.delete('/restaurants/:id', async (req, res) => {
  try {
    // Check if restaurant exists
    const r = await db.get("SELECT name FROM restaurants WHERE id=?", [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Not found' });
    
    // Delete associated data (cascade-like behavior if not set in DB)
    // Most foreign keys are set to NULL or CASCADE, but let's be safe
    await db.run("DELETE FROM keg_sessions WHERE restaurant_id=?", [req.params.id]);
    await db.run("DELETE FROM kegs WHERE restaurant_id=?", [req.params.id]);
    await db.run("DELETE FROM users WHERE restaurant_id=?", [req.params.id]);
    await db.run("DELETE FROM alerts WHERE restaurant_id=?", [req.params.id]);
    await db.run("DELETE FROM payments WHERE restaurant_id=?", [req.params.id]);
    await db.run("DELETE FROM restaurants WHERE id=?", [req.params.id]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Delete restaurant error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/restaurants/:id/suspend', async (req, res) => {
  try {
    await db.run("UPDATE restaurants SET active=0 WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Suspend restaurant error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/restaurants/:id/activate', async (req, res) => {
  try {
    await db.run("UPDATE restaurants SET active=1 WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Activate restaurant error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Users ───────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT u.*, r.name as restaurant_name FROM users u
      LEFT JOIN restaurants r ON u.restaurant_id=r.id
      ORDER BY u.created_at DESC
    `);
    res.json(rows.map(u => ({ ...u, password_hash: undefined })));
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role, restaurant_id, language, phone } = req.body;
    const hash = bcrypt.hashSync(password || 'changeme123', 10);
    const r = await db.run("INSERT INTO users (name,email,password_hash,role,restaurant_id,language,phone) VALUES (?,?,?,?,?,?,?)",
      [name, email, hash, role||'user', restaurant_id||null, language||'en', phone||'']);
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      console.error('Create user error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { name, email, role, restaurant_id, language, active, phone, password } = req.body;
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      await db.run("UPDATE users SET name=?,email=?,role=?,restaurant_id=?,language=?,active=?,phone=?,password_hash=? WHERE id=?",
        [name, email, role, restaurant_id||null, language||'en', active?1:0, phone||'', hash, req.params.id]);
    } else {
      await db.run("UPDATE users SET name=?,email=?,role=?,restaurant_id=?,language=?,active=?,phone=? WHERE id=?",
        [name, email, role, restaurant_id||null, language||'en', active?1:0, phone||'', req.params.id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { password } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    await db.run("UPDATE users SET password_hash=? WHERE id=?", [hash, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/users/:id/send-credentials', async (req, res) => {
  try {
    const { password } = req.body;
    const user = await db.get("SELECT name, email FROM users WHERE id=?", [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const loginUrl = `${req.protocol}://${req.get('host')}/login`;
    
    await sendMail({
      to: user.email,
      subject: 'Your KegHero Access Details',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background: white; color: #333;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #f59e0b; margin: 0;">KegHero</h1>
            <p style="font-size: 14px; color: #666; margin-top: 5px;">Draft Beer Management Platform</p>
          </div>
          <p>Hello <strong>${user.name}</strong>,</p>
          <p>Your administrative account has been set up. You can log in using the following credentials:</p>
          <div style="background: #fdf2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fee2e2;">
            <p style="margin: 0 0 10px 0;"><strong>Login:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 4px;">${user.email}</code></p>
            <p style="margin: 0;"><strong>Password:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 4px;">${password}</code></p>
          </div>
          <p style="margin-bottom: 25px;">You can access the portal here:</p>
          <div style="text-align: center;">
            <a href="${loginUrl}" style="display: inline-block; padding: 14px 30px; background: #f59e0b; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Login to KegHero</a>
          </div>
          <p style="margin-top: 40px; font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 20px;">
            This is an automated message. If you didn't expect this email, please contact your manager.
          </p>
        </div>
      `
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Send credentials error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/users/:id/disable', async (req, res) => {
  try {
    await db.run("UPDATE users SET active=0 WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Disable user error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/users/:id/enable', async (req, res) => {
  try {
    await db.run("UPDATE users SET active=1 WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Enable user error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await db.run("DELETE FROM users WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Kegs (admin) ─────────────────────────────
router.get('/kegs', async (req, res) => {
  try {
    const rid = req.query.restaurant_id;
    let rows;
    if (rid) {
      rows = await db.all(`SELECT k.*, r.name as restaurant_name FROM kegs k JOIN restaurants r ON k.restaurant_id=r.id WHERE k.restaurant_id=? AND k.active=1 ORDER BY k.tap_number`, [rid]);
    } else {
      rows = await db.all(`SELECT k.*, r.name as restaurant_name FROM kegs k JOIN restaurants r ON k.restaurant_id=r.id WHERE k.active=1 ORDER BY r.name, k.tap_number`);
    }
    res.json(rows);
  } catch (err) {
    console.error('Get kegs error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/kegs', async (req, res) => {
  try {
    const { restaurant_id, tap_number, beer_name, keg_size_liters, esp32_sensor_id, esp32_display_id,
            co2_min_bar, temp_max_c, alert_low_pct, alert_critical_pct, logo_path } = req.body;

    // Check if tap number is already in use
    const existing = await db.get("SELECT id FROM kegs WHERE restaurant_id=? AND tap_number=? AND active=1", [restaurant_id, tap_number]);
    if (existing) {
      return res.status(400).json({ error: 'This tap number is already in use in this restaurant.' });
    }

    const r = await db.run(`
      INSERT INTO kegs (restaurant_id,tap_number,beer_name,keg_size_liters,remaining_liters,
        esp32_sensor_id,esp32_display_id,co2_min_bar,temp_max_c,alert_low_pct,alert_critical_pct,logo_path, active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)
    `, [restaurant_id, tap_number, beer_name, keg_size_liters, keg_size_liters,
           esp32_sensor_id||'', esp32_display_id||'', co2_min_bar||1.5, temp_max_c||6, alert_low_pct||20, alert_critical_pct||10, logo_path||null]);
    // Start a keg session
    await db.run("INSERT INTO keg_sessions (keg_id,restaurant_id,keg_size) VALUES (?,?,?)", [r.lastInsertRowid, restaurant_id, keg_size_liters]);
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (err) {
    console.error('Create keg error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.put('/kegs/:id', async (req, res) => {
  try {
    const { tap_number, beer_name, keg_size_liters, esp32_sensor_id, esp32_display_id,
            co2_min_bar, temp_max_c, alert_low_pct, alert_critical_pct, logo_path } = req.body;

    // We need restaurant_id to check uniqueness
    const keg = await db.get("SELECT restaurant_id FROM kegs WHERE id=?", [req.params.id]);
    if (!keg) return res.status(404).json({ error: 'Not found' });

    // Check if tap number is already in use by ANOTHER keg
    const existing = await db.get("SELECT id FROM kegs WHERE restaurant_id=? AND tap_number=? AND active=1 AND id != ?", 
      [keg.restaurant_id, tap_number, req.params.id]);
    if (existing) {
      return res.status(400).json({ error: 'This tap number is already in use in this restaurant.' });
    }

    await db.run(`UPDATE kegs SET tap_number=?,beer_name=?,keg_size_liters=?,esp32_sensor_id=?,esp32_display_id=?,
      co2_min_bar=?,temp_max_c=?,alert_low_pct=?,alert_critical_pct=?,logo_path=? WHERE id=?`,
      [tap_number, beer_name, keg_size_liters, esp32_sensor_id||'', esp32_display_id||'',
           co2_min_bar, temp_max_c, alert_low_pct, alert_critical_pct, logo_path||null, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Update keg error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.delete('/kegs/:id', async (req, res) => {
  try {
    // Soft delete by setting active=0
    await db.run("UPDATE kegs SET active=0 WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete keg error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/kegs/:id/new-keg', async (req, res) => {
  try {
    const keg = await db.get("SELECT * FROM kegs WHERE id=?", [req.params.id]);
    if (!keg) return res.status(404).json({ error: 'Not found' });
    // Close current session
    await db.run("UPDATE keg_sessions SET ended_at=NOW() WHERE keg_id=? AND ended_at IS NULL", [keg.id]);
    // Reset keg
    await db.run("UPDATE kegs SET remaining_liters=?, fob_active=0 WHERE id=?", [keg.keg_size_liters, keg.id]);
    // New session
    await db.run("INSERT INTO keg_sessions (keg_id,restaurant_id,keg_size) VALUES (?,?,?)", [keg.id, keg.restaurant_id, keg.keg_size_liters]);
    // Log alert
    await db.run("INSERT INTO alerts (restaurant_id,keg_id,type,message) VALUES (?,?,'info',?)", [keg.restaurant_id, keg.id, `Manual keg change — ${keg.beer_name} Tap #${keg.tap_number}`]);
    res.json({ success: true });
  } catch (err) {
    console.error('New keg error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Platform settings ───────────────────────
router.get('/settings', async (req, res) => {
  try {
    const rows = await db.all("SELECT `key`, `value` FROM settings");
    const obj  = {};
    rows.forEach(r => { obj[r.key] = r.value; });
    res.json(obj);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/settings', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const upsert = "INSERT INTO settings (`key`,`value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)";
    for (const [k, v] of Object.entries(req.body)) {
      await conn.execute(upsert, [k, v]);
    }
    await conn.commit();
    res.json({ success: true });

    // Restart MQTT if host changed
    if (Object.keys(req.body).some(k => k.startsWith('mqtt_'))) {
      require('../mqtt').init();
    }
  } catch (err) {
    await conn.rollback();
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'server_error' });
  } finally {
    conn.release();
  }
});

router.post('/mqtt/test', async (req, res) => {
  try {
    const result = await require('../mqtt').testConnection(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Billing ─────────────────────────────────
router.get('/payments', async (req, res) => {
  try {
    const rid = req.query.restaurant_id;
    let query = `
      SELECT p.*, r.name as restaurant_name 
      FROM payments p 
      JOIN restaurants r ON p.restaurant_id=r.id
    `;
    const params = [];
    if (rid) {
      query += ` WHERE p.restaurant_id = ?`;
      params.push(rid);
    }
    query += ` ORDER BY p.created_at DESC`;
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Get payments error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/payments/export', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT p.created_at, r.name as restaurant, p.amount, p.currency, p.status, p.stripe_invoice_id
      FROM payments p 
      JOIN restaurants r ON p.restaurant_id=r.id
      ORDER BY p.created_at DESC
    `);
    
    let csv = 'Date,Restaurant,Amount,Currency,Status,Stripe Invoice ID\n';
    rows.forEach(r => {
      csv += `"${r.created_at}","${r.restaurant}",${r.amount},"${r.currency}","${r.status}","${r.stripe_invoice_id}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=payments_export.csv');
    res.status(200).send(csv);
  } catch (err) {
    console.error('Export payments error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/payments/:id/send-email', async (req, res) => {
  try {
    const payment = await db.get(`
      SELECT p.*, r.name as restaurant_name, u.email as owner_email, u.name as owner_name
      FROM payments p
      JOIN restaurants r ON p.restaurant_id=r.id
      JOIN users u ON u.restaurant_id=r.id AND u.role='user' -- Assuming 'user' is the owner/manager
      WHERE p.id=?
    `, [req.params.id]);

    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (!payment.owner_email) return res.status(400).json({ error: 'Restaurant owner email not found' });

    const { sendMail } = require('../mail');
    await sendMail({
      to: payment.owner_email,
      subject: `Receipt for ${payment.restaurant_name} - ${payment.amount} ${payment.currency}`,
      html: `<h3>Hello ${payment.owner_name},</h3>
             <p>This is a payment receipt for your subscription at <b>KegHero</b>.</p>
             <p><b>Amount:</b> ${payment.amount} ${payment.currency}<br>
                <b>Date:</b> ${payment.created_at}<br>
                <b>Status:</b> ${payment.status.toUpperCase()}</p>
             ${payment.hosted_invoice_url ? `<p><a href="${payment.hosted_invoice_url}">View Full Invoice Details</a></p>` : ''}
             <p>Thank you for your business!</p>`
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send email: ' + err.message });
  }
});

router.put('/restaurants/:id/billing-settings', async (req, res) => {
  try {
    const { admin_billing_alerts, grace_period_days } = req.body;
    await db.run(`UPDATE restaurants SET admin_billing_alerts=?, grace_period_days=? WHERE id=?`,
      [admin_billing_alerts?1:0, grace_period_days||7, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Update billing settings error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Master Data ───────────────────────────
router.get('/library', async (req, res) => {
  try { res.json(await db.all("SELECT * FROM beer_library ORDER BY name")); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/library', async (req, res) => {
  try {
    const { name, style, abv, brand, origin, logo_data, emoji } = req.body;
    const r = await db.run("INSERT INTO beer_library (name, style, abv, brand, origin, logo_data, emoji) VALUES (?,?,?,?,?,?,?)",
      [name, style, abv, brand, origin, logo_data, emoji||'🍺']);
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/library/:id', async (req, res) => {
  try {
    const { name, style, abv, brand, origin, logo_data, emoji } = req.body;
    await db.run("UPDATE beer_library SET name=?, style=?, abv=?, brand=?, origin=?, logo_data=?, emoji=? WHERE id=?",
      [name, style, abv, brand, origin, logo_data, emoji||'🍺', req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/library/:id', async (req, res) => {
  try {
    await db.run("DELETE FROM beer_library WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/styles', async (req, res) => {
  try { res.json(await db.all("SELECT * FROM beer_styles ORDER BY name")); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/styles', async (req, res) => {
  try {
    const { name, description, abv_min, abv_max } = req.body;
    const r = await db.run("INSERT INTO beer_styles (name, description, abv_min, abv_max) VALUES (?,?,?,?)", [name, description, abv_min, abv_max]);
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (e) { 
    if(e.code === 'ER_DUP_ENTRY') res.status(400).json({ error: 'This style already exists' });
    else res.status(500).json({ error: e.message }); 
  }
});
router.delete('/styles/:id', async (req, res) => {
  try {
    await db.run("DELETE FROM beer_styles WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/plans', async (req, res) => {
  try { res.json(await db.all("SELECT * FROM plans ORDER BY price")); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/plans', async (req, res) => {
  try {
    const { name, price, max_taps, description } = req.body;
    const r = await db.run("INSERT INTO plans (name, price, max_taps, description) VALUES (?,?,?,?)", [name, price, max_taps, description]);
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (e) { 
    if(e.code === 'ER_DUP_ENTRY') res.status(400).json({ error: 'Plan name already exists' });
    else res.status(500).json({ error: e.message }); 
  }
});
router.delete('/plans/:id', async (req, res) => {
  try {
    await db.run("DELETE FROM plans WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/roles', async (req, res) => {
  try { res.json(await db.all("SELECT * FROM user_roles ORDER BY id")); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/roles', async (req, res) => {
  try {
    const { name, description } = req.body;
    const r = await db.run("INSERT INTO user_roles (name, description) VALUES (?,?)", [name, description]);
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (e) { 
    if(e.code === 'ER_DUP_ENTRY') res.status(400).json({ error: 'Role already exists' });
    else res.status(500).json({ error: e.message }); 
  }
});
router.delete('/roles/:id', async (req, res) => {
  try {
    await db.run("DELETE FROM user_roles WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/locations', async (req, res) => {
  try { res.json(await db.all("SELECT * FROM display_locations ORDER BY name")); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/locations', async (req, res) => {
  try {
    const { name } = req.body;
    const r = await db.run("INSERT INTO display_locations (name) VALUES (?)", [name]);
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (e) { 
    if(e.code === 'ER_DUP_ENTRY') res.status(400).json({ error: 'Location already exists' });
    else res.status(500).json({ error: e.message }); 
  }
});
router.delete('/locations/:id', async (req, res) => {
  try {
    await db.run("DELETE FROM display_locations WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── System stats ─────────────────────────────
router.get('/system', async (req, res) => {
  try {
    const uptime    = process.uptime();
    const mem       = process.memoryUsage();
    
    const total_events_row = await db.get("SELECT COUNT(*) as c FROM pour_events");
    const total_events = total_events_row.c;

    const total_liters_row = await db.get("SELECT COALESCE(SUM(liters),0) as t FROM pour_events");
    const total_liters = total_liters_row.t;

    res.json({ uptime, mem_mb: (mem.rss/1024/1024).toFixed(1), db_size_kb: 'N/A (MariaDB)', total_events, total_liters: Number(total_liters).toFixed(1) });
  } catch (err) {
    console.error('System stats error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
