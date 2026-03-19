const { query } = require('./src/db');
require('dotenv').config();

async function migrateData() {
  try {
    console.log('--- STARTING DATA MIGRATION ---');
    
    // 1. Extract branch from section where branch is NULL but section has a hyphen
    const updateRes = await query(`
      UPDATE users 
      SET 
        branch = split_part(section, '-', 1),
        section = split_part(section, '-', 2)
      WHERE 
        branch IS NULL 
        AND section LIKE '%-%'
        AND role = 'student'
    `);
    
    console.log(`Migration successful! Records updated: ${updateRes.rowCount}`);

    // 2. Final verification
    const remaining = await query("SELECT COUNT(*) FROM users WHERE branch IS NULL AND role = 'student'");
    console.log(`Students remaining with NULL branch: ${remaining.rows[0].count}`);

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit();
  }
}

migrateData();
