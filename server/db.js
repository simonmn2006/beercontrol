// server/db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'beercontrol',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helper for easier query execution (mimicking better-sqlite3 slightly but async)
const db = {
  execute: async (sql, params = []) => {
    const [result] = await pool.execute(sql, params);
    return result;
  },
  query: async (sql, params = []) => {
    const [rows] = await pool.query(sql, params);
    return rows;
  },
  // Compatibility helpers
  all: async (sql, params = []) => {
    const [rows] = await pool.query(sql, params);
    return rows;
  },
  get: async (sql, params = []) => {
    const [rows] = await pool.query(sql, params);
    return rows[0];
  },
  run: async (sql, params = []) => {
    const [result] = await pool.execute(sql, params);
    return { lastInsertRowid: result.insertId, changes: result.affectedRows };
  }
};

async function runMigrations() {
  try {
    // ── Core Tables ─────────────────────────
    console.log('◈ Checking core tables...');
    await pool.query(`CREATE TABLE IF NOT EXISTS restaurants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      city VARCHAR(255),
      country VARCHAR(255),
      language VARCHAR(10) DEFAULT 'en',
      plan VARCHAR(50) DEFAULT 'starter',
      active TINYINT DEFAULT 1,
      renewal_date DATE,
      phone VARCHAR(50),
      address VARCHAR(255),
      postal_code VARCHAR(50),
      timezone VARCHAR(50) DEFAULT 'Europe/Madrid',
      opening_hours TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      restaurant_id INT,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      language VARCHAR(10) DEFAULT 'en',
      phone VARCHAR(50),
      active TINYINT DEFAULT 1,
      last_login DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE SET NULL
    )`);

    // ── Expansion Migrations ────────────────
    console.log('◈ Checking expansion columns...');
    const [restCols] = await pool.query('SHOW COLUMNS FROM restaurants');
    const restColNames = restCols.map(c => c.Field);
    if (!restColNames.includes('phone')) await pool.query('ALTER TABLE restaurants ADD COLUMN phone VARCHAR(50)');
    if (!restColNames.includes('address')) await pool.query('ALTER TABLE restaurants ADD COLUMN address VARCHAR(255)');
    if (!restColNames.includes('postal_code')) await pool.query('ALTER TABLE restaurants ADD COLUMN postal_code VARCHAR(50)');
    if (!restColNames.includes('timezone')) await pool.query("ALTER TABLE restaurants ADD COLUMN timezone VARCHAR(50) DEFAULT 'Europe/Madrid'");
    if (!restColNames.includes('opening_hours')) await pool.query('ALTER TABLE restaurants ADD COLUMN opening_hours TEXT');
    if (!restColNames.includes('wifi')) await pool.query('ALTER TABLE restaurants ADD COLUMN wifi TEXT');
    if (!restColNames.includes('financial_settings')) await pool.query('ALTER TABLE restaurants ADD COLUMN financial_settings TEXT');
    
    const [userCols] = await pool.query('SHOW COLUMNS FROM users');
    const userColNames = userCols.map(c => c.Field);
    if (!userColNames.includes('phone')) await pool.query('ALTER TABLE users ADD COLUMN phone VARCHAR(50)');
    if (!userColNames.includes('alert_settings')) await pool.query('ALTER TABLE users ADD COLUMN alert_settings LONGTEXT');

    // Beer Styles
    await pool.query(`CREATE TABLE IF NOT EXISTS beer_styles (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE, description TEXT,
      abv_min DOUBLE DEFAULT 0, abv_max DOUBLE DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    const [styleCount] = await pool.query('SELECT COUNT(*) as c FROM beer_styles');
    if (styleCount[0].c === 0) {
      const styles = [
        ['Lager','Clean, crisp, bottom-fermented',4.0,5.5],['Pilsner','Light, hoppy Lager variant',4.0,5.5],
        ['Ale','Top-fermented, broad category',4.5,7.0],['Stout','Dark, roasted malt flavour',4.0,8.0],
        ['Porter','Dark ale, slightly lighter than stout',4.0,7.0],['Wheat','Brewed with wheat, hazy and smooth',4.0,5.5],
        ['IPA','India Pale Ale, heavily hopped',5.5,8.0],['Pale Ale','Balanced, hoppy and easy-drinking',4.5,6.0],
        ['Sour Ale','Tart, acidic fermentation character',3.5,7.0]
      ];
      for (const s of styles) await pool.query('INSERT IGNORE INTO beer_styles (name, description, abv_min, abv_max) VALUES (?,?,?,?)', s);
    }

    // Beer Library
    await pool.query(`CREATE TABLE IF NOT EXISTS beer_library (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, style VARCHAR(100), abv DOUBLE DEFAULT 0,
      brand VARCHAR(255), origin VARCHAR(255), logo_data LONGTEXT, emoji VARCHAR(50) DEFAULT '🍺',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    const [beerCount] = await pool.query('SELECT COUNT(*) as c FROM beer_library');
    if (beerCount[0].c === 0) {
      const beers = [
        ['Heineken','Lager',5.0,'Heineken','Netherlands','🍺'],
        ['Guinness','Stout',4.2,'Diageo','Ireland','🍺'],
        ['Corona','Lager',4.5,'AB InBev','Mexico','🍺']
      ];
      for (const b of beers) await pool.query('INSERT IGNORE INTO beer_library (name, style, abv, brand, origin, emoji) VALUES (?,?,?,?,?,?)', b);
    }

    // Plans
    await pool.query(`CREATE TABLE IF NOT EXISTS plans (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE, price DOUBLE DEFAULT 0,
      max_taps INT DEFAULT 0, description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    const [planCount] = await pool.query('SELECT COUNT(*) as c FROM plans');
    if (planCount[0].c === 0) {
      const plans = [['Starter',89,4,'Up to 4 taps'],['Pro',189,12,'Up to 12 taps'],['Enterprise',390,0,'Unlimited taps']];
      for (const p of plans) await pool.query('INSERT IGNORE INTO plans (name, price, max_taps, description) VALUES (?,?,?,?)', p);
    }

    // Locations
    await pool.query(`CREATE TABLE IF NOT EXISTS display_locations (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    const [locCount] = await pool.query('SELECT COUNT(*) as c FROM display_locations');
    if (locCount[0].c === 0) {
      for (const n of ['Bar — main counter','Bar — secondary counter','Cellar','Manager office','Terrace']) {
        await pool.query('INSERT IGNORE INTO display_locations (name) VALUES (?)', [n]);
      }
    }

    // Roles
    await pool.query(`CREATE TABLE IF NOT EXISTS user_roles (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE, description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    const [roleCount] = await pool.query('SELECT COUNT(*) as c FROM user_roles');
    if (roleCount[0].c === 0) {
      const roles = [['Owner','Full access'],['Manager','Manage kegs'],['Staff','Staff']];
      for (const r of roles) await pool.query('INSERT IGNORE INTO user_roles (name, description) VALUES (?,?)', r);
    }

    // ── Keg Management Tables ───────────────
    console.log('◈ Checking keg management tables...');
    await pool.query(`CREATE TABLE IF NOT EXISTS kegs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      restaurant_id INT NOT NULL,
      tap_number INT NOT NULL,
      beer_name VARCHAR(255) NOT NULL,
      logo_path LONGTEXT,
      keg_size_liters DOUBLE NOT NULL DEFAULT 50,
      remaining_liters DOUBLE,
      esp32_sensor_id VARCHAR(255),
      esp32_display_id VARCHAR(255),
      co2_min_bar DOUBLE DEFAULT 1.5,
      temp_max_c DOUBLE DEFAULT 6.0,
      alert_low_pct INT DEFAULT 20,
      alert_critical_pct INT DEFAULT 10,
      fob_active TINYINT DEFAULT 0,
      online TINYINT DEFAULT 0,
      current_temp DOUBLE,
      current_co2 DOUBLE,
      current_flow DOUBLE DEFAULT 0,
      active TINYINT DEFAULT 1,
      cost_price DOUBLE DEFAULT 0,
      sale_price DOUBLE DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    )`);

    // Ensure logo_path exists and is long enough
    const [kegCols] = await pool.query('SHOW COLUMNS FROM kegs');
    const kegColNames = kegCols.map(c => c.Field);
    if (!kegColNames.includes('logo_path')) {
      await pool.query('ALTER TABLE kegs ADD COLUMN logo_path LONGTEXT');
      console.log('  + Added column: kegs.logo_path (LONGTEXT)');
    } else {
      // Check if it's varchar and upgrade it
      const logoCol = kegCols.find(c => c.Field === 'logo_path');
      if (logoCol.Type.toLowerCase().includes('varchar')) {
        await pool.query('ALTER TABLE kegs MODIFY COLUMN logo_path LONGTEXT');
        console.log('  + Upgraded column: kegs.logo_path to LONGTEXT');
      }
    }

    if (!kegColNames.includes('cost_price')) await pool.query('ALTER TABLE kegs ADD COLUMN cost_price DOUBLE DEFAULT 0');
    if (!kegColNames.includes('sale_price')) await pool.query('ALTER TABLE kegs ADD COLUMN sale_price DOUBLE DEFAULT 0');

    await pool.query(`CREATE TABLE IF NOT EXISTS keg_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      keg_id INT NOT NULL,
      restaurant_id INT NOT NULL,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      total_poured DOUBLE DEFAULT 0,
      keg_size DOUBLE NOT NULL,
      FOREIGN KEY (keg_id) REFERENCES kegs(id)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS pour_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      keg_id INT NOT NULL,
      restaurant_id INT NOT NULL,
      session_id INT,
      liters DOUBLE NOT NULL,
      flow_rate DOUBLE,
      temp DOUBLE,
      co2 DOUBLE,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (keg_id) REFERENCES kegs(id),
      FOREIGN KEY (session_id) REFERENCES keg_sessions(id)
    )`);

    // ── Facility Monitoring ─────────────────
    console.log('◈ Checking facility monitoring tables...');
    await pool.query(`CREATE TABLE IF NOT EXISTS refrigerator_types (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      min_temp DOUBLE NOT NULL,
      max_temp DOUBLE NOT NULL,
      icon VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    const [typeCount] = await pool.query('SELECT COUNT(*) as c FROM refrigerator_types');
    if (typeCount[0].c === 0) {
      const types = [
        ['Meat Fridge', 1.0, 4.0, '🥩'],
        ['Wine Fridge', 10.0, 14.0, '🍷'],
        ['Vegetable Fridge', 4.0, 7.0, '🥬'],
        ['Beer Fridge', 2.0, 5.0, '🍺'],
        ['Dessert Display', 3.0, 6.0, '🍨'],
        ['Generic Storage', 1.0, 8.0, '❄️']
      ];
      for (const t of types) await pool.query('INSERT INTO refrigerator_types (name, min_temp, max_temp, icon) VALUES (?,?,?,?)', t);
    }

    await pool.query(`CREATE TABLE IF NOT EXISTS facility_sensors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      restaurant_id INT NOT NULL,
      sensor_id VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) DEFAULT 'temperature',
      type_id INT,
      current_value DOUBLE,
      min_threshold DOUBLE DEFAULT 1.0,
      max_threshold DOUBLE DEFAULT 8.0,
      online TINYINT DEFAULT 0,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
      FOREIGN KEY (type_id) REFERENCES refrigerator_types(id) ON DELETE SET NULL
    )`);

    const [facCols] = await pool.query('SHOW COLUMNS FROM facility_sensors');
    const facColNames = facCols.map(c => c.Field);
    if (!facColNames.includes('type_id')) {
      await pool.query('ALTER TABLE facility_sensors ADD COLUMN type_id INT, ADD FOREIGN KEY (type_id) REFERENCES refrigerator_types(id) ON DELETE SET NULL');
    }

    await pool.query(`CREATE TABLE IF NOT EXISTS sensor_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      sensor_id VARCHAR(255) NOT NULL,
      value DOUBLE NOT NULL,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sensor_time (sensor_id, recorded_at)
    )`);

    // Create payments table (Original logic)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        restaurant_id INT NOT NULL,
        stripe_invoice_id VARCHAR(255),
        amount DOUBLE NOT NULL,
        currency VARCHAR(10) DEFAULT 'EUR',
        status VARCHAR(50),
        receipt_url VARCHAR(2048),
        hosted_invoice_url VARCHAR(2048),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
      )
    `);
    console.log('✅ All migrations complete.');
  } catch (e) {
    console.error("Migration error:", e.message);
  }
}

module.exports = { pool, db, runMigrations };

