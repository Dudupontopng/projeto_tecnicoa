const jwt = require('jsonwebtoken');

// Exige um token JWT valido no cabecalho:  Authorization: Bearer <token>
// Se valido, disponibiliza os dados do usuario em req.usuario.
function autenticar(req, res, next) {
  const cabecalho = req.headers.authorization || '';
  const [tipo, token] = cabecalho.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Token de autenticacao nao informado.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = { id: payload.id, nivel: payload.nivel };
    next();
  } catch (erro) {
    const mensagem =
      erro.name === 'TokenExpiredError'
        ? 'Token expirado. Faca login novamente.'
        : 'Token invalido.';
    return res.status(401).json({ erro: mensagem });
  }
}

module.exports = autenticar;
