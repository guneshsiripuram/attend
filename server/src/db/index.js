const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize database tables
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portal_settings (
        id SERIAL PRIMARY KEY,
        is_open BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Ensure we have exactly one settings record
    const result = await pool.query("SELECT COUNT(*) FROM portal_settings WHERE id = 1");
    if (result.rows[0].count === '0') {
      await pool.query("INSERT INTO portal_settings (id, is_open) VALUES (1, FALSE)");
    }
    console.log('Database initialized successfully (portal_settings verified)');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
};

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

// Run init
initDB();

module.exports = {
  query: (text, params) => pool.query(text, params),
};
