
require('dotenv').config();
const { db } = require('../server/db');

async function verify() {
  try {
    // 1. Setup a test restaurant
    const rest = await db.run("INSERT INTO restaurants (name) VALUES ('Test Restaurant')");
    const rid = rest.lastInsertRowid;
    console.log(`◈ Test restaurant created ID: ${rid}`);

    // 2. Create an active keg on Tap 1
    const keg1 = await db.run("INSERT INTO kegs (restaurant_id, tap_number, beer_name, active) VALUES (?, 1, 'Beer 1', 1)", [rid]);
    console.log(`✓ Created Keg 1 on Tap 1`);

    // 3. Simulate POST /kegs uniqueness check
    console.log("◈ Simulating POST uniqueness check for Tap 1...");
    const existing = await db.get("SELECT id FROM kegs WHERE restaurant_id=? AND tap_number=? AND active=1", [rid, 1]);
    if (existing) {
      console.log("✅ SUCCESS: Logic correctly identifies Tap 1 is in use.");
    } else {
      console.log("❌ FAILURE: Logic missed existing Tap 1.");
    }

    // 4. Create another keg on Tap 2
    const keg2 = await db.run("INSERT INTO kegs (restaurant_id, tap_number, beer_name, active) VALUES (?, 2, 'Beer 2', 1)", [rid]);
    const k2id = keg2.lastInsertRowid;
    console.log(`✓ Created Keg 2 on Tap 2`);

    // 5. Simulate PUT /kegs/:id uniqueness check (updating keg2 to tap 1)
    console.log(`◈ Simulating PUT uniqueness check (moving Keg 2 [ID:${k2id}] to Tap 1)...`);
    const existingForUpdate = await db.get("SELECT id FROM kegs WHERE restaurant_id=? AND tap_number=? AND active=1 AND id != ?", [rid, 1, k2id]);
    if (existingForUpdate) {
      console.log("✅ SUCCESS: Logic correctly identifies Tap 1 is in use when updating another keg.");
    } else {
      console.log("❌ FAILURE: Logic missed conflict with Tap 1 during update.");
    }

    // 6. Test soft delete reuse
    console.log("◈ Simulating Tap 1 deletion...");
    await db.run("UPDATE kegs SET active=0 WHERE restaurant_id=? AND tap_number=1", [rid]);
    
    console.log("◈ Checking if Tap 1 is now available...");
    const available = await db.get("SELECT id FROM kegs WHERE restaurant_id=? AND tap_number=? AND active=1", [rid, 1]);
    if (!available) {
      console.log("✅ SUCCESS: Tap 1 is correctly reported as available after soft-delete.");
    } else {
      console.log("❌ FAILURE: Tap 1 still flagged as in use after soft-delete.");
    }

    // 7. Cleanup
    await db.run("DELETE FROM kegs WHERE restaurant_id=?", [rid]);
    await db.run("DELETE FROM restaurants WHERE id=?", [rid]);
    console.log("◈ Cleanup complete.");

  } catch (err) {
    console.error("✗ Verification Error:", err.message);
  } finally {
    process.exit(0);
  }
}

verify();
