const { query } = require('./src/db');
require('dotenv').config();

async function checkDuplicates() {
  try {
    console.log('--- DIAGNOSTIC: Checking for Duplicate Attendance Records ---');
    const result = await query(`
      SELECT user_id, u.full_name, (al.timestamp AT TIME ZONE 'Asia/Kolkata')::date as log_date, 
             (CASE WHEN EXTRACT(HOUR FROM al.timestamp AT TIME ZONE 'Asia/Kolkata') < 12 THEN 'Morning' ELSE 'Afternoon' END) as session, 
             COUNT(*) 
      FROM attendance_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.status = 'Present' 
      GROUP BY user_id, u.full_name, log_date, session 
      HAVING COUNT(*) > 1 
      ORDER BY log_date DESC;
    `);

    if (result.rows.length === 0) {
      console.log('SUCCESS: No duplicate attendance records found in the database.');
    } else {
      console.log('WARNING: Found duplicate records:');
      result.rows.forEach(row => {
        console.log(`- Student: ${row.full_name} (${row.user_id}) | Date: ${row.log_date.toISOString().split('T')[0]} | Session: ${row.session} | Count: ${row.count}`);
      });
    }

  } catch (error) {
    console.error('Audit failed:', error);
  } finally {
    process.exit();
  }
}

checkDuplicates();
