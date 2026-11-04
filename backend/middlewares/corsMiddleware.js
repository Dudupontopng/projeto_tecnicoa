const cors = require('cors');

// Libera apenas a origem do front-end definida no .env
module.exports = cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5500',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
