const pool = require('../database/conexao');

// GET /usuarios  (somente admin) - nunca devolve a senha/hash
async function listar(req, res) {
  try {
    const [linhas] = await pool.query(
      'SELECT id, nome, email, nivel, criado_em FROM usuarios ORDER BY id'
    );
    return res.json(linhas);
  } catch (erro) {
    console.error('Erro ao listar usuarios:', erro);
    return res.status(500).json({ erro: 'Erro interno ao listar usuarios.' });
  }
}

// GET /usuarios/:id  (somente admin)
async function buscarPorId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ erro: 'ID invalido.' });
  }
  try {
    const [linhas] = await pool.query(
      'SELECT id, nome, email, nivel, criado_em FROM usuarios WHERE id = ?',
      [id]
    );
    if (linhas.length === 0) {
      return res.status(404).json({ erro: 'Usuario nao encontrado.' });
    }
    return res.json(linhas[0]);
  } catch (erro) {
    console.error('Erro ao buscar usuario:', erro);
    return res.status(500).json({ erro: 'Erro interno ao buscar usuario.' });
  }
}

module.exports = { listar, buscarPorId };
