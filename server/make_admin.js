require('dotenv').config();
const { query } = require('./src/db');

async function makeAdmin() {
  const email = 'guneshsiripuram7@gmail.com';
  try {
    const result = await query(
      'INSERT INTO users (full_name, college_email, role) VALUES (, , ) ON CONFLICT (college_email) DO UPDATE SET role =  RETURNING *',
      ['Gunesh', email, 'admin']
    );
    console.log('Successfully added admin:', result.rows[0]);
  } catch (err) {
    console.error('Error insert admin:', err);
  }
  process.exit(0);
}
makeAdmin();

