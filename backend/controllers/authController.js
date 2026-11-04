const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database/conexao');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Perfis que podem ser escolhidos no cadastro publico. 'admin' NUNCA pode.
const NIVEIS_CADASTRO = ['doador', 'instituicao'];
// Hash falso usado para manter o tempo de resposta parecido quando o e-mail nao existe.
const HASH_FALSO = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.1kQ5l6h0Zt6q8o7y5QJ9u5mR3bW2';

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function gerarToken(usuario) {
  return jwt.sign({ id: usuario.id, nivel: usuario.nivel }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
  });
}

// POST /auth/cadastro
async function cadastrar(req, res) {
  const nome = texto(req.body.nome);
  const email = texto(req.body.email).toLowerCase();
  const senha = typeof req.body.senha === 'string' ? req.body.senha : '';
  const nivel = texto(req.body.nivel);

  if (nome.length < 3) {
    return res.status(400).json({ erro: 'Informe o nome (minimo 3 caracteres).' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ erro: 'Informe um e-mail valido.' });
  }
  if (senha.length < 8) {
    return res.status(400).json({ erro: 'A senha deve ter no minimo 8 caracteres.' });
  }
  if (!NIVEIS_CADASTRO.includes(nivel)) {
    return res.status(400).json({ erro: "O perfil deve ser 'doador' ou 'instituicao'." });
  }

  let instituicao = null;
  if (nivel === 'instituicao') {
    instituicao = {
      nome: texto(req.body.nome_instituicao),
      endereco: texto(req.body.endereco),
      cidade: texto(req.body.cidade),
    };
    if (!instituicao.nome || !instituicao.endereco || !instituicao.cidade) {
      return res.status(400).json({
        erro: 'Instituicoes devem informar nome_instituicao, endereco e cidade.',
      });
    }
  }

  const conexao = await pool.getConnection();
  try {
    const senhaHash = await bcrypt.hash(senha, 10);

    // Transacao: ou grava usuario + instituicao, ou nao grava nada.
    await conexao.beginTransaction();
    const [resultado] = await conexao.query(
      'INSERT INTO usuarios (nome, email, senha_hash, nivel) VALUES (?, ?, ?, ?)',
      [nome, email, senhaHash, nivel]
    );
    if (instituicao) {
      await conexao.query(
        'INSERT INTO instituicoes (usuario_id, nome, endereco, cidade) VALUES (?, ?, ?, ?)',
        [resultado.insertId, instituicao.nome, instituicao.endereco, instituicao.cidade]
      );
    }
    await conexao.commit();

    return res.status(201).json({
      mensagem:
        nivel === 'instituicao'
          ? 'Cadastro realizado. Aguarde a aprovacao de um administrador para reservar doacoes.'
          : 'Cadastro realizado com sucesso.',
      usuario: { id: resultado.insertId, nome, email, nivel },
    });
  } catch (erro) {
    await conexao.rollback();
    if (erro.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ erro: 'Ja existe um usuario com este e-mail.' });
    }
    console.error('Erro no cadastro:', erro);
    return res.status(500).json({ erro: 'Erro interno ao realizar o cadastro.' });
  } finally {
    conexao.release();
  }
}

// POST /auth/login
async function login(req, res) {
  const email = texto(req.body.email).toLowerCase();
  const senha = typeof req.body.senha === 'string' ? req.body.senha : '';

  if (!email || !senha) {
    return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  }

  try {
    const [linhas] = await pool.query(
      `SELECT u.id, u.nome, u.email, u.senha_hash, u.nivel, i.status_aprovacao
         FROM usuarios u
         LEFT JOIN instituicoes i ON i.usuario_id = u.id
        WHERE u.email = ?`,
      [email]
    );
    const usuario = linhas[0];

    // Mesma mensagem para "e-mail inexistente" e "senha errada" (nao revela qual falhou).
    const senhaCorreta = await bcrypt.compare(senha, usuario ? usuario.senha_hash : HASH_FALSO);
    if (!usuario || !senhaCorreta) {
      return res.status(401).json({ erro: 'E-mail ou senha invalidos.' });
    }

    const resposta = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      nivel: usuario.nivel,
    };
    if (usuario.nivel === 'instituicao') {
      resposta.status_aprovacao = usuario.status_aprovacao;
    }

    return res.json({ token: gerarToken(usuario), usuario: resposta });
  } catch (erro) {
    console.error('Erro no login:', erro);
    return res.status(500).json({ erro: 'Erro interno ao realizar o login.' });
  }
}

// GET /auth/me  (rota protegida: devolve o usuario dono do token)
async function perfil(req, res) {
  try {
    const [linhas] = await pool.query(
      `SELECT u.id, u.nome, u.email, u.nivel, u.criado_em,
              i.id AS instituicao_id, i.nome AS nome_instituicao, i.status_aprovacao
         FROM usuarios u
         LEFT JOIN instituicoes i ON i.usuario_id = u.id
        WHERE u.id = ?`,
      [req.usuario.id]
    );
    if (linhas.length === 0) {
      return res.status(404).json({ erro: 'Usuario nao encontrado.' });
    }
    return res.json(linhas[0]);
  } catch (erro) {
    console.error('Erro ao buscar perfil:', erro);
    return res.status(500).json({ erro: 'Erro interno ao buscar o perfil.' });
  }
}

module.exports = { cadastrar, login, perfil };
