// Restringe a rota a determinados niveis de usuario.
// Deve ser usado DEPOIS do middleware de autenticacao.
// Exemplo:  router.get('/', autenticar, permitir('admin'), controller.listar)
function permitir(...niveisPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ erro: 'Usuario nao autenticado.' });
    }
    if (!niveisPermitidos.includes(req.usuario.nivel)) {
      return res.status(403).json({ erro: 'Acesso negado para o seu perfil.' });
    }
    next();
  };
}

module.exports = permitir;
