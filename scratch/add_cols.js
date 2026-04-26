require('dotenv').config({ path: '../.env' });
const { db } = require('../server/db');
async function run() {
  try {
    await db.run('ALTER TABLE restaurants ADD COLUMN display_feature_temp TINYINT DEFAULT 1;');
    console.log("Added display_feature_temp");
  } catch (e) { console.log(e.message); }
  try {
    await db.run('ALTER TABLE restaurants ADD COLUMN display_feature_co2 TINYINT DEFAULT 1;');
    console.log("Added display_feature_co2");
  } catch (e) { console.log(e.message); }
  process.exit(0);
}
run();
