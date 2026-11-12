const pool = require('../database/conexao');
const { expirarVencidas, obterInstituicao } = require('../database/rotinas');

const UNIDADES = ['kg', 'g', 'L', 'ml', 'un', 'porcoes', 'caixas'];
const STATUS_DOACAO = ['disponivel', 'reservada', 'retirada', 'cancelada', 'expirada'];

const SELECT_DOACAO = `
  SELECT d.id, d.doador_id, u.nome AS doador_nome,
         d.categoria_id, c.nome AS categoria_nome,
         d.titulo, d.descricao, d.quantidade, d.unidade,
         d.validade, d.retirada_ate, d.status, d.criado_em,
         r.id AS reserva_id, i.nome AS reserva_instituicao
    FROM doacoes d
    JOIN usuarios u   ON u.id = d.doador_id
    JOIN categorias c ON c.id = d.categoria_id
    LEFT JOIN reservas r     ON r.doacao_id = d.id AND r.status = 'ativa'
    LEFT JOIN instituicoes i ON i.id = r.instituicao_id`;

// ---------- utilitários de validação ----------
function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dataValida(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return false;
  const [, a, mes, dia] = m.map(Number);
  const d = new Date(a, mes - 1, dia);
  return d.getFullYear() === a && d.getMonth() === mes - 1 && d.getDate() === dia;
}

// Aceita 'AAAA-MM-DDTHH:mm' (input datetime-local) ou 'AAAA-MM-DD HH:mm[:ss]'.
function interpretarDataHora(str) {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(str);
  if (!m || !dataValida(m[1])) return null;
  const hora = Number(m[2]);
  const minuto = Number(m[3]);
  if (hora > 23 || minuto > 59) return null;
  const [a, mes, dia] = m[1].split('-').map(Number);
  return {
    data: m[1],
    sql: `${m[1]} ${m[2]}:${m[3]}:00`,
    objeto: new Date(a, mes - 1, dia, hora, minuto),
  };
}

// Valida o corpo de POST/PUT e devolve { erro } ou { dados }.
async function validarDoacao(corpo) {
  const titulo = texto(corpo.titulo);
  const descricao = texto(corpo.descricao);
  const unidade = texto(corpo.unidade);
  const validade = texto(corpo.validade);
  const quantidade = Number(corpo.quantidade);
  const categoriaId = Number(corpo.categoria_id);

  if (titulo.length < 3 || titulo.length > 150) {
    return { erro: 'O título deve ter entre 3 e 150 caracteres.' };
  }
  if (descricao.length > 1000) {
    return { erro: 'A descrição deve ter no máximo 1000 caracteres.' };
  }
  if (!Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 100000) {
    return { erro: 'A quantidade deve ser um número maior que zero.' };
  }
  if (!UNIDADES.includes(unidade)) {
    return { erro: `Unidade inválida. Use: ${UNIDADES.join(', ')}.` };
  }
  if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
    return { erro: 'Selecione uma categoria.' };
  }
  const [categoria] = await pool.query('SELECT id FROM categorias WHERE id = ?', [categoriaId]);
  if (categoria.length === 0) {
    return { erro: 'Categoria inexistente.' };
  }
  if (!dataValida(validade)) {
    return { erro: 'Informe uma validade válida (AAAA-MM-DD).' };
  }
  if (validade < hojeLocal()) {
    return { erro: 'Não é possível publicar uma doação com validade já vencida.' };
  }
  const retirada = interpretarDataHora(texto(corpo.retirada_ate));
  if (!retirada) {
    return { erro: 'Informe um prazo de retirada válido (AAAA-MM-DDTHH:mm).' };
  }
  if (retirada.objeto <= new Date()) {
    return { erro: 'O prazo de retirada deve estar no futuro.' };
  }
  if (retirada.data > validade) {
    return { erro: 'O prazo de retirada não pode ser posterior à validade do alimento.' };
  }

  return {
    dados: {
      titulo,
      descricao: descricao || null,
      categoriaId,
      quantidade: Math.round(quantidade * 100) / 100,
      unidade,
      validade,
      retiradaAte: retirada.sql,
    },
  };
}

function idValido(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------- GET /doacoes ----------
// doador: só as suas | instituição: só as disponíveis | admin: todas
async function listar(req, res) {
  try {
    await expirarVencidas();
    const { id, nivel } = req.usuario;
    const filtros = [];
    const params = [];

    if (nivel === 'doador') {
      filtros.push('d.doador_id = ?');
      params.push(id);
    }
    if (nivel === 'instituicao') {
      filtros.push("d.status = 'disponivel'");
    } else if (req.query.status) {
      if (!STATUS_DOACAO.includes(req.query.status)) {
        return res.status(400).json({ erro: 'Status inválido.' });
      }
      filtros.push('d.status = ?');
      params.push(req.query.status);
    }
    if (req.query.categoria_id) {
      const categoriaId = idValido(req.query.categoria_id);
      if (!categoriaId) return res.status(400).json({ erro: 'Categoria inválida.' });
      filtros.push('d.categoria_id = ?');
      params.push(categoriaId);
    }
    if (req.query.validade_ate) {
      if (!dataValida(req.query.validade_ate)) {
        return res.status(400).json({ erro: 'Data inválida em validade_ate (AAAA-MM-DD).' });
      }
      filtros.push('d.validade <= ?');
      params.push(req.query.validade_ate);
    }

    const where = filtros.length ? ` WHERE ${filtros.join(' AND ')}` : '';
    const [linhas] = await pool.query(
      `${SELECT_DOACAO}${where} ORDER BY d.validade ASC, d.id DESC`,
      params
    );
    return res.json(linhas);
  } catch (erro) {
    console.error('Erro ao listar doações:', erro);
    return res.status(500).json({ erro: 'Erro interno ao listar doações.' });
  }
}

// ---------- GET /doacoes/:id ----------
async function buscarPorId(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });

  try {
    await expirarVencidas();
    const [linhas] = await pool.query(`${SELECT_DOACAO} WHERE d.id = ?`, [id]);
    const doacao = linhas[0];
    if (!doacao) return res.status(404).json({ erro: 'Doação não encontrada.' });

    const { id: usuarioId, nivel } = req.usuario;
    let permitido = nivel === 'admin';
    if (nivel === 'doador') permitido = doacao.doador_id === usuarioId;
    if (nivel === 'instituicao') {
      const instituicao = await obterInstituicao(usuarioId);
      const [minhas] = instituicao
        ? await pool.query(
            'SELECT id FROM reservas WHERE doacao_id = ? AND instituicao_id = ? LIMIT 1',
            [id, instituicao.id]
          )
        : [[]];
      permitido = doacao.status === 'disponivel' || minhas.length > 0;
    }
    if (!permitido) {
      return res.status(403).json({ erro: 'Você não tem permissão para ver esta doação.' });
    }
    return res.json(doacao);
  } catch (erro) {
    console.error('Erro ao buscar doação:', erro);
    return res.status(500).json({ erro: 'Erro interno ao buscar a doação.' });
  }
}

// ---------- POST /doacoes ----------
async function criar(req, res) {
  try {
    const { erro, dados } = await validarDoacao(req.body);
    if (erro) return res.status(400).json({ erro });

    const [resultado] = await pool.query(
      `INSERT INTO doacoes
         (doador_id, categoria_id, titulo, descricao, quantidade, unidade, validade, retirada_ate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.usuario.id,
        dados.categoriaId,
        dados.titulo,
        dados.descricao,
        dados.quantidade,
        dados.unidade,
        dados.validade,
        dados.retiradaAte,
      ]
    );
    return res.status(201).json({ mensagem: 'Doação publicada com sucesso.', id: resultado.insertId });
  } catch (erro) {
    console.error('Erro ao criar doação:', erro);
    return res.status(500).json({ erro: 'Erro interno ao criar a doação.' });
  }
}

// Carrega a doação e confere se o usuário pode alterá-la (dono ou admin).
async function carregarParaAlterar(req, res) {
  const id = idValido(req.params.id);
  if (!id) {
    res.status(400).json({ erro: 'ID inválido.' });
    return null;
  }
  await expirarVencidas();
  const [linhas] = await pool.query('SELECT id, doador_id, status FROM doacoes WHERE id = ?', [id]);
  const doacao = linhas[0];
  if (!doacao) {
    res.status(404).json({ erro: 'Doação não encontrada.' });
    return null;
  }
  if (req.usuario.nivel !== 'admin' && doacao.doador_id !== req.usuario.id) {
    res.status(403).json({ erro: 'Você só pode alterar as suas próprias doações.' });
    return null;
  }
  return doacao;
}

// ---------- PUT /doacoes/:id ----------
// Só doações disponíveis ou expiradas podem ser editadas. Editar uma expirada com
// datas novas e válidas a republica (volta para 'disponivel').
async function atualizar(req, res) {
  try {
    const doacao = await carregarParaAlterar(req, res);
    if (!doacao) return;

    if (!['disponivel', 'expirada'].includes(doacao.status)) {
      return res.status(409).json({
        erro:
          doacao.status === 'reservada'
            ? 'Doação reservada não pode ser editada. Cancele a reserva primeiro.'
            : 'Doação já retirada não pode mais ser alterada.',
      });
    }

    const { erro, dados } = await validarDoacao(req.body);
    if (erro) return res.status(400).json({ erro });

    await pool.query(
      `UPDATE doacoes
          SET categoria_id = ?, titulo = ?, descricao = ?, quantidade = ?,
              unidade = ?, validade = ?, retirada_ate = ?, status = 'disponivel'
        WHERE id = ?`,
      [
        dados.categoriaId,
        dados.titulo,
        dados.descricao,
        dados.quantidade,
        dados.unidade,
        dados.validade,
        dados.retiradaAte,
        doacao.id,
      ]
    );
    return res.json({ mensagem: 'Doação atualizada com sucesso.' });
  } catch (erro) {
    console.error('Erro ao atualizar doação:', erro);
    return res.status(500).json({ erro: 'Erro interno ao atualizar a doação.' });
  }
}

// ---------- DELETE /doacoes/:id ----------
// Não exclui doação reservada (tem instituição esperando) nem retirada (histórico).
async function remover(req, res) {
  let conexao;
  try {
    const doacao = await carregarParaAlterar(req, res);
    if (!doacao) return;

    if (doacao.status === 'reservada') {
      return res.status(409).json({ erro: 'Doação reservada não pode ser excluída. Cancele a reserva primeiro.' });
    }
    if (doacao.status === 'retirada') {
      return res.status(409).json({ erro: 'Doação já retirada não pode ser excluída (histórico preservado).' });
    }

    conexao = await pool.getConnection();
    await conexao.beginTransaction();
    // Se havia reservas antigas (todas canceladas), apaga junto para não violar a chave estrangeira.
    await conexao.query('DELETE FROM reservas WHERE doacao_id = ?', [doacao.id]);
    await conexao.query('DELETE FROM doacoes WHERE id = ?', [doacao.id]);
    await conexao.commit();
    return res.json({ mensagem: 'Doação excluída com sucesso.' });
  } catch (erro) {
    if (conexao) await conexao.rollback();
    console.error('Erro ao excluir doação:', erro);
    return res.status(500).json({ erro: 'Erro interno ao excluir a doação.' });
  } finally {
    if (conexao) conexao.release();
  }
}

module.exports = { listar, buscarPorId, criar, atualizar, remover };
