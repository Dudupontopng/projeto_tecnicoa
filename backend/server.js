require('dotenv').config();
const express = require('express');

const corsMiddleware = require('./middlewares/corsMiddleware');
const authRoutes = require('./routes/authRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const instituicoesRoutes = require('./routes/instituicoesRoutes');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET nao definido. Copie .env.example para .env e preencha.');
  process.exit(1);
}

const app = express();

app.use(corsMiddleware);
app.use(express.json());

app.get('/', (req, res) => res.json({ api: 'Ponte Alimentar', status: 'online' }));

app.use('/auth', authRoutes);
app.use('/usuarios', usuariosRoutes);
app.use('/instituicoes', instituicoesRoutes);

// Rota inexistente
app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada.' }));

// JSON malformado e erros nao tratados
app.use((erro, req, res, next) => {
  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON invalido no corpo da requisicao.' });
  }
  console.error(erro);
  return res.status(500).json({ erro: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));
