require('dotenv').config();
const mysql = require('mysql2/promise');
async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'keghero'
  });
  try {
    await connection.query('ALTER TABLE restaurants ADD COLUMN display_feature_temp TINYINT DEFAULT 1;');
    console.log("Added display_feature_temp");
  } catch (e) { console.log(e.message); }
  try {
    await connection.query('ALTER TABLE restaurants ADD COLUMN display_feature_co2 TINYINT DEFAULT 1;');
    console.log("Added display_feature_co2");
  } catch (e) { console.log(e.message); }
  await connection.end();
}
run();
