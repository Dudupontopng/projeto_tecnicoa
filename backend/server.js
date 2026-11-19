require('dotenv').config();
const path = require('path');
const express = require('express');

const pool = require('./database/conexao');
const corsMiddleware = require('./middlewares/corsMiddleware');
const authRoutes = require('./routes/authRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const instituicoesRoutes = require('./routes/instituicoesRoutes');
const categoriasRoutes = require('./routes/categoriasRoutes');
const doacoesRoutes = require('./routes/doacoesRoutes');
const reservasRoutes = require('./routes/reservasRoutes');
const indicadoresRoutes = require('./routes/indicadoresRoutes');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET não definido. Copie .env.example para .env e preencha.');
  process.exit(1);
}

const app = express();
const PASTA_FRONTEND = path.join(__dirname, '..', 'frontend');

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  next();
});
app.use(corsMiddleware);
app.use(express.json({ limit: '100kb' }));

// API
app.get('/api', (req, res) => res.json({ api: 'Ponte Alimentar', status: 'online' }));
app.get('/api/saude', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', banco: 'conectado' });
  } catch (erro) {
    res.status(503).json({ status: 'erro', banco: 'indisponível' });
  }
});
app.use('/auth', authRoutes);
app.use('/usuarios', usuariosRoutes);
app.use('/instituicoes', instituicoesRoutes);
app.use('/categorias', categoriasRoutes);
app.use('/doacoes', doacoesRoutes);
app.use('/reservas', reservasRoutes);
app.use('/indicadores', indicadoresRoutes);

// Front-end estático (http://localhost:3000/login.html)
app.use(express.static(PASTA_FRONTEND));
app.get('/', (req, res) => res.redirect('/login.html'));

// Rota inexistente: página amigável para o navegador, JSON para a API
app.use((req, res) => {
  if (req.method === 'GET' && req.accepts(['json', 'html']) === 'html') {
    return res.status(404).sendFile(path.join(PASTA_FRONTEND, '404.html'));
  }
  return res.status(404).json({ erro: 'Rota não encontrada.' });
});

// JSON malformado, corpo grande demais e erros não tratados
app.use((erro, req, res, next) => {
  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido no corpo da requisição.' });
  }
  if (erro.type === 'entity.too.large') {
    return res.status(413).json({ erro: 'Corpo da requisição grande demais.' });
  }
  console.error(erro);
  return res.status(500).json({ erro: 'Erro interno do servidor.' });
});

process.on('unhandledRejection', (motivo) => {
  console.error('Promessa rejeitada sem tratamento:', motivo);
});

async function iniciar() {
  // Confere o banco antes de aceitar requisições, com mensagem clara se falhar.
  try {
    await pool.query('SELECT 1');
  } catch (erro) {
    console.error(`Não foi possível conectar ao MySQL: ${erro.message}`);
    console.error('Verifique se o MySQL está em execução e se DB_HOST, DB_USER, DB_PASSWORD e DB_NAME estão corretos no .env.');
    process.exit(1);
  }

  const PORT = process.env.PORT || 3000;
  const servidor = app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));
  servidor.on('error', (erro) => {
    if (erro.code === 'EADDRINUSE') {
      console.error(`A porta ${PORT} já está em uso. Feche o outro servidor ou altere PORT no .env.`);
    } else {
      console.error('Erro ao iniciar o servidor:', erro.message);
    }
    process.exit(1);
  });
}

iniciar();
