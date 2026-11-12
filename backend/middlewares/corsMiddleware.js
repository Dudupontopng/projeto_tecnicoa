const cors = require('cors');

// Origens liberadas (separadas por vírgula no .env). Quando o front-end é aberto
// pelo próprio servidor (http://localhost:3000) o CORS nem é necessário.
const origensPermitidas = (
  process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5500,http://localhost:5500'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

module.exports = cors({
  origin: origensPermitidas,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
