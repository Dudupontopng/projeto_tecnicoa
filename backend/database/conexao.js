const mysql = require('mysql2/promise');

// Pool de conexoes: reaproveita conexoes em vez de abrir uma a cada requisicao.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ponte_alimentar',
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
