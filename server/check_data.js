const { query } = require('./src/db');
require('dotenv').config();

async function check() {
  try {
    console.log('--- ALL USERS ---');
    const users = await query('SELECT id, full_name, roll_number, role FROM users');
    console.table(users.rows);

    console.log('--- ALL ATTENDANCE LOGS ---');
    const logs = await query('SELECT al.id, al.user_id, al.timestamp, al.status, u.roll_number FROM attendance_logs al JOIN users u ON al.user_id = u.id');
    console.table(logs.rows);

    console.log('--- LOGS WITHOUT USER JOIN ---');
    const basicLogs = await query('SELECT * FROM attendance_logs');
    console.table(basicLogs.rows);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
