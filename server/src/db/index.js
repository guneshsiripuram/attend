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

// Initialize database tables

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
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        campus_lat DECIMAL(10, 8),
        campus_lng DECIMAL(11, 8),
        max_distance_meters INTEGER DEFAULT 200
      );
    `);
    
    // Ensure existing databases are updated
    await pool.query("ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS session_starts_at TIMESTAMP WITH TIME ZONE");
    await pool.query("ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS campus_lat DECIMAL(10, 8) DEFAULT 17.8340");
    await pool.query("ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS campus_lng DECIMAL(11, 8) DEFAULT 83.3768");
    await pool.query("ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS max_distance_meters INTEGER DEFAULT 200");
    
    // Ensure we have exactly one settings record
    const result = await pool.query("SELECT COUNT(*) FROM portal_settings");
    if (result.rows[0].count === '0') {
      await pool.query("INSERT INTO portal_settings (id, is_open) VALUES (1, FALSE)");
    }
    console.log('Database initialized successfully: portal_settings table ready.');
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
};

// Run init
initDB();

module.exports = {
  query,
  pool,
  initDB
};
