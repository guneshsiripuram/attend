
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkUser() {
  const res = await pool.query("SELECT full_name, roll_number, section FROM users WHERE roll_number = '24981A057E'");
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}

checkUser();
