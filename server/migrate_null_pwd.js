const { query } = require('./src/db');
async function migrate() {
  try {
    console.log('Altering users table to allow null password_hash...');
    await query('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL');
    console.log('Success!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}
migrate();
