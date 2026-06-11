require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
});

async function main() {
  const client = await pool.connect();
  
  await client.query('SET search_path TO public');
  console.log('✅ search_path установлен');

  await client.query(`CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY, slug VARCHAR(200) UNIQUE NOT NULL,
    name TEXT NOT NULL, file_path TEXT, file_url TEXT,
    file_type VARCHAR(20) DEFAULT 'file', email_html TEXT,
    active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW())`);
  console.log('✅ products');

  await client.query(`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY, systran_id VARCHAR(100) UNIQUE,
    buyer_email TEXT NOT NULL, buyer_name TEXT, buyer_phone TEXT,
    amount NUMERIC(10,2), products JSONB, status VARCHAR(20) DEFAULT 'paid',
    email_sent BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())`);
  console.log('✅ orders');

  await client.query(`CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY, level VARCHAR(10) DEFAULT 'info',
    message TEXT, payload JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`);
  console.log('✅ logs');

  const r = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public'`
  );
  console.log('Таблицы:', r.rows);

  client.release();
  pool.end();
}

main().catch(console.error);