require('dotenv').config();
const { query } = require('./src/db');
async function makeAdmin() {
  const email = 'guneshsiripuram7@gmail.com';
  try {
    const result = await query(
      "INSERT INTO users (full_name, college_email, role) VALUES ('Gunesh', 'guneshsiripuram7@gmail.com', 'admin') ON CONFLICT (college_email) DO UPDATE SET role = 'admin' RETURNING *"
    );
    console.log('SUCCESS: ', result.rows[0]);
  } catch (err) {
    console.error('ERROR: ', err.message);
  }
  process.exit(0);
}
makeAdmin();
