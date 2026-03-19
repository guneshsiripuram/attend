const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function seedAdmin() {
  const full_name = 'Super Admin';
  const college_email = 'raghumail';
  const password = 'raghupassword';
  const role = 'admin';

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Check if user already exists
    const checkRes = await pool.query('SELECT id FROM users WHERE college_email = $1', [college_email]);
    
    if (checkRes.rows.length > 0) {
      console.log('Admin user already exists. Updating password...');
      await pool.query(
        'UPDATE users SET password_hash = $1, role = $2 WHERE college_email = $3',
        [hashedPassword, role, college_email]
      );
    } else {
      console.log('Creating new admin user...');
      await pool.query(
        'INSERT INTO users (full_name, college_email, password_hash, role) VALUES ($1, $2, $3, $4)',
        [full_name, college_email, hashedPassword, role]
      );
    }
    console.log('SUCCESS: Admin account "raghumail" is ready.');
  } catch (err) {
    console.error('SEED_ERROR:', err);
  } finally {
    process.exit(0);
  }
}

seedAdmin();
