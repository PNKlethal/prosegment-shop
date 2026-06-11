require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
});

pool.on('error', (err) => {
  console.error('PostgreSQL error:', err.message);
});

async function query(sql, params) {
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO public');
    return await client.query(sql, params);
  } catch(err) {
    console.error('Query error:', err.message, '| SQL:', sql.substring(0, 80));
    throw err;
  } finally {
    client.release();
  }
}

async function log(level, message, payload) {
  try {
    await query(
      'INSERT INTO logs (level, message, payload) VALUES ($1, $2, $3)',
      [level, message, payload ? JSON.stringify(payload) : null]
    );
  } catch(e) {
    console.error('Log write error:', e.message);
  }
}

module.exports = { pool, query, log };