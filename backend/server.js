require('dotenv').config();
const path = require('path');
const express = require('express');

const corsMiddleware = require('./middlewares/corsMiddleware');
const authRoutes = require('./routes/authRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const instituicoesRoutes = require('./routes/instituicoesRoutes');
const categoriasRoutes = require('./routes/categoriasRoutes');
const doacoesRoutes = require('./routes/doacoesRoutes');
const reservasRoutes = require('./routes/reservasRoutes');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET não definido. Copie .env.example para .env e preencha.');
  process.exit(1);
}

const app = express();

app.use(corsMiddleware);
app.use(express.json());

// API
app.get('/api', (req, res) => res.json({ api: 'Ponte Alimentar', status: 'online' }));
app.use('/auth', authRoutes);
app.use('/usuarios', usuariosRoutes);
app.use('/instituicoes', instituicoesRoutes);
app.use('/categorias', categoriasRoutes);
app.use('/doacoes', doacoesRoutes);
app.use('/reservas', reservasRoutes);

// Front-end estático (http://localhost:3000/login.html)
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('/', (req, res) => res.redirect('/login.html'));

// Rota inexistente
app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// JSON malformado e erros não tratados
app.use((erro, req, res, next) => {
  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido no corpo da requisição.' });
  }
  console.error(erro);
  return res.status(500).json({ erro: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));
