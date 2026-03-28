const { query } = require('./src/db');

async function check() {
  try {
    console.log('--- DIAGNOSTIC: Checking Logs for Gunesh ---');
    const logs = await query(`
      SELECT l.timestamp, l.status, l.location_data, u.full_name
      FROM attendance_logs l
      JOIN users u ON l.user_id = u.id
      WHERE u.full_name ILIKE '%gunesh%'
      ORDER BY l.timestamp DESC
      LIMIT 15
    `);

    if (logs.rows.length === 0) {
        console.log('No logs found for Gunesh.');
    }

    logs.rows.forEach(log => {
      const ts = new Date(log.timestamp).toLocaleString();
      console.log(`[${ts}] User: ${log.full_name} | Status: ${log.status}`);
      try {
          const data = typeof log.location_data === 'string' ? JSON.parse(log.location_data) : log.location_data;
          if (data.similarity) {
              console.log(`  > Similarity: ${data.similarity}`);
          } else {
              console.log(`  > Metadata: ${JSON.stringify(data)}`);
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
