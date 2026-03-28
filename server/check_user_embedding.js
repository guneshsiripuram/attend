const { query } = require('./src/db');

async function check() {
  try {
    const result = await query("SELECT id, full_name, role, face_embedding FROM users WHERE full_name ILIKE '%gunesh%'");
    if (result.rows.length === 0) {
      console.log('User not found.');
    } else {
      const u = result.rows[0];
      console.log(`User: ${u.full_name} (${u.role})`);
      console.log(`Face Embedding: ${u.face_embedding ? 'PRESENT' : 'NULL'}`);
      if (u.face_embedding) {
          const emb = typeof u.face_embedding === 'string' ? JSON.parse(u.face_embedding) : u.face_embedding;
          console.log(`Embedding Type: ${Array.isArray(emb) ? 'Array' : typeof emb}`);
          if (Array.isArray(emb)) {
              console.log(`Length: ${emb.length}`);
              console.log(`First 5 values: ${emb.slice(0, 5)}`);
          } else {
              console.log(`Raw: ${JSON.stringify(emb).substring(0, 100)}`);
          }
      }
    }
  } catch (error) {
    console.error('Check failed:', error);
  } finally {
    process.exit();
  }
}

check();
