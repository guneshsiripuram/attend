const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  options: '-c timezone=Asia/Kolkata'
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

const query = (text, params) => pool.query(text, params);

const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name VARCHAR(255) NOT NULL,
      college_email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'student' CHECK (role IN ('student', 'admin')),
      face_embedding JSONB,
      roll_number VARCHAR(50) UNIQUE,
      branch VARCHAR(20),
      section VARCHAR(20),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      roll_number VARCHAR(50),
      section VARCHAR(20),
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(50) NOT NULL CHECK (status IN ('Present', 'Failed_Match', 'Failed_Location', 'Pending', 'Failed_Roll', 'Failed_Liveness')),
      location_data JSONB
    );
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance_logs(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance_logs(timestamp)');

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

  await pool.query("ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS session_starts_at TIMESTAMP WITH TIME ZONE");
  await pool.query("ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS campus_lat DECIMAL(10, 8) DEFAULT 17.8340");
  await pool.query("ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS campus_lng DECIMAL(11, 8) DEFAULT 83.3768");
  await pool.query("ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS max_distance_meters INTEGER DEFAULT 200");

  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS branch VARCHAR(20)");
  await pool.query("ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS location_data JSONB");

  const result = await pool.query("SELECT COUNT(*) FROM portal_settings");
  if (result.rows[0].count === '0') {
    await pool.query("INSERT INTO portal_settings (id, is_open) VALUES (1, FALSE)");
  }

  console.log('Database initialized successfully.');
};

module.exports = {
  query,
  pool,
  initDB
};
