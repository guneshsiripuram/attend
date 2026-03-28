require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkUser() {
  try {
    const res = await pool.query("SELECT id, full_name, college_email, role FROM users WHERE college_email = 'raghumail'");
    console.log('--- USER CHECK ---');
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkUser();
