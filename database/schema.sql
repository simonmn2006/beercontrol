-- MariaDB / MySQL Schema for KegHero
-- Previous: BeerControl

CREATE DATABASE IF NOT EXISTS keghero CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE keghero;

-- ──────────────────────────────────────────
--  TABLES
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurants (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  city        VARCHAR(255),
  country     VARCHAR(255),
  language    VARCHAR(10) DEFAULT 'en',
  plan        VARCHAR(50) DEFAULT 'starter',
  active      TINYINT DEFAULT 1,
  renewal_date DATE,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  grace_period_days INT DEFAULT 7,
  admin_billing_alerts TINYINT DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(50) DEFAULT 'user',
  language      VARCHAR(10) DEFAULT 'en',
  phone         VARCHAR(50),
  active        TINYINT DEFAULT 1,
  last_login    DATETIME,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS kegs (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  restaurant_id   INT NOT NULL,
  tap_number      INT NOT NULL,
  beer_name       VARCHAR(255) NOT NULL,
  logo_path       VARCHAR(255),
  keg_size_liters DOUBLE NOT NULL DEFAULT 50,
  remaining_liters DOUBLE,
  esp32_sensor_id  VARCHAR(255),
  esp32_display_id VARCHAR(255),
  co2_min_bar      DOUBLE DEFAULT 1.5,
  temp_max_c       DOUBLE DEFAULT 6.0,
  alert_low_pct    INT DEFAULT 20,
  alert_critical_pct INT DEFAULT 10,
  fob_active       TINYINT DEFAULT 0,
  online           TINYINT DEFAULT 0,
  current_temp     DOUBLE,
  current_co2      DOUBLE,
  current_flow     DOUBLE DEFAULT 0,
  active           TINYINT DEFAULT 1,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS keg_sessions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  keg_id        INT NOT NULL,
  restaurant_id INT NOT NULL,
  started_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at      DATETIME,
  total_poured  DOUBLE DEFAULT 0,
  keg_size      DOUBLE NOT NULL,
  FOREIGN KEY (keg_id) REFERENCES kegs(id)
);

CREATE TABLE IF NOT EXISTS pour_events (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  keg_id        INT NOT NULL,
  restaurant_id INT NOT NULL,
  session_id    INT,
  liters        DOUBLE NOT NULL,
  flow_rate     DOUBLE,
  temp          DOUBLE,
  co2           DOUBLE,
  recorded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (keg_id) REFERENCES kegs(id),
  FOREIGN KEY (session_id) REFERENCES keg_sessions(id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT,
  keg_id        INT,
  type          VARCHAR(50) NOT NULL,
  message       TEXT NOT NULL,
  sent_email    TINYINT DEFAULT 0,
  sent_telegram TINYINT DEFAULT 0,
  resolved      TINYINT DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  FOREIGN KEY (keg_id) REFERENCES kegs(id)
);

CREATE TABLE IF NOT EXISTS alert_recipients (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT NOT NULL,
  type          VARCHAR(50) NOT NULL,
  value         VARCHAR(255) NOT NULL,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedules (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT NOT NULL,
  day_of_week   INT NOT NULL,
  open_time     VARCHAR(10),
  close_time    VARCHAR(10),
  enabled       TINYINT DEFAULT 1,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(255) PRIMARY KEY,
  `value` TEXT
);

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
);
