const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initDb() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Cloud DB');
    
    const schemaFile = path.join(__dirname, '../schema.sql');
    const schema = fs.readFileSync(schemaFile, 'utf8');
    
    await client.query(schema);
    console.log('Schema initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    await client.end();
  }
}

initDb();
