const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
  try {
    const table = 'users';
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1
    `, [table]);
    console.log(`Columns in ${table}:`);
    res.rows.forEach(row => {
      console.log(`- ${row.column_name}: ${row.data_type}`);
    });
    console.log('---');
  } catch (err) {
    console.error('Error checking constraints:', err.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
