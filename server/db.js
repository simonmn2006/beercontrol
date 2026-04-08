// server/db.js
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_PATH  = path.join(__dirname, '..', 'data', 'beercontrol.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Auto-Migrations ─────────────────────────
try {
  // Add columns if they don't exist
  // We use PRAGMA table_info to check for column existence safely
  const cols = db.prepare('PRAGMA table_info(restaurants)').all().map(c => c.name);
  if (!cols.includes('stripe_customer_id')) {
    db.prepare('ALTER TABLE restaurants ADD COLUMN stripe_customer_id TEXT').run();
  }
  if (!cols.includes('stripe_subscription_id')) {
    db.prepare('ALTER TABLE restaurants ADD COLUMN stripe_subscription_id TEXT').run();
  }
  if (!cols.includes('grace_period_days')) {
    db.prepare('ALTER TABLE restaurants ADD COLUMN grace_period_days INTEGER DEFAULT 7').run();
  }
  if (!cols.includes('admin_billing_alerts')) {
    db.prepare('ALTER TABLE restaurants ADD COLUMN admin_billing_alerts INTEGER DEFAULT 0').run();
  }

  // Create payments table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
      stripe_invoice_id TEXT,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'EUR',
      status TEXT,
      receipt_url TEXT,
      hosted_invoice_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
} catch (e) {
  console.error("Migration error:", e.message);
}

module.exports = { db };
