const pool = require('../database/conexao');
const { expirarVencidas, obterInstituicao } = require('../database/rotinas');

// Lista os últimos 6 meses ('AAAA-MM'), do mais antigo ao atual.
function ultimosMeses(quantidade = 6) {
  const meses = [];
  const hoje = new Date();
  for (let i = quantidade - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return meses;
}

// Completa com zero os meses sem registros (para o gráfico não ter "buracos").
function completarMeses(linhas) {
  const porMes = new Map(linhas.map((l) => [l.mes, l]));
  return ultimosMeses().map((mes) => ({
    mes,
    total: Number((porMes.get(mes) || {}).total || 0),
    retiradas: Number((porMes.get(mes) || {}).retiradas || 0),
  }));
}

function contarPor(linhas, chave, valoresIniciais) {
  const resumo = { ...valoresIniciais };
  linhas.forEach((l) => {
    resumo[l[chave]] = Number(l.n);
  });
  return resumo;
}

function formatarUnidades(linhas) {
  return linhas.map((u) => ({ unidade: u.unidade, quantidade: Number(u.quantidade) }));
}

function formatarCategorias(linhas) {
  return linhas.map((c) => ({
    categoria: c.categoria,
    total: Number(c.total),
    retiradas: Number(c.retiradas),
  }));
}

// Admin: todas as doações | Doador: apenas as suas.
async function indicadoresDeDoacoes(doadorId) {
  const filtro = doadorId ? 'WHERE d.doador_id = ?' : '';
  const e = doadorId ? 'AND d.doador_id = ?' : '';
  const params = doadorId ? [doadorId] : [];

  const [status] = await pool.query(
    `SELECT d.status, COUNT(*) AS n FROM doacoes d ${filtro} GROUP BY d.status`,
    params
  );
  const [unidades] = await pool.query(
    `SELECT d.unidade, SUM(d.quantidade) AS quantidade
       FROM doacoes d WHERE d.status = 'retirada' ${e}
      GROUP BY d.unidade ORDER BY d.unidade`,
    params
  );
  const [categorias] = await pool.query(
    `SELECT c.nome AS categoria, COUNT(*) AS total, SUM(d.status = 'retirada') AS retiradas
       FROM doacoes d JOIN categorias c ON c.id = d.categoria_id ${filtro}
      GROUP BY c.id, c.nome ORDER BY total DESC, c.nome`,
    params
  );
  const [meses] = await pool.query(
    `SELECT DATE_FORMAT(d.criado_em, '%Y-%m') AS mes, COUNT(*) AS total,
            SUM(d.status = 'retirada') AS retiradas
       FROM doacoes d
      WHERE d.criado_em >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH) ${e}
      GROUP BY mes ORDER BY mes`,
    params
  );

  const resumo = contarPor(status, 'status', {
    total: 0, disponivel: 0, reservada: 0, retirada: 0, expirada: 0, cancelada: 0,
  });
  resumo.total = status.reduce((soma, l) => soma + Number(l.n), 0);

  // Aproveitamento: das doações que "terminaram" (retiradas ou vencidas), quantas foram aproveitadas.
  const encerradas = resumo.retirada + resumo.expirada;
  const aproveitamento = encerradas > 0 ? Math.round((resumo.retirada / encerradas) * 1000) / 10 : null;

  return {
    escopo: doadorId ? 'doador' : 'geral',
    resumo,
    aproveitamento,
    retirado_por_unidade: formatarUnidades(unidades),
    por_categoria: formatarCategorias(categorias),
    por_mes: completarMeses(meses),
  };
}

// Instituição: apenas as suas reservas.
async function indicadoresDaInstituicao(usuarioId) {
  const instituicao = await obterInstituicao(usuarioId);
  const id = instituicao ? instituicao.id : 0;

  const [status] = await pool.query(
    'SELECT status, COUNT(*) AS n FROM reservas WHERE instituicao_id = ? GROUP BY status',
    [id]
  );
  const [unidades] = await pool.query(
    `SELECT d.unidade, SUM(d.quantidade) AS quantidade
       FROM reservas r JOIN doacoes d ON d.id = r.doacao_id
      WHERE r.instituicao_id = ? AND r.status = 'retirada'
      GROUP BY d.unidade ORDER BY d.unidade`,
    [id]
  );
  const [categorias] = await pool.query(
    `SELECT c.nome AS categoria, COUNT(*) AS total, SUM(r.status = 'retirada') AS retiradas
       FROM reservas r JOIN doacoes d ON d.id = r.doacao_id
       JOIN categorias c ON c.id = d.categoria_id
      WHERE r.instituicao_id = ?
      GROUP BY c.id, c.nome ORDER BY total DESC, c.nome`,
    [id]
  );
  const [meses] = await pool.query(
    `SELECT DATE_FORMAT(r.reservada_em, '%Y-%m') AS mes, COUNT(*) AS total,
            SUM(r.status = 'retirada') AS retiradas
       FROM reservas r
      WHERE r.instituicao_id = ?
        AND r.reservada_em >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
      GROUP BY mes ORDER BY mes`,
    [id]
  );

  const resumo = contarPor(status, 'status', { total: 0, ativa: 0, retirada: 0, cancelada: 0 });
  resumo.total = status.reduce((soma, l) => soma + Number(l.n), 0);

  return {
    escopo: 'instituicao',
    resumo,
    aproveitamento: null,
    retirado_por_unidade: formatarUnidades(unidades),
    por_categoria: formatarCategorias(categorias),
    por_mes: completarMeses(meses),
  };
}

// GET /indicadores  (os dados dependem do perfil de quem pede)
async function obter(req, res) {
  try {
    await expirarVencidas();
    const { id, nivel } = req.usuario;

    if (nivel === 'instituicao') {
      return res.json(await indicadoresDaInstituicao(id));
    }

    const dados = await indicadoresDeDoacoes(nivel === 'doador' ? id : null);
    if (nivel === 'admin') {
      const [usuarios] = await pool.query('SELECT nivel AS chave, COUNT(*) AS n FROM usuarios GROUP BY nivel');
      const [instituicoes] = await pool.query(
        'SELECT status_aprovacao AS chave, COUNT(*) AS n FROM instituicoes GROUP BY status_aprovacao'
      );
      dados.usuarios = contarPor(usuarios, 'chave', { admin: 0, doador: 0, instituicao: 0 });
      dados.instituicoes = contarPor(instituicoes, 'chave', { pendente: 0, aprovada: 0, recusada: 0 });
    }
    return res.json(dados);
  } catch (erro) {
    console.error('Erro ao calcular indicadores:', erro);
    return res.status(500).json({ erro: 'Erro interno ao calcular os indicadores.' });
  }
}

module.exports = { obter };
