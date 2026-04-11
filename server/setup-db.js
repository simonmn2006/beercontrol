// server/setup-db.js  — run once to create & seed the database
require('dotenv').config();
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs     = require('fs');
const path   = require('path');

async function setup() {
  console.log('🚀 Starting MariaDB setup...');

  const connection = await mysql.createConnection({
    host:     process.env.DB_HOST || 'localhost',
    port:     process.env.DB_PORT || 3306,
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  try {
    const dbName = process.env.DB_NAME || 'keghero';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await connection.query(`USE \`${dbName}\``);

    // Load schema
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // We strip the DATABASE creation parts because we handles it above to handle variables
    const cleanSchema = schema
      .replace(/CREATE DATABASE IF NOT EXISTS .*?;/, '')
      .replace(/USE .*?;/, '');

    console.log('◈ Creating tables...');
    await connection.query(cleanSchema);

    console.log('◈ Seeding data...');
    // Insert super admin users
    const adminHash = bcrypt.hashSync('super', 10);
    const adminUserHash = bcrypt.hashSync('admin', 10);

    // Existing "super" account
    const [existingSuper] = await connection.query("SELECT id FROM users WHERE email = 'super'");
    if (existingSuper.length === 0) {
      await connection.query(`
        INSERT INTO users (name, email, password_hash, role, language, restaurant_id)
        VALUES ('Super Admin', 'super', ?, 'admin', 'en', NULL)
      `, [adminHash]);
      console.log('✓ Admin user created: super / super');
    } else {
      await connection.query("UPDATE users SET password_hash = ? WHERE email = 'super'", [adminHash]);
      console.log('✓ Admin user "super" updated.');
    }

    // New "admin" account
    const [existingAdmin] = await connection.query("SELECT id FROM users WHERE email = 'admin'");
    if (existingAdmin.length === 0) {
      await connection.query(`
        INSERT INTO users (name, email, password_hash, role, language, restaurant_id)
        VALUES ('Admin', 'admin', ?, 'admin', 'en', NULL)
      `, [adminUserHash]);
      console.log('✓ Admin user created: admin / admin');
    } else {
      await connection.query("UPDATE users SET password_hash = ? WHERE email = 'admin'", [adminUserHash]);
      console.log('✓ Admin user "admin" updated.');
    }

    // Default settings
    const defaults = [
      ['smtp_host','smtp.sendgrid.net'],['smtp_port','587'],['smtp_from','alerts@beercontrol.io'],
      ['telegram_token',''],['alert_low_pct','20'],['alert_critical_pct','10'],
      ['temp_max','6'],['co2_min','1.5'],['cleaning_days','14'],['app_name','KegHero'],
    ];
    for (const [k,v] of defaults) {
      await connection.query("INSERT IGNORE INTO settings (`key`,`value`) VALUES (?,?)", [k,v]);
    }

    console.log('\n✅ MariaDB Database Ready');

  } catch (err) {
    console.error('✗ Error during setup:', err.message);
  } finally {
    await connection.end();
    process.exit(0);
  }
}

setup();
