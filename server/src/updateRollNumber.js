const { Client } = require('pg');
require('dotenv').config();

async function updateSchema() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Cloud DB to add roll_number columns');
    
    // Add roll_number to users
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS roll_number VARCHAR(50) UNIQUE');
    
    // Add roll_number to attendance_logs
    await client.query('ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS roll_number VARCHAR(50)');
    
    // Update status constraint
    await client.query('ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_status_check');
    await client.query("ALTER TABLE attendance_logs ADD CONSTRAINT attendance_logs_status_check CHECK (status IN ('Present', 'Failed_Match', 'Failed_Location', 'Pending', 'Failed_Roll'))");
    
    console.log('Database schema updated for roll_number');
  } catch (err) {
    console.error('Error updating schema:', err);
  } finally {
    await client.end();
  }
}

updateSchema();
