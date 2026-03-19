const { query } = require('./db');
require('dotenv').config();

async function updateSchema() {
  try {
    console.log('Adding section columns to Cloud DB...');
    
    // Add section to users
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS section VARCHAR(20)');
    
    // Add section to attendance_logs
    await query('ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS section VARCHAR(20)');
    
    // Update existing user to a default section for testing
    await query("UPDATE users SET section = 'CSE-A' WHERE college_email = '24981a057e@raghuenggcollege.in'");
    
    console.log('Database schema updated for Section tracking');
  } catch (err) {
    console.error('Error updating schema:', err);
  } finally {
    process.exit();
  }
}

updateSchema();
