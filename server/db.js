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
    
    const [userCols] = await pool.query('SHOW COLUMNS FROM users');
    const userColNames = userCols.map(c => c.Field);
    if (!userColNames.includes('phone')) await pool.query('ALTER TABLE users ADD COLUMN phone VARCHAR(50)');

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

