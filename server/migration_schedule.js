const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log('Adding session_starts_at to portal_settings...');
    await pool.query('ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS session_starts_at TIMESTAMP WITH TIME ZONE');
    console.log('Column added successfully.');
  } catch(e) {
    console.error('Error during migration:', e);
  } finally {
    pool.end();
  }
}

migrate();
