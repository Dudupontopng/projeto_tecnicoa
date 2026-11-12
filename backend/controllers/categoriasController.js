const pool = require('../database/conexao');

function idValido(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function nomeValido(valor) {
  const nome = typeof valor === 'string' ? valor.trim() : '';
  return nome.length >= 2 && nome.length <= 80 ? nome : null;
}

// GET /categorias (qualquer usuário autenticado)
async function listar(req, res) {
  try {
    const [linhas] = await pool.query('SELECT id, nome FROM categorias ORDER BY nome');
    return res.json(linhas);
  } catch (erro) {
    console.error('Erro ao listar categorias:', erro);
    return res.status(500).json({ erro: 'Erro interno ao listar categorias.' });
  }
}

// POST /categorias (admin)
async function criar(req, res) {
  const nome = nomeValido(req.body.nome);
  if (!nome) return res.status(400).json({ erro: 'O nome deve ter entre 2 e 80 caracteres.' });
  try {
    const [resultado] = await pool.query('INSERT INTO categorias (nome) VALUES (?)', [nome]);
    return res.status(201).json({ mensagem: 'Categoria criada.', id: resultado.insertId });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ erro: 'Já existe uma categoria com este nome.' });
    }
    console.error('Erro ao criar categoria:', erro);
    return res.status(500).json({ erro: 'Erro interno ao criar a categoria.' });
  }
}

// PUT /categorias/:id (admin)
async function atualizar(req, res) {
  const id = idValido(req.params.id);
  const nome = nomeValido(req.body.nome);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });
  if (!nome) return res.status(400).json({ erro: 'O nome deve ter entre 2 e 80 caracteres.' });
  try {
    const [resultado] = await pool.query('UPDATE categorias SET nome = ? WHERE id = ?', [nome, id]);
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Categoria não encontrada.' });
    }
    return res.json({ mensagem: 'Categoria atualizada.' });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ erro: 'Já existe uma categoria com este nome.' });
    }
    console.error('Erro ao atualizar categoria:', erro);
    return res.status(500).json({ erro: 'Erro interno ao atualizar a categoria.' });
  }
}

// DELETE /categorias/:id (admin) - bloqueado se houver doações usando a categoria
async function remover(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });
  try {
    const [resultado] = await pool.query('DELETE FROM categorias WHERE id = ?', [id]);
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Categoria não encontrada.' });
    }
    return res.json({ mensagem: 'Categoria excluída.' });
  } catch (erro) {
    if (erro.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ erro: 'Não é possível excluir: existem doações nesta categoria.' });
    }
    console.error('Erro ao excluir categoria:', erro);
    return res.status(500).json({ erro: 'Erro interno ao excluir a categoria.' });
  }
}

module.exports = { listar, criar, atualizar, remover };
