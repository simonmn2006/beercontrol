
const { db } = require('../server/db');

async function seed() {
  try {
    const existing = await db.get('SELECT id FROM restaurants WHERE id = 1');
    if (!existing) {
      await db.run(`
        INSERT INTO restaurants (id, name, city, country, language, plan, active)
        VALUES (1, 'Cervecería de Prueba', 'Madrid', 'Spain', 'es', 'starter', 1)
      `);
      console.log('✓ Created sample restaurant (ID: 1)');
    } else {
      console.log('✓ Sample restaurant (ID: 1) already exists');
    }
  } catch (e) {
    console.error('✗ Error seeding restaurant:', e.message);
  } finally {
    process.exit(0);
  }
}

seed();
