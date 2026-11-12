const pool = require('../database/conexao');
const { expirarVencidas, obterInstituicao } = require('../database/rotinas');

function idValido(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------- GET /reservas ----------
// instituição: as suas | doador: reservas das suas doações | admin: todas
async function listar(req, res) {
  try {
    const { id, nivel } = req.usuario;
    let where = '';
    const params = [];

    if (nivel === 'instituicao') {
      const instituicao = await obterInstituicao(id);
      if (!instituicao) return res.json([]);
      where = 'WHERE r.instituicao_id = ?';
      params.push(instituicao.id);
    } else if (nivel === 'doador') {
      where = 'WHERE d.doador_id = ?';
      params.push(id);
    }

    const [linhas] = await pool.query(
      `SELECT r.id, r.doacao_id, r.status, r.reservada_em, r.retirada_em,
              d.titulo, d.quantidade, d.unidade, d.validade, d.retirada_ate,
              c.nome AS categoria_nome,
              doador.nome AS doador_nome,
              i.nome AS instituicao_nome, i.endereco AS instituicao_endereco,
              i.cidade AS instituicao_cidade
         FROM reservas r
         JOIN doacoes d          ON d.id = r.doacao_id
         JOIN categorias c       ON c.id = d.categoria_id
         JOIN usuarios doador    ON doador.id = d.doador_id
         JOIN instituicoes i     ON i.id = r.instituicao_id
         ${where}
        ORDER BY r.id DESC`,
      params
    );
    return res.json(linhas);
  } catch (erro) {
    console.error('Erro ao listar reservas:', erro);
    return res.status(500).json({ erro: 'Erro interno ao listar reservas.' });
  }
}

// ---------- POST /reservas  body: { doacao_id } ----------
// Só instituição APROVADA reserva, e só doação disponível e dentro da validade.
async function criar(req, res) {
  const doacaoId = idValido(req.body.doacao_id);
  if (!doacaoId) return res.status(400).json({ erro: 'Informe o doacao_id.' });

  let conexao;
  try {
    // A aprovação é conferida no banco (não no token), pois pode mudar depois do login.
    const instituicao = await obterInstituicao(req.usuario.id);
    if (!instituicao) {
      return res.status(403).json({ erro: 'Apenas instituições podem reservar doações.' });
    }
    if (instituicao.status_aprovacao !== 'aprovada') {
      return res.status(403).json({
        erro:
          instituicao.status_aprovacao === 'pendente'
            ? 'Sua instituição ainda aguarda aprovação de um administrador.'
            : 'O cadastro da sua instituição foi recusado.',
      });
    }

    conexao = await pool.getConnection();
    await conexao.beginTransaction();
    await expirarVencidas(conexao);

    // FOR UPDATE trava a linha: duas instituições não reservam o mesmo lote ao mesmo tempo.
    const [linhas] = await conexao.query('SELECT id, status FROM doacoes WHERE id = ? FOR UPDATE', [doacaoId]);
    const doacao = linhas[0];
    if (!doacao) {
      await conexao.rollback();
      return res.status(404).json({ erro: 'Doação não encontrada.' });
    }
    if (doacao.status !== 'disponivel') {
      await conexao.rollback();
      const motivos = {
        reservada: 'Esta doação já foi reservada por outra instituição.',
        retirada: 'Esta doação já foi retirada.',
        expirada: 'Esta doação está vencida e não pode mais ser reservada.',
        cancelada: 'Esta doação foi cancelada.',
      };
      return res.status(409).json({ erro: motivos[doacao.status] || 'Doação indisponível.' });
    }

    const [resultado] = await conexao.query(
      'INSERT INTO reservas (doacao_id, instituicao_id) VALUES (?, ?)',
      [doacaoId, instituicao.id]
    );
    await conexao.query("UPDATE doacoes SET status = 'reservada' WHERE id = ?", [doacaoId]);
    await conexao.commit();

    return res.status(201).json({ mensagem: 'Doação reservada com sucesso.', id: resultado.insertId });
  } catch (erro) {
    if (conexao) await conexao.rollback();
    if (erro.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ erro: 'Esta doação já possui uma reserva ativa.' });
    }
    console.error('Erro ao reservar:', erro);
    return res.status(500).json({ erro: 'Erro interno ao reservar a doação.' });
  } finally {
    if (conexao) conexao.release();
  }
}

// Carrega a reserva (travando a linha) junto com o dono da doação.
async function carregarReserva(conexao, id) {
  const [linhas] = await conexao.query(
    `SELECT r.id, r.status, r.doacao_id, r.instituicao_id, d.doador_id
       FROM reservas r
       JOIN doacoes d ON d.id = r.doacao_id
      WHERE r.id = ? FOR UPDATE`,
    [id]
  );
  return linhas[0];
}

// ---------- PUT /reservas/:id/cancelar ----------
// A instituição dona (ou o admin) cancela; a doação volta a ficar disponível.
async function cancelar(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });

  let conexao;
  try {
    conexao = await pool.getConnection();
    await conexao.beginTransaction();

    const reserva = await carregarReserva(conexao, id);
    if (!reserva) {
      await conexao.rollback();
      return res.status(404).json({ erro: 'Reserva não encontrada.' });
    }
    if (req.usuario.nivel === 'instituicao') {
      const instituicao = await obterInstituicao(req.usuario.id, conexao);
      if (!instituicao || instituicao.id !== reserva.instituicao_id) {
        await conexao.rollback();
        return res.status(403).json({ erro: 'Você só pode cancelar as suas próprias reservas.' });
      }
    }
    if (reserva.status !== 'ativa') {
      await conexao.rollback();
      return res.status(409).json({ erro: 'Apenas reservas ativas podem ser canceladas.' });
    }

    await conexao.query("UPDATE reservas SET status = 'cancelada' WHERE id = ?", [id]);
    await conexao.query("UPDATE doacoes SET status = 'disponivel' WHERE id = ?", [reserva.doacao_id]);
    await expirarVencidas(conexao); // se já venceu enquanto estava reservada, vira 'expirada'
    await conexao.commit();

    return res.json({ mensagem: 'Reserva cancelada. A doação voltou a ficar disponível.' });
  } catch (erro) {
    if (conexao) await conexao.rollback();
    console.error('Erro ao cancelar reserva:', erro);
    return res.status(500).json({ erro: 'Erro interno ao cancelar a reserva.' });
  } finally {
    if (conexao) conexao.release();
  }
}

// ---------- PUT /reservas/:id/retirada ----------
// O doador dono da doação (ou o admin) confirma que a instituição retirou o alimento.
async function confirmarRetirada(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });

  let conexao;
  try {
    conexao = await pool.getConnection();
    await conexao.beginTransaction();

    const reserva = await carregarReserva(conexao, id);
    if (!reserva) {
      await conexao.rollback();
      return res.status(404).json({ erro: 'Reserva não encontrada.' });
    }
    if (req.usuario.nivel === 'doador' && reserva.doador_id !== req.usuario.id) {
      await conexao.rollback();
      return res.status(403).json({ erro: 'Você só pode confirmar a retirada das suas doações.' });
    }
    if (reserva.status !== 'ativa') {
      await conexao.rollback();
      return res.status(409).json({ erro: 'Apenas reservas ativas podem ter a retirada confirmada.' });
    }

    await conexao.query("UPDATE reservas SET status = 'retirada', retirada_em = NOW() WHERE id = ?", [id]);
    await conexao.query("UPDATE doacoes SET status = 'retirada' WHERE id = ?", [reserva.doacao_id]);
    await conexao.commit();

    return res.json({ mensagem: 'Retirada confirmada. Obrigado por doar!' });
  } catch (erro) {
    if (conexao) await conexao.rollback();
    console.error('Erro ao confirmar retirada:', erro);
    return res.status(500).json({ erro: 'Erro interno ao confirmar a retirada.' });
  } finally {
    if (conexao) conexao.release();
  }
}

module.exports = { listar, criar, cancelar, confirmarRetirada };
