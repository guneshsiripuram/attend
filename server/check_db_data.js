const { query } = require('./src/db');
require('dotenv').config();

async function checkData() {
  try {
    const res = await query('SELECT id, full_name, roll_number, section, branch FROM users WHERE role = $1 LIMIT 5', ['student']);
    console.log('--- STUDENT DATA SAMPLE ---');
    console.table(result = res.rows);
    
    const nullBranch = await query('SELECT COUNT(*) FROM users WHERE branch IS NULL AND role = $1', ['student']);
    console.log('Students with NULL branch:', nullBranch.rows[0].count);
    
    const hyphenSection = await query("SELECT COUNT(*) FROM users WHERE section LIKE '%-%' AND role = $1", ['student']);
    console.log("Students with hyphenated section (e.g. CSE-A):", hyphenSection.rows[0].count);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkData();
