const { query } = require('./db');
require('dotenv').config();

async function demoteUser() {
  try {
    const email = '24981a057e@raghuenggcollege.in';
    console.log(`Demoting ${email} to student...`);
    
    const result = await query(
      "UPDATE users SET role = 'student' WHERE college_email = $1 RETURNING roll_number, section, role",
      [email]
    );
    
    if (result.rowCount > 0) {
      console.log('User demoted successfully:');
      console.log(JSON.stringify(result.rows[0], null, 2));
    } else {
      console.log('User not found.');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

demoteUser();
