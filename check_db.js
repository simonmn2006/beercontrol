// check_db.js
require('dotenv').config();
const { db } = require('./server/db');

async function check() {
  try {
    console.log('--- RESTAURANTS ---');
    console.log(await db.all('SELECT id, name FROM restaurants'));
    console.log('--- USERS ---');
    console.log(await db.all('SELECT id, name, email, role, restaurant_id FROM users'));
  } catch (err) {
    console.error('Error checking DB:', err.message);
  } finally {
    process.exit(0);
  }
}

check();
