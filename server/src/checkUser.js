const { query } = require('./db');
require('dotenv').config();

async function checkUser() {
  try {
    const email = '24981a057e@raghuenggcollege.in';
    console.log(`Checking data for ${email}...`);
    
    const result = await query(
      "SELECT roll_number, section, role FROM users WHERE college_email = $1",
      [email]
    );
    
    if (result.rowCount > 0) {
      console.log('Stored Data Result:');
      console.log(JSON.stringify(result.rows[0], null, 2));
      console.log('--- RAW VALUES ---');
      console.log(`Roll Number: "${result.rows[0].roll_number}" (Length: ${result.rows[0].roll_number.length})`);
      console.log(`Section: "${result.rows[0].section}" (Length: ${result.rows[0].section.length})`);
    } else {
      console.log('User not found.');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

checkUser();
