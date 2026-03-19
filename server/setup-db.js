// server/setup-db.js  — run once to create & seed the database
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const fs       = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'beercontrol.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ──────────────────────────────────────────
//  SCHEMA
// ──────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS restaurants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  city        TEXT,
  country     TEXT,
  timezone    TEXT DEFAULT 'Europe/Berlin',
  language    TEXT DEFAULT 'en',
  plan        TEXT DEFAULT 'starter',
  active      INTEGER DEFAULT 1,
  renewal_date TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT DEFAULT 'user',
  language      TEXT DEFAULT 'en',
  active        INTEGER DEFAULT 1,
  last_login    TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kegs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id   INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  tap_number      INTEGER NOT NULL,
  beer_name       TEXT NOT NULL,
  logo_path       TEXT,
  keg_size_liters REAL NOT NULL DEFAULT 50,
  remaining_liters REAL,
  esp32_sensor_id  TEXT,
  esp32_display_id TEXT,
  co2_min_bar      REAL DEFAULT 1.5,
  temp_max_c       REAL DEFAULT 6.0,
  alert_low_pct    INTEGER DEFAULT 20,
  alert_critical_pct INTEGER DEFAULT 10,
  fob_active       INTEGER DEFAULT 0,
  online           INTEGER DEFAULT 0,
  current_temp     REAL,
  current_co2      REAL,
  current_flow     REAL DEFAULT 0,
  active           INTEGER DEFAULT 1,
  created_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS keg_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  keg_id        INTEGER NOT NULL REFERENCES kegs(id),
  restaurant_id INTEGER NOT NULL,
  started_at    TEXT DEFAULT (datetime('now')),
  ended_at      TEXT,
  total_poured  REAL DEFAULT 0,
  keg_size      REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS pour_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  keg_id        INTEGER NOT NULL REFERENCES kegs(id),
  restaurant_id INTEGER NOT NULL,
  session_id    INTEGER REFERENCES keg_sessions(id),
  liters        REAL NOT NULL,
  flow_rate     REAL,
  temp          REAL,
  co2           REAL,
  recorded_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER REFERENCES restaurants(id),
  keg_id        INTEGER REFERENCES kegs(id),
  type          TEXT NOT NULL,
  message       TEXT NOT NULL,
  sent_email    INTEGER DEFAULT 0,
  sent_telegram INTEGER DEFAULT 0,
  resolved      INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alert_recipients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  value         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  day_of_week   INTEGER NOT NULL,
  open_time     TEXT,
  close_time    TEXT,
  enabled       INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`);

// ──────────────────────────────────────────
//  SEED DATA
// ──────────────────────────────────────────
const adminHash = bcrypt.hashSync('admin', 10);

// Insert admin user
const existingAdmin = db.prepare("SELECT id FROM users WHERE email = 'admin@beercontrol.io'").get();
if (!existingAdmin) {
  db.prepare(`
    INSERT INTO users (name, email, password_hash, role, language, restaurant_id)
    VALUES ('Super Admin', 'admin@beercontrol.io', ?, 'admin', 'en', NULL)
  `).run(adminHash);
  console.log('✓ Admin user created: admin@beercontrol.io / admin');
} else {
  // update password in case re-running
  db.prepare("UPDATE users SET password_hash = ? WHERE email = 'admin@beercontrol.io'").run(adminHash);
  console.log('✓ Admin user already exists, password reset to: admin');
}

// Demo restaurant
let rest = db.prepare("SELECT id FROM restaurants WHERE name = 'La Cervecería'").get();
if (!rest) {
  const r = db.prepare(`
    INSERT INTO restaurants (name, city, country, timezone, language, plan, renewal_date)
    VALUES ('La Cervecería', 'Barcelona', 'Spain', 'Europe/Madrid', 'es', 'pro', '2026-12-01')
  `).run();
  rest = { id: r.lastInsertRowid };

  // Demo restaurant user
  const userHash = bcrypt.hashSync('demo123', 10);
  db.prepare(`
    INSERT INTO users (name, email, password_hash, role, language, restaurant_id)
    VALUES ('Carlos Martínez', 'carlos@cerveceria.es', ?, 'user', 'es', ?)
  `).run(userHash, rest.id);
  console.log('✓ Demo restaurant user: carlos@cerveceria.es / demo123');

  // Demo kegs
  const kegs = [
    { tap: 1, beer: 'Moritz',       size: 30,  remaining: 22.4, logo: '🌊', sensor: 'esp_cerv_tap1_s', display: 'esp_cerv_tap1_d' },
    { tap: 2, beer: 'Estrella Damm',size: 30,  remaining: 18.9, logo: '⭐', sensor: 'esp_cerv_tap2_s', display: 'esp_cerv_tap2_d' },
    { tap: 3, beer: 'Heineken',     size: 50,  remaining: 4.2,  logo: '🍺', sensor: 'esp_cerv_tap3_s', display: 'esp_cerv_tap3_d' },
    { tap: 4, beer: 'Voll-Damm',    size: 50,  remaining: 38.2, logo: '🔶', sensor: 'esp_cerv_tap4_s', display: 'esp_cerv_tap4_d' },
  ];
  for (const k of kegs) {
    db.prepare(`
      INSERT INTO kegs (restaurant_id, tap_number, beer_name, keg_size_liters, remaining_liters,
                        esp32_sensor_id, esp32_display_id, online, current_temp, current_co2)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 2.3)
    `).run(rest.id, k.tap, k.beer, k.size, k.remaining, k.sensor, k.display, (3.8 + Math.random()).toFixed(1));
  }

  // Demo alert recipients
  db.prepare("INSERT INTO alert_recipients (restaurant_id, type, value) VALUES (?, 'email', ?)").run(rest.id, 'carlos@cerveceria.es');
  db.prepare("INSERT INTO alert_recipients (restaurant_id, type, value) VALUES (?, 'telegram', ?)").run(rest.id, '-100987654321');

  // Demo schedule (Mon-Sat open)
  const days = [
    [1,'12:00','23:30',1],[2,'12:00','23:30',1],[3,'12:00','23:30',1],
    [4,'12:00','00:30',1],[5,'12:00','01:30',1],[6,'13:00','02:00',1],
    [0,'14:00','22:00',0]
  ];
  for (const [d,o,c,en] of days) {
    db.prepare("INSERT INTO schedules (restaurant_id, day_of_week, open_time, close_time, enabled) VALUES (?,?,?,?,?)").run(rest.id,d,o,c,en);
  }

  // Demo pour history (last 7 days)
  const kegRows = db.prepare("SELECT id FROM kegs WHERE restaurant_id = ?").all(rest.id);
  const now = Date.now();
  for (let day = 6; day >= 0; day--) {
    for (const keg of kegRows) {
      const liters = (Math.random() * 15 + 5).toFixed(2);
      const ts = new Date(now - day * 86400000).toISOString();
      db.prepare("INSERT INTO pour_events (keg_id, restaurant_id, liters, temp, co2, recorded_at) VALUES (?,?,?,?,?,?)")
        .run(keg.id, rest.id, liters, (3.8 + Math.random()).toFixed(1), (2.1 + Math.random() * 0.5).toFixed(2), ts);
    }
  }
  console.log('✓ Demo restaurant, kegs, users, schedule and pour history created');
}

// Default settings
const defaults = [
  ['smtp_host','smtp.sendgrid.net'],['smtp_port','587'],['smtp_from','alerts@beercontrol.io'],
  ['telegram_token',''],['alert_low_pct','20'],['alert_critical_pct','10'],
  ['temp_max','6'],['co2_min','1.5'],['cleaning_days','14'],['app_name','BeerControl'],
];
for (const [k,v] of defaults) {
  db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").run(k,v);
}

db.close();
console.log('\n✅ Database ready at data/beercontrol.db');
console.log('   Run:  npm start   to launch the server');
