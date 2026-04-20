require('dotenv').config();
const { db } = require('../server/db');

async function seed() {
  console.log('🌱 Seeding historical data for Christmas 2024...');
  
  // Find a restaurant with active kegs
  const firstWithKegs = await db.get("SELECT DISTINCT restaurant_id FROM kegs WHERE active=1 LIMIT 1");
  if (!firstWithKegs) {
    console.log('❌ No active kegs found in the database. Please add some kegs first.');
    process.exit(1);
  }
  
  const restaurant_id = firstWithKegs.restaurant_id;
  console.log(`📍 Found restaurant ${restaurant_id} with active kegs.`);
  const beers = await db.all("SELECT id, beer_name, keg_size_liters FROM kegs WHERE restaurant_id=? AND active=1", [restaurant_id]);

  // Create events for Dec 20, 2024 - Jan 5, 2025
  const startDate = new Date('2024-12-20T12:00:00');
  const endDate = new Date('2025-01-05T23:00:00');

  let totalEvents = 0;
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    for (const b of beers) {
      // Simulate heavy holiday drinking: 10-25 liters per day per beer
      const liters = 10 + Math.random() * 15;
      await db.run(`
        INSERT INTO pour_events (keg_id, restaurant_id, liters, recorded_at)
        VALUES (?, ?, ?, ?)
      `, [b.id, restaurant_id, liters, d.toISOString().slice(0, 19).replace('T', ' ')]);
      totalEvents++;
    }
  }

  console.log(`✅ Seeded ${totalEvents} historical pour events.`);
  process.exit(0);
}

seed();
