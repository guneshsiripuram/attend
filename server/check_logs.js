const { query } = require('./src/db');

async function check() {
  try {
    console.log('--- DIAGNOSTIC: Checking Logs for Gunesh ---');
    const logs = await query(`
      SELECT l.timestamp, l.status, l.location_data 
      FROM attendance_logs l
      JOIN users u ON l.user_id = u.id
      WHERE u.name ILIKE '%gunesh%'
      ORDER BY l.timestamp DESC
      LIMIT 10
    `);

    logs.rows.forEach(log => {
      console.log(`[${log.timestamp}] Status: ${log.status}`);
      try {
          const data = JSON.parse(log.location_data);
          if (data.similarity) {
              console.log(`  > Similarity Logged: ${data.similarity}`);
          } else {
              console.log(`  > Location Only: ${data.lat}, ${data.lng}`);
          }
      } catch (e) {
          console.log(`  > Raw Data: ${log.location_data}`);
      }
    });

  } catch (error) {
    console.error('Diagnostic failed:', error);
  } finally {
    process.exit();
  }
}

check();
