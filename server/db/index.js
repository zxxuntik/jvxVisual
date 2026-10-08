const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (error) => {
  console.error('Ошибка пула PostgreSQL:', error.message);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};