
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function updateUser() {
  await pool.query("UPDATE users SET section = 'CSE-A' WHERE roll_number = '24981A057E'");
  console.log("Updated user section to CSE-A");
  process.exit(0);
}

updateUser();
