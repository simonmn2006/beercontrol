const { db } = require('./server/db');
console.log('--- RESTAURANTS ---');
console.log(db.prepare('SELECT id, name FROM restaurants').all());
console.log('--- USERS ---');
console.log(db.prepare('SELECT id, name, username, role, restaurant_id FROM users').all());
process.exit(0);
