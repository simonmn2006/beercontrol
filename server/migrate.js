// server/migrate.js
require('dotenv').config();
const { pool, db } = require('./db');

async function migrate() {
  console.log('🚀 Starting Database Migration...');

  try {
    // 1. Alter restaurants table
    console.log('◈ Updating restaurants table...');
    const [cols] = await pool.query('SHOW COLUMNS FROM restaurants');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('phone')) {
      await pool.query('ALTER TABLE restaurants ADD COLUMN phone VARCHAR(50)');
      console.log('  + Added column: phone');
    }
    if (!colNames.includes('address')) {
      await pool.query('ALTER TABLE restaurants ADD COLUMN address VARCHAR(255)');
      console.log('  + Added column: address');
    }
    if (!colNames.includes('postal_code')) {
      await pool.query('ALTER TABLE restaurants ADD COLUMN postal_code VARCHAR(50)');
      console.log('  + Added column: postal_code');
    }
    if (!colNames.includes('timezone')) {
      await pool.query('ALTER TABLE restaurants ADD COLUMN timezone VARCHAR(100) DEFAULT "Europe/Madrid"');
      console.log('  + Added column: timezone');
    }
    if (!colNames.includes('opening_hours')) {
      await pool.query('ALTER TABLE restaurants ADD COLUMN opening_hours TEXT');
      console.log('  + Added column: opening_hours');
    }
    if (!colNames.includes('wifi')) {
      await pool.query('ALTER TABLE restaurants ADD COLUMN wifi TEXT');
      console.log('  + Added column: wifi');
    }

    // 2. Create beer_styles table
    console.log('◈ Creating beer_styles table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS beer_styles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        abv_min DOUBLE DEFAULT 0,
        abv_max DOUBLE DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Create plans table
    console.log('◈ Creating plans table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        price DOUBLE DEFAULT 0,
        max_taps INT DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Create display_locations table
    console.log('◈ Creating display_locations table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS display_locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. Create user_roles table
    console.log('◈ Creating user_roles table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. Seed data
    console.log('◈ Seeding Master Data...');

    const styles = [
      ['Lager', 'Clean, crisp, bottom-fermented', 4.0, 5.5],
      ['Pilsner', 'Light, hoppy Lager variant', 4.0, 5.5],
      ['Ale', 'Top-fermented, broad category', 4.5, 7.0],
      ['Stout', 'Dark, roasted malt flavour', 4.0, 8.0],
      ['Porter', 'Dark ale, slightly lighter than stout', 4.0, 7.0],
      ['Wheat', 'Brewed with wheat, hazy and smooth', 4.0, 5.5],
      ['IPA', 'India Pale Ale, heavily hopped', 5.5, 8.0],
      ['Pale Ale', 'Balanced, hoppy and easy-drinking', 4.5, 6.0],
      ['Sour Ale', 'Tart, acidic fermentation character', 3.5, 7.0],
    ];
    for (const [n, d, min, max] of styles) {
      await pool.query('INSERT IGNORE INTO beer_styles (name, description, abv_min, abv_max) VALUES (?,?,?,?)', [n, d, min, max]);
    }

    const plans = [
      ['Starter', 89, 4, 'Up to 4 taps, email alerts'],
      ['Pro', 189, 12, 'Up to 12 taps, all alerts, reports'],
      ['Enterprise', 390, 0, 'Unlimited taps, priority support, SLA'],
    ];
    for (const [n, p, t, d] of plans) {
      await pool.query('INSERT IGNORE INTO plans (name, price, max_taps, description) VALUES (?,?,?,?)', [n, p, t, d]);
    }

    const roles = [
      ['Owner', 'Full access to all restaurant settings and data'],
      ['Manager', 'Manage kegs, users, alerts and reports'],
      ['Staff', 'View taps and log manual pours only'],
    ];
    for (const [n, d] of roles) {
      await pool.query('INSERT IGNORE INTO user_roles (name, description) VALUES (?,?)', [n, d]);
    }

    const locations = ['Bar — main counter', 'Bar — secondary counter', 'Cellar', 'Manager office', 'Terrace'];
    for (const n of locations) {
      await pool.query('INSERT IGNORE INTO display_locations (name) VALUES (?)', [n]);
    }

    console.log('\n✅ Migration Complete!');
    process.exit(0);

  } catch (err) {
    console.error('\n✗ Migration Failed:', err.message);
    process.exit(1);
  }
}

migrate();
