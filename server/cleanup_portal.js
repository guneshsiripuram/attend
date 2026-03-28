require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function cleanupPortal() {
  const client = await pool.connect();
  try {
    console.log('--- Cleaning up portal_settings table ---');
    
    // 1. Check existing rows
    const res = await client.query('SELECT * FROM portal_settings');
    console.log(`Current rows: ${res.rows.length}`);
    
    if (res.rows.length === 0) {
      console.log('No rows found. Inserting default row with ID 1...');
      await client.query('INSERT INTO portal_settings (id, is_open) VALUES (1, false)');
    } else if (res.rows.length > 1 || res.rows[0].id !== 1) {
      console.log('Multiple rows or incorrect ID found. Resetting table...');
      await client.query('DELETE FROM portal_settings');
      await client.query('INSERT INTO portal_settings (id, is_open) VALUES (1, false)');
    } else {
      console.log('Table already has a single row with ID 1. All good!');
    }
    
    const finalRes = await client.query('SELECT * FROM portal_settings');
    console.log('Final state:', finalRes.rows);
    
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupPortal();
