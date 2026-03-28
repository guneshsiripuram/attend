const { query } = require('./db');
require('dotenv').config();

async function updateSection() {
  try {
    const email = '24981a057e@raghuenggcollege.in';
    console.log(`Updating ${email} section to A...`);
    
    await query(
      "UPDATE users SET section = $1 WHERE college_email = $2",
      ['A', email]
    );
    
    const result = await query("SELECT roll_number, section FROM users WHERE college_email = $1", [email]);
    console.log('Update Successful:', JSON.stringify(result.rows[0]));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

updateSection();
