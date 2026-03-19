const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkAdmins() {
  try {
    const res = await pool.query("SELECT full_name, college_email FROM users WHERE role = 'admin'");
    if (res.rows.length > 0) {
      console.log('Existing Admin Users:');
      console.log(JSON.stringify(res.rows, null, 2));
    } else {
      console.log('No admin users found.');
    }
  } catch (err) {
    console.error('Error checking admins:', err);
  } finally {
    process.exit(0);
  }
}

checkAdmins();
