
const bcrypt = require('bcryptjs');
const { db } = require('./server/db');
require('dotenv').config();

async function testLogin() {
  const email = 'admin';
  const password = 'admin';

  try {
    const user = await db.get(`
      SELECT u.*, r.name as restaurant_name, r.language as rest_language, r.active as rest_active
      FROM users u
      LEFT JOIN restaurants r ON u.restaurant_id = r.id
      WHERE u.email = ?
    `, [email]);

    if (!user) {
      console.log('User not found');
      return;
    }

    console.log('User found:', user.email);
    const ok = bcrypt.compareSync(password, user.password_hash);
    console.log('Password match:', ok);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

testLogin();
