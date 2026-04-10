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

// ── Auto-Migrations ─────────────────────────
async function runMigrations() {
  try {
    // We check for columns in MariaDB using INFORMATION_SCHEMA or SHOW COLUMNS
    const [cols] = await pool.query('SHOW COLUMNS FROM restaurants');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('stripe_customer_id')) {
      await pool.query('ALTER TABLE restaurants ADD COLUMN stripe_customer_id VARCHAR(255)');
    }
    if (!colNames.includes('stripe_subscription_id')) {
      await pool.query('ALTER TABLE restaurants ADD COLUMN stripe_subscription_id VARCHAR(255)');
    }
    if (!colNames.includes('grace_period_days')) {
      await pool.query('ALTER TABLE restaurants ADD COLUMN grace_period_days INT DEFAULT 7');
    }
    if (!colNames.includes('admin_billing_alerts')) {
      await pool.query('ALTER TABLE restaurants ADD COLUMN admin_billing_alerts TINYINT DEFAULT 0');
    }

    // Create payments table
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
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      console.log("ℹ️ Restaurants table not yet created. Run 'npm run setup' first.");
    } else {
      console.error("Migration error:", e.message);
    }
  }
}

// Do not block initialization, but run migrations
runMigrations();

module.exports = { pool, db };
