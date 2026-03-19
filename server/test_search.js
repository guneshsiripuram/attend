const { query } = require('./src/db');
require('dotenv').config();

async function testQuery() {
  try {
    const name = '24981A057E';
    const email = '';
    const date = '2026-03-18';
    
    let q = `
      SELECT al.id, al.timestamp, al.status, u.full_name, u.college_email, u.roll_number, u.section
      FROM attendance_logs al
      JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (name) {
      params.push(`%${name}%`);
      q += ` AND (u.full_name ILIKE $${params.length} OR u.roll_number ILIKE $${params.length})`;
    }
    if (email) {
      params.push(`%${email}%`);
      q += ` AND u.college_email ILIKE $${params.length}`;
    }
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      
      params.push(startDate.toISOString().split('T')[0]);
      params.push(endDate.toISOString().split('T')[0]);
      q += ` AND al.timestamp >= $${params.length - 1} AND al.timestamp < $${params.length}`;
    }

    q += ` ORDER BY al.timestamp DESC`;

    console.log('Query:', q);
    console.log('Params:', params);

    const result = await query(q, params);
    console.log('Result Count:', result.rows.length);
    console.table(result.rows);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

testQuery();
