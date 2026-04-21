const { query } = require('./src/db');

async function check() {
  try {
    console.log('--- DIAGNOSTIC: Checking Logs for Gunesh ---');
    const logs = await query(`
<<<<<<< HEAD
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
=======
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
>>>>>>> b6b4533a15ad866895ed4b8c4c9a3d25cf2d9d1e
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
