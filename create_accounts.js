const { db } = require('./server/db');
const bcrypt = require('bcryptjs');

const users = [
  { name: 'Owner User', email: 'owner@cerveceria.es', pass: 'owner123', role: 'user', rest_id: 1 },
  { name: 'Manager User', email: 'manager@cerveceria.es', pass: 'manager123', role: 'user', rest_id: 1 }
];

async function createUsers() {
  for (const u of users) {
    const hash = bcrypt.hashSync(u.pass, 10);
    try {
      db.prepare(`
        INSERT INTO users (name, email, password_hash, role, restaurant_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(u.name, u.email, hash, u.role, u.rest_id);
      console.log(`✓ Created ${u.name}: ${u.email} / ${u.pass}`);
    } catch (e) {
      if (e.message.includes('UNIQUE constraint failed')) {
        db.prepare(`UPDATE users SET password_hash = ? WHERE email = ?`).run(hash, u.email);
        console.log(`✓ Updated ${u.name}: ${u.email} / ${u.pass}`);
      } else {
        console.error(`✗ Error creating ${u.name}:`, e.message);
      }
    }
  }
}

createUsers().then(() => process.exit(0));
