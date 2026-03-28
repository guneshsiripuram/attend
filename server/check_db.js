const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
  try {
    const table = 'attendance_logs';
    const res = await pool.query(`
      SELECT column_name, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = $1
    `, [table]);
    console.log(`Constraints in ${table}:`);
    res.rows.forEach(row => {
      console.log(`- ${row.column_name}: Nullable=${row.is_nullable}`);
    });
    console.log('---');
  } catch (err) {
    console.error('Error checking constraints:', err.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
