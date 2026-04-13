
const { pool } = require('../server/db');

async function testUpsert() {
  const conn = await pool.getConnection();
  try {
    const upsert = "INSERT INTO settings (`key`,`value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)";
    await conn.execute(upsert, ['test_key', 'test_value']);
    console.log('✓ Upsert 1 successful');
    await conn.execute(upsert, ['test_key', 'updated_value']);
    console.log('✓ Upsert 2 (update) successful');
  } catch (e) {
    console.error('✗ Upsert failed:', e.message);
  } finally {
    conn.release();
    process.exit(0);
  }
}

testUpsert();
