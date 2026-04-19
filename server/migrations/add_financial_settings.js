const db = require('../db');
async function migrate() {
  try {
    await db.run("ALTER TABLE restaurants ADD COLUMN financial_settings TEXT");
    console.log("✓ Added financial_settings to restaurants");
  } catch(e) {
    console.log("! financial_settings might already exist or error:", e.message);
  }
}
migrate();
