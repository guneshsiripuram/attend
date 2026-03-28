const { query } = require('./src/db');

async function reset() {
  try {
    const result = await query("UPDATE users SET face_embedding = NULL WHERE full_name ILIKE '%gunesh%'");
    console.log(`RESET SUCCESSFUL: ${result.rowCount} user(s) updated.`);
  } catch (error) {
    console.error('Reset failed:', error);
  } finally {
    process.exit();
  }
}

reset();
