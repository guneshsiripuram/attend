const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function fixConstraint() {
  try {
    console.log('Dropping existing email check constraint...');
    await pool.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_college_email_check');
    
    console.log('Adding more flexible email check constraint...');
    // Allow either the official domain OR 'raghumail'
    await pool.query("ALTER TABLE users ADD CONSTRAINT users_college_email_check CHECK (college_email LIKE '%@raghuenggcollege.in' OR college_email = 'raghumail')");
    
    console.log('SUCCESS: Database constraint updated.');
  } catch (err) {
    console.error('CONSTRAINT_FIX_ERROR:', err);
  } finally {
    process.exit(0);
  }
}

fixConstraint();
