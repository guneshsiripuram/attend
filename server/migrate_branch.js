const { query } = require('./src/db');
require('dotenv').config();

async function migrate() {
  try {
    console.log('Adding branch column to users table...');
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS branch VARCHAR(50)');
    console.log('Success!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
