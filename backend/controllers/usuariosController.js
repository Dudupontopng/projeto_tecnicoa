const bcrypt = require('bcryptjs');
const pool = require('../database/conexao');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function idValido(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

// GET /usuarios  (somente admin) - nunca devolve a senha/hash
async function listar(req, res) {
  try {
    const [linhas] = await pool.query(
      'SELECT id, nome, email, nivel, criado_em FROM usuarios ORDER BY id'
    );
    return res.json(linhas);
  } catch (erro) {
    console.error('Erro ao listar usuários:', erro);
    return res.status(500).json({ erro: 'Erro interno ao listar usuários.' });
  }
}

// GET /usuarios/:id  (somente admin)
async function buscarPorId(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });
  try {
    const [linhas] = await pool.query(
      'SELECT id, nome, email, nivel, criado_em FROM usuarios WHERE id = ?',
      [id]
    );
    if (linhas.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }
    return res.json(linhas[0]);
  } catch (erro) {
    console.error('Erro ao buscar usuário:', erro);
    return res.status(500).json({ erro: 'Erro interno ao buscar usuário.' });
  }
}

// PUT /usuarios/:id  (somente admin)
// body: { nome, email, senha? }  - a senha só é trocada se for enviada.
// O perfil (nivel) NÃO pode ser alterado por aqui: perfil define dados vinculados
// (ex.: instituição), então mudar de perfil exigiria um novo cadastro.
async function atualizar(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });

  const nome = texto(req.body.nome);
  const email = texto(req.body.email).toLowerCase();
  const senha = req.body.senha;

  if (nome.length < 3) {
    return res.status(400).json({ erro: 'Informe o nome (mínimo 3 caracteres).' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  }
  const trocarSenha = senha !== undefined && senha !== null && senha !== '';
  if (trocarSenha && (typeof senha !== 'string' || senha.length < 8)) {
    return res.status(400).json({ erro: 'A nova senha deve ter no mínimo 8 caracteres.' });
  }

  try {
    let resultado;
    if (trocarSenha) {
      const senhaHash = await bcrypt.hash(senha, 10);
      [resultado] = await pool.query(
        'UPDATE usuarios SET nome = ?, email = ?, senha_hash = ? WHERE id = ?',
        [nome, email, senhaHash, id]
      );
    } else {
      [resultado] = await pool.query('UPDATE usuarios SET nome = ?, email = ? WHERE id = ?', [
        nome,
        email,
        id,
      ]);
    }
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }
    return res.json({ mensagem: 'Usuário atualizado com sucesso.' });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ erro: 'Já existe um usuário com este e-mail.' });
    }
    console.error('Erro ao atualizar usuário:', erro);
    return res.status(500).json({ erro: 'Erro interno ao atualizar o usuário.' });
  }
}

// DELETE /usuarios/:id  (somente admin)
// Não exclui a própria conta nem usuários que já têm doações ou reservas
// (as chaves estrangeiras preservam o histórico da plataforma).
async function remover(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });
  if (id === req.usuario.id) {
    return res.status(409).json({ erro: 'Você não pode excluir a sua própria conta.' });
  }

  try {
    const [resultado] = await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }
    return res.json({ mensagem: 'Usuário excluído com sucesso.' });
  } catch (erro) {
    if (erro.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        erro: 'Este usuário possui doações ou reservas registradas e não pode ser excluído (o histórico é preservado).',
      });
    }
    console.error('Erro ao excluir usuário:', erro);
    return res.status(500).json({ erro: 'Erro interno ao excluir o usuário.' });
  }
}

module.exports = { listar, buscarPorId, atualizar, remover };
