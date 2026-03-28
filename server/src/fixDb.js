const { Client } = require('pg');
require('dotenv').config();

async function fixConstraint() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Cloud DB to fix constraint');
    
    // Drop existing constraint (knowing it failed earlier)
    await client.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_college_email_check');
    
    // Add new constraint
    await client.query("ALTER TABLE users ADD CONSTRAINT users_college_email_check CHECK (college_email LIKE '%@raghuenggcollege.in')");
    
    console.log('Database constraint updated successfully');
  } catch (err) {
    console.error('Error fixing constraint:', err);
  } finally {
    await client.end();
  }
}

fixConstraint();
