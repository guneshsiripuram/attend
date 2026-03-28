const { query } = require('./db');
require('dotenv').config();

async function fixUser() {
  try {
    const email = '24981a057e@raghuenggcollege.in';
    const rollNumber = '24981A057E';
    
    console.log(`Updating user ${email}...`);
    
    const result = await query(
      'UPDATE users SET roll_number = $1, role = $2 WHERE college_email = $3 RETURNING *',
      [rollNumber, 'admin', email]
    );
    
    if (result.rowCount > 0) {
      console.log('User updated successfully:');
      console.log(JSON.stringify(result.rows[0], null, 2));
    } else {
      console.log('No user found with that email.');
    }
  } catch (err) {
    console.error('Error fixing user:', err);
  } finally {
    process.exit();
  }
}

fixUser();
