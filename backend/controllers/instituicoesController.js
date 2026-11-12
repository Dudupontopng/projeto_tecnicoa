const pool = require('../database/conexao');

const STATUS_VALIDOS = ['pendente', 'aprovada', 'recusada'];

// GET /instituicoes?status=pendente  (somente admin)
async function listar(req, res) {
  const { status } = req.query;
  if (status && !STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ erro: 'Status inválido. Use pendente, aprovada ou recusada.' });
  }
  try {
    let sql = `SELECT i.id, i.nome, i.endereco, i.cidade, i.status_aprovacao,
                      u.id AS usuario_id, u.email
                 FROM instituicoes i
                 JOIN usuarios u ON u.id = i.usuario_id`;
    const params = [];
    if (status) {
      sql += ' WHERE i.status_aprovacao = ?';
      params.push(status);
    }
    sql += ' ORDER BY i.id';
    const [linhas] = await pool.query(sql, params);
    return res.json(linhas);
  } catch (erro) {
    console.error('Erro ao listar instituicoes:', erro);
    return res.status(500).json({ erro: 'Erro interno ao listar instituições.' });
  }
}

// PUT /instituicoes/:id/aprovacao  (somente admin)  body: { "status": "aprovada" | "recusada" }
async function atualizarAprovacao(req, res) {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ erro: 'ID inválido.' });
  }
  if (!['aprovada', 'recusada'].includes(status)) {
    return res.status(400).json({ erro: "O status deve ser 'aprovada' ou 'recusada'." });
  }
  try {
    const [resultado] = await pool.query(
      'UPDATE instituicoes SET status_aprovacao = ? WHERE id = ?',
      [status, id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Instituição não encontrada.' });
    }
    return res.json({ mensagem: `Instituição ${status} com sucesso.` });
  } catch (erro) {
    console.error('Erro ao atualizar aprovacao:', erro);
    return res.status(500).json({ erro: 'Erro interno ao atualizar a instituição.' });
  }
}

module.exports = { listar, atualizarAprovacao };
