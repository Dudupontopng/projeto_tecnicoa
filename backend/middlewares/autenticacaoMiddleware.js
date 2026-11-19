const jwt = require('jsonwebtoken');
const pool = require('../database/conexao');

// Exige um token JWT válido no cabeçalho:  Authorization: Bearer <token>
// Se válido, disponibiliza os dados do usuário em req.usuario.
//
// Além de validar a assinatura e a validade do token, confere no banco se o usuário
// ainda existe e qual é o perfil ATUAL dele. Assim, um usuário excluído perde o acesso
// na hora e uma mudança de perfil vale imediatamente (sem esperar o token expirar).
async function autenticar(req, res, next) {
  const cabecalho = req.headers.authorization || '';
  const [tipo, token] = cabecalho.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Token de autenticação não informado.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (erro) {
    const mensagem =
      erro.name === 'TokenExpiredError'
        ? 'Token expirado. Faça login novamente.'
        : 'Token inválido.';
    return res.status(401).json({ erro: mensagem });
  }

  try {
    const [linhas] = await pool.query('SELECT id, nivel FROM usuarios WHERE id = ?', [payload.id]);
    if (linhas.length === 0) {
      return res.status(401).json({ erro: 'Usuário não encontrado. Faça login novamente.' });
    }
    req.usuario = { id: linhas[0].id, nivel: linhas[0].nivel };
    return next();
  } catch (erro) {
    console.error('Erro ao validar a sessão:', erro);
    return res.status(500).json({ erro: 'Erro interno ao validar a sessão.' });
  }
}

module.exports = autenticar;
