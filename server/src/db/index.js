const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

const query = (text, params) => {
  console.log('--- EXECUTING QUERY ---');
  console.log('SQL:', text);
  console.log('Params:', params || []);
  return pool.query(text, params);
};

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portal_settings (
        id SERIAL PRIMARY KEY,
        is_open BOOLEAN DEFAULT FALSE,
        session_starts_at TIMESTAMP WITH TIME ZONE,
        expires_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Ensure existing databases are updated
    await pool.query("ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS session_starts_at TIMESTAMP WITH TIME ZONE");
    
    // Ensure one row exists
    const check = await query('SELECT COUNT(*) FROM portal_settings');
    if (parseInt(check.rows[0].count) === 0) {
      await query('INSERT INTO portal_settings (is_open) VALUES (false)');
    }
    
    console.log('Database initialized successfully: portal_settings table ready.');
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
};

module.exports = {
  query,
  pool,
  initDB
};
