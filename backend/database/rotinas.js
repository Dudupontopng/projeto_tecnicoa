const pool = require('./conexao');

// Marca como 'expirada' toda doação disponível cuja validade ou prazo de retirada já passou.
// É chamada antes de listar, consultar e reservar, para o status nunca ficar desatualizado.
async function expirarVencidas(conexao = pool) {
  await conexao.query(
    `UPDATE doacoes
        SET status = 'expirada'
      WHERE status = 'disponivel'
        AND (validade < CURDATE() OR retirada_ate < NOW())`
  );
}

// Busca a instituição ligada a um usuário (ou undefined, se ele não for instituição).
async function obterInstituicao(usuarioId, conexao = pool) {
  const [linhas] = await conexao.query(
    'SELECT id, nome, status_aprovacao FROM instituicoes WHERE usuario_id = ?',
    [usuarioId]
  );
  return linhas[0];
}

module.exports = { expirarVencidas, obterInstituicao };
