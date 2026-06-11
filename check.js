require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS
});
p.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
  .then(r => { console.log(r.rows); p.end(); })
  .catch(e => console.error(e.message));