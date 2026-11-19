// =====================================================================
// Testes automatizados da API (Node.js 18+, sem dependências extras).
//
// Como usar:
//   1) com o MySQL ligado e a API rodando (npm start), em OUTRO terminal:
//   2) npm test
//
// Os testes criam usuários e doações com prefixo "teste." e apagam tudo no final.
// Variáveis lidas do .env: PORT, DB_*, ADMIN_EMAIL, ADMIN_SENHA (a API_URL é opcional).
// =====================================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const pool = require('../database/conexao');

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
const TAG = Date.now().toString(36);
const EMAIL = (nome) => `teste.${TAG}.${nome}@ponte.test`;
const SENHA = 'senha12345';

let ok = 0;
let falhas = 0;

function check(nome, condicao, detalhe = '') {
  if (condicao) {
    ok++;
    console.log(`  [OK]     ${nome}`);
  } else {
    falhas++;
    console.log(`  [FALHOU] ${nome} ${detalhe}`);
  }
}

function secao(titulo) {
  console.log(`\n== ${titulo}`);
}

async function req(metodo, caminho, token, corpo, extras = {}) {
  const cabecalhos = { ...(extras.headers || {}) };
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
  if (token) cabecalhos.Authorization = `Bearer ${token}`;
  const resposta = await fetch(BASE + caminho, {
    method: metodo,
    headers: cabecalhos,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  let dados = null;
  try {
    dados = await resposta.clone().json();
  } catch {
    /* sem JSON */
  }
  return { s: resposta.status, d: dados, r: resposta };
}

const pad = (n) => String(n).padStart(2, '0');
function dia(delta) {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function limparDadosDeTeste() {
  const padrao = `teste.${TAG}.%@ponte.test`;
  await pool.query(
    `DELETE r FROM reservas r JOIN instituicoes i ON i.id = r.instituicao_id
       JOIN usuarios u ON u.id = i.usuario_id WHERE u.email LIKE ?`, [padrao]);
  await pool.query(
    `DELETE r FROM reservas r JOIN doacoes d ON d.id = r.doacao_id
       JOIN usuarios u ON u.id = d.doador_id WHERE u.email LIKE ?`, [padrao]);
  await pool.query(
    'DELETE d FROM doacoes d JOIN usuarios u ON u.id = d.doador_id WHERE u.email LIKE ?', [padrao]);
  await pool.query('DELETE FROM usuarios WHERE email LIKE ?', [padrao]);
  await pool.query('DELETE FROM categorias WHERE nome LIKE ?', [`Teste ${TAG}%`]);
}

async function executar() {
  // ---------------------------------------------------------------
  secao('Conexão com a API e o banco');
  let saude;
  try {
    saude = await req('GET', '/api/saude');
  } catch {
    console.log(`\nNão foi possível acessar ${BASE}. Inicie a API (npm start) em outro terminal e tente de novo.`);
    process.exit(1);
  }
  check('GET /api/saude responde 200 com o banco conectado', saude.s === 200 && saude.d.banco === 'conectado');
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_SENHA) {
    console.log('\nDefina ADMIN_EMAIL e ADMIN_SENHA no .env (e rode npm run seed) para executar os testes.');
    process.exit(1);
  }

  // ---------------------------------------------------------------
  secao('Cadastro e login');
  const cad = (corpo) => req('POST', '/auth/cadastro', null, corpo);
  const doadorA = await cad({ nome: 'Padaria A', email: EMAIL('a'), senha: SENHA, nivel: 'doador' });
  check('cadastro de doador (201)', doadorA.s === 201, JSON.stringify(doadorA.d));
  await cad({ nome: 'Mercado B', email: EMAIL('b'), senha: SENHA, nivel: 'doador' });
  const dadosInst = (n) => ({
    nome: `Resp ${n}`, email: EMAIL(`i${n}`), senha: SENHA, nivel: 'instituicao',
    nome_instituicao: `Abrigo ${n} ${TAG}`, endereco: `Rua ${n}`, cidade: 'Santa Cruz do Sul',
  });
  check('cadastro de instituição (201)', (await cad(dadosInst(1))).s === 201);
  await cad(dadosInst(2));

  check('cadastro com perfil admin é recusado (400)',
    (await cad({ nome: 'Intruso', email: EMAIL('x'), senha: SENHA, nivel: 'admin' })).s === 400);
  check('e-mail repetido (409)', (await cad({ nome: 'Padaria A', email: EMAIL('a').toUpperCase(), senha: SENHA, nivel: 'doador' })).s === 409);
  check('senha curta (400)', (await cad({ nome: 'Fulano', email: EMAIL('s'), senha: '123', nivel: 'doador' })).s === 400);
  check('e-mail inválido (400)', (await cad({ nome: 'Fulano', email: 'sem-arroba', senha: SENHA, nivel: 'doador' })).s === 400);
  check('instituição sem dados da instituição (400)',
    (await cad({ nome: 'Maria', email: EMAIL('m'), senha: SENHA, nivel: 'instituicao' })).s === 400);
  const [orfaos] = await pool.query('SELECT COUNT(*) AS n FROM usuarios WHERE email = ?', [EMAIL('m')]);
  check('cadastro inválido não deixa usuário gravado', orfaos[0].n === 0);

  const login = async (email, senha = SENHA) => req('POST', '/auth/login', null, { email, senha });
  const lA = await login(EMAIL('a'));
  const lB = await login(EMAIL('b'));
  const lI1 = await login(EMAIL('i1'));
  const lI2 = await login(EMAIL('i2'));
  const lAdmin = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_SENHA);
  const TA = lA.d.token, TB = lB.d.token, TI1 = lI1.d.token, TI2 = lI2.d.token, TAD = lAdmin.d.token;
  check('login devolve token e perfil', !!TA && lA.d.usuario.nivel === 'doador' && lAdmin.d.usuario.nivel === 'admin');
  check('login de instituição informa o status de aprovação', lI1.d.usuario.status_aprovacao === 'pendente');
  const senhaErrada = await login(EMAIL('a'), 'errada12345');
  const emailInexistente = await login('nao.existe@ponte.test', 'qualquer12345');
  check('senha errada (401)', senhaErrada.s === 401);
  check('e-mail inexistente (401) com a mesma mensagem', emailInexistente.s === 401 && emailInexistente.d.erro === senhaErrada.d.erro);
  check('/auth/me com token (200)', (await req('GET', '/auth/me', TA)).s === 200);
  check('/auth/me sem token (401)', (await req('GET', '/auth/me')).s === 401);
  check('token inválido (401)', (await req('GET', '/auth/me', 'abc.def.ghi')).s === 401);
  const [[hash]] = await pool.query('SELECT senha_hash FROM usuarios WHERE email = ?', [EMAIL('a')]);
  check('senha guardada como hash bcrypt', /^\$2[aby]\$/.test(hash.senha_hash) && hash.senha_hash !== SENHA);

  secao('Limite de tentativas de login');
  const alvo = EMAIL('bloqueio');
  let ultimo;
  for (let i = 0; i < 10; i++) ultimo = await login(alvo, 'errada12345');
  check('10 falhas seguidas continuam respondendo 401', ultimo.s === 401);
  const bloqueado = await login(alvo, 'errada12345');
  check('11ª tentativa é bloqueada (429)', bloqueado.s === 429 && !!bloqueado.r.headers.get('retry-after'));

  // ---------------------------------------------------------------
  secao('Controle de acesso por perfil');
  check('doador não acessa /usuarios (403)', (await req('GET', '/usuarios', TA)).s === 403);
  check('instituição não acessa /usuarios (403)', (await req('GET', '/usuarios', TI1)).s === 403);
  check('admin acessa /usuarios (200)', (await req('GET', '/usuarios', TAD)).s === 200);
  check('sem token não acessa /doacoes (401)', (await req('GET', '/doacoes')).s === 401);
  check('doador não aprova instituição (403)', (await req('PUT', '/instituicoes/1/aprovacao', TA, { status: 'aprovada' })).s === 403);

  // ---------------------------------------------------------------
  secao('Doações: validações e CRUD');
  const cats = (await req('GET', '/categorias', TA)).d;
  check('categorias carregadas', Array.isArray(cats) && cats.length > 0);
  const CAT = cats[0].id;
  const valida = {
    titulo: 'Pães do dia', categoria_id: CAT, quantidade: 10, unidade: 'kg',
    validade: dia(3), retirada_ate: `${dia(2)}T18:00`, descricao: "Pães frescos ' \"teste\"",
  };
  const criada = await req('POST', '/doacoes', TA, valida);
  check('doador publica doação (201)', criada.s === 201, JSON.stringify(criada.d));
  const D1 = criada.d.id;
  const rejeita = async (nome, mudanca) =>
    check(`${nome} (400)`, (await req('POST', '/doacoes', TA, { ...valida, ...mudanca })).s === 400);
  await rejeita('validade vencida é recusada', { validade: dia(-1) });
  await rejeita('quantidade zero é recusada', { quantidade: 0 });
  await rejeita('quantidade negativa é recusada', { quantidade: -5 });
  await rejeita('quantidade não numérica é recusada', { quantidade: 'abc' });
  await rejeita('categoria inexistente é recusada', { categoria_id: 99999999 });
  await rejeita('unidade inválida é recusada', { unidade: 'xx' });
  await rejeita('título curto é recusado', { titulo: 'ab' });
  await rejeita('retirada no passado é recusada', { retirada_ate: `${dia(-1)}T10:00` });
  await rejeita('retirada depois da validade é recusada', { retirada_ate: `${dia(4)}T10:00` });
  await rejeita('data impossível (31/02) é recusada', { validade: '2030-02-31' });
  check('instituição não publica doação (403)', (await req('POST', '/doacoes', TI1, valida)).s === 403);

  let r = await req('GET', '/doacoes', TA);
  check('doador vê só as suas doações', r.s === 200 && r.d.length === 1 && r.d[0].id === D1);
  check('quantidade vem como número e validade como AAAA-MM-DD', typeof r.d[0].quantidade === 'number' && r.d[0].validade === dia(3));
  check('instituição vê doações disponíveis', (await req('GET', '/doacoes', TI1)).d.some((d) => d.id === D1));
  check('doador B não vê a doação de A', !(await req('GET', '/doacoes', TB)).d.some((d) => d.id === D1));
  check('filtro por categoria', (await req('GET', `/doacoes?categoria_id=${CAT}`, TA)).d.length === 1);
  check('filtro por validade_ate', (await req('GET', `/doacoes?validade_ate=${dia(1)}`, TA)).d.length === 0);
  check("status inválido é recusado (400) - sem injeção de SQL", (await req('GET', "/doacoes?status=x'%20OR%201=1", TA)).s === 400);
  check('GET /doacoes/:id do dono (200)', (await req('GET', `/doacoes/${D1}`, TA)).s === 200);
  check('GET /doacoes/:id de outro doador (403)', (await req('GET', `/doacoes/${D1}`, TB)).s === 403);
  check('doação inexistente (404)', (await req('GET', '/doacoes/99999999', TA)).s === 404);
  check('ID inválido (400)', (await req('GET', '/doacoes/abc', TA)).s === 400);

  check('outro doador não edita (403)', (await req('PUT', `/doacoes/${D1}`, TB, valida)).s === 403);
  check('instituição não edita (403)', (await req('PUT', `/doacoes/${D1}`, TI1, valida)).s === 403);
  check('dono edita (200)', (await req('PUT', `/doacoes/${D1}`, TA, { ...valida, titulo: 'Pães e bolos', quantidade: 12.5 })).s === 200);
  r = await req('GET', `/doacoes/${D1}`, TA);
  check('edição foi gravada', r.d.titulo === 'Pães e bolos' && r.d.quantidade === 12.5);
  check('edição com dado inválido (400)', (await req('PUT', `/doacoes/${D1}`, TA, { ...valida, quantidade: 0 })).s === 400);

  // ---------------------------------------------------------------
  secao('Reservas');
  const lista = (await req('GET', '/instituicoes', TAD)).d;
  const inst1 = lista.find((i) => i.email === EMAIL('i1')).id;
  const inst2 = lista.find((i) => i.email === EMAIL('i2')).id;
  check('instituição pendente não reserva (403)', (await req('POST', '/reservas', TI1, { doacao_id: D1 })).s === 403);
  check('doador não reserva (403)', (await req('POST', '/reservas', TA, { doacao_id: D1 })).s === 403);
  check('admin aprova a instituição 1', (await req('PUT', `/instituicoes/${inst1}/aprovacao`, TAD, { status: 'aprovada' })).s === 200);
  check('admin aprova a instituição 2', (await req('PUT', `/instituicoes/${inst2}/aprovacao`, TAD, { status: 'aprovada' })).s === 200);
  check('reserva sem doacao_id (400)', (await req('POST', '/reservas', TI1, {})).s === 400);
  check('reserva de doação inexistente (404)', (await req('POST', '/reservas', TI1, { doacao_id: 99999999 })).s === 404);
  r = await req('POST', '/reservas', TI1, { doacao_id: D1 });
  check('instituição aprovada reserva (201)', r.s === 201, JSON.stringify(r.d));
  const R1 = r.d.id;
  check('doação passa para "reservada"', (await req('GET', `/doacoes/${D1}`, TA)).d.status === 'reservada');
  check('segunda instituição não reserva o mesmo lote (409)', (await req('POST', '/reservas', TI2, { doacao_id: D1 })).s === 409);
  check('doação reservada não é editada (409)', (await req('PUT', `/doacoes/${D1}`, TA, valida)).s === 409);
  check('doação reservada não é excluída (409)', (await req('DELETE', `/doacoes/${D1}`, TA)).s === 409);
  check('doador vê quem reservou', (await req('GET', `/doacoes/${D1}`, TA)).d.reserva_instituicao === `Abrigo 1 ${TAG}`);
  check('instituição 2 não vê doação reservada por outra (403)', (await req('GET', `/doacoes/${D1}`, TI2)).s === 403);
  check('cada instituição lista só as suas reservas', (await req('GET', '/reservas', TI1)).d.length === 1 && (await req('GET', '/reservas', TI2)).d.length === 0);
  check('doador lista reservas das suas doações', (await req('GET', '/reservas', TA)).d.length === 1);

  check('instituição 2 não cancela reserva da 1 (403)', (await req('PUT', `/reservas/${R1}/cancelar`, TI2)).s === 403);
  check('doador não cancela reserva (403)', (await req('PUT', `/reservas/${R1}/cancelar`, TA)).s === 403);
  check('doador B não confirma retirada de A (403)', (await req('PUT', `/reservas/${R1}/retirada`, TB)).s === 403);
  check('instituição não confirma retirada (403)', (await req('PUT', `/reservas/${R1}/retirada`, TI1)).s === 403);
  check('instituição 1 cancela a própria reserva (200)', (await req('PUT', `/reservas/${R1}/cancelar`, TI1)).s === 200);
  check('doação volta a "disponivel"', (await req('GET', `/doacoes/${D1}`, TA)).d.status === 'disponivel');
  check('cancelar de novo (409)', (await req('PUT', `/reservas/${R1}/cancelar`, TI1)).s === 409);
  r = await req('POST', '/reservas', TI2, { doacao_id: D1 });
  check('instituição 2 reserva depois do cancelamento (201)', r.s === 201);
  const R2 = r.d.id;
  check('doador dono confirma a retirada (200)', (await req('PUT', `/reservas/${R2}/retirada`, TA)).s === 200);
  check('doação passa para "retirada"', (await req('GET', `/doacoes/${D1}`, TA)).d.status === 'retirada');
  check('confirmar retirada de novo (409)', (await req('PUT', `/reservas/${R2}/retirada`, TA)).s === 409);
  check('doação retirada não é editada (409)', (await req('PUT', `/doacoes/${D1}`, TA, valida)).s === 409);
  check('doação retirada não é excluída (409)', (await req('DELETE', `/doacoes/${D1}`, TA)).s === 409);
  check('doação retirada não é reservada (409)', (await req('POST', '/reservas', TI1, { doacao_id: D1 })).s === 409);
  check('reserva retirada registra a data', !!(await req('GET', '/reservas', TI2)).d[0].retirada_em);

  secao('Exclusão com histórico de reserva cancelada');
  const D2 = (await req('POST', '/doacoes', TB, { ...valida, titulo: 'Frutas do B' })).d.id;
  const R3 = (await req('POST', '/reservas', TI1, { doacao_id: D2 })).d.id;
  await req('PUT', `/reservas/${R3}/cancelar`, TI1);
  check('outro doador não exclui (403)', (await req('DELETE', `/doacoes/${D2}`, TA)).s === 403);
  check('dono exclui doação que teve reserva cancelada (200)', (await req('DELETE', `/doacoes/${D2}`, TB)).s === 200);
  check('doação excluída some (404)', (await req('GET', `/doacoes/${D2}`, TB)).s === 404);

  secao('Expiração automática');
  const [ins] = await pool.query(
    `INSERT INTO doacoes (doador_id, categoria_id, titulo, quantidade, unidade, validade, retirada_ate)
     VALUES (?, ?, 'Vencida', 2, 'kg', ?, ?)`,
    [lA.d.usuario.id, CAT, dia(-1), `${dia(-1)} 10:00:00`]
  );
  const idVencida = ins.insertId;
  r = await req('GET', '/doacoes', TA);
  check('doação vencida vira "expirada"', (r.d.find((d) => d.id === idVencida) || {}).status === 'expirada');
  check('expirada não aparece para instituições', !(await req('GET', '/doacoes', TI1)).d.some((d) => d.id === idVencida));
  check('reservar doação expirada (409)', (await req('POST', '/reservas', TI1, { doacao_id: idVencida })).s === 409);
  check('editar com datas novas republica (200)', (await req('PUT', `/doacoes/${idVencida}`, TA, { ...valida, titulo: 'Republicada' })).s === 200);
  check('...e volta a "disponivel"', (await req('GET', `/doacoes/${idVencida}`, TA)).d.status === 'disponivel');
  check('doador exclui a republicada (200)', (await req('DELETE', `/doacoes/${idVencida}`, TA)).s === 200);

  // ---------------------------------------------------------------
  secao('Categorias');
  check('sem token não lista categorias (401)', (await req('GET', '/categorias')).s === 401);
  check('instituição não cria categoria (403)', (await req('POST', '/categorias', TI1, { nome: `Teste ${TAG} x` })).s === 403);
  check('doador não exclui categoria (403)', (await req('DELETE', `/categorias/${CAT}`, TA)).s === 403);
  r = await req('POST', '/categorias', TAD, { nome: `Teste ${TAG} Congelados` });
  check('admin cria categoria (201)', r.s === 201);
  const C = r.d.id;
  check('nome duplicado (409)', (await req('POST', '/categorias', TAD, { nome: `Teste ${TAG} Congelados` })).s === 409);
  check('nome vazio (400)', (await req('POST', '/categorias', TAD, { nome: ' ' })).s === 400);
  check('admin renomeia (200)', (await req('PUT', `/categorias/${C}`, TAD, { nome: `Teste ${TAG} Gelados` })).s === 200);
  check('admin exclui categoria sem uso (200)', (await req('DELETE', `/categorias/${C}`, TAD)).s === 200);
  check('categoria em uso não é excluída (409)', (await req('DELETE', `/categorias/${CAT}`, TAD)).s === 409);
  check('categoria inexistente (404)', (await req('DELETE', '/categorias/99999999', TAD)).s === 404);

  // ---------------------------------------------------------------
  secao('Gerenciamento de usuários (admin)');
  const idA = lA.d.usuario.id;
  const idAdmin = lAdmin.d.usuario.id;
  check('doador não edita usuário (403)', (await req('PUT', `/usuarios/${idA}`, TB, { nome: 'Hack', email: EMAIL('hack') })).s === 403);
  check('doador não exclui usuário (403)', (await req('DELETE', `/usuarios/${idA}`, TB)).s === 403);
  check('admin edita nome e e-mail (200)', (await req('PUT', `/usuarios/${idA}`, TAD, { nome: 'Padaria A Renomeada', email: EMAIL('a2') })).s === 200);
  check('alteração foi gravada', (await req('GET', `/usuarios/${idA}`, TAD)).d.nome === 'Padaria A Renomeada');
  check('e-mail já usado por outro (409)', (await req('PUT', `/usuarios/${idA}`, TAD, { nome: 'Padaria A', email: EMAIL('b') })).s === 409);
  check('e-mail inválido (400)', (await req('PUT', `/usuarios/${idA}`, TAD, { nome: 'Padaria A', email: 'x' })).s === 400);
  check('nova senha curta (400)', (await req('PUT', `/usuarios/${idA}`, TAD, { nome: 'Padaria A', email: EMAIL('a2'), senha: '123' })).s === 400);
  check('usuário inexistente (404)', (await req('PUT', '/usuarios/99999999', TAD, { nome: 'Fulano', email: EMAIL('z') })).s === 404);
  check('admin redefine a senha (200)', (await req('PUT', `/usuarios/${idA}`, TAD, { nome: 'Padaria A', email: EMAIL('a2'), senha: 'novaSenha123' })).s === 200);
  check('login com a senha antiga falha (401)', (await login(EMAIL('a2'), SENHA)).s === 401);
  check('login com a nova senha funciona (200)', (await login(EMAIL('a2'), 'novaSenha123')).s === 200);
  check('admin não exclui a própria conta (409)', (await req('DELETE', `/usuarios/${idAdmin}`, TAD)).s === 409);
  check('usuário com histórico não é excluído (409)', (await req('DELETE', `/usuarios/${idA}`, TAD)).s === 409);
  const descartavel = await cad({ nome: 'Descartável', email: EMAIL('descartavel'), senha: SENHA, nivel: 'doador' });
  const TDesc = (await login(EMAIL('descartavel'))).d.token;
  check('admin exclui usuário sem histórico (200)', (await req('DELETE', `/usuarios/${descartavel.d.usuario.id}`, TAD)).s === 200);
  check('usuário excluído some (404)', (await req('GET', `/usuarios/${descartavel.d.usuario.id}`, TAD)).s === 404);
  check('token de usuário excluído deixa de valer (401)', (await req('GET', '/doacoes', TDesc)).s === 401);

  // ---------------------------------------------------------------
  secao('Indicadores');
  const D3 = (await req('POST', '/doacoes', TA, { ...valida, titulo: 'Segunda doação' })).d.id;
  check('sem token (401)', (await req('GET', '/indicadores')).s === 401);
  r = await req('GET', '/indicadores', TA);
  check('doador: escopo próprio', r.s === 200 && r.d.escopo === 'doador');
  check('doador: totais corretos (2 doações, 1 retirada, 1 disponível)', r.d.resumo.total === 2 && r.d.resumo.retirada === 1 && r.d.resumo.disponivel === 1, JSON.stringify(r.d.resumo));
  check('doador: aproveitamento de 100%', r.d.aproveitamento === 100);
  check('doador: quantidade retirada por unidade', JSON.stringify(r.d.retirado_por_unidade) === JSON.stringify([{ unidade: 'kg', quantidade: 12.5 }]));
  check('doador: 6 meses no gráfico, com o mês atual preenchido', r.d.por_mes.length === 6 && r.d.por_mes[5].total === 2 && r.d.por_mes[5].retiradas === 1);
  check('doador não recebe dados de usuários', r.d.usuarios === undefined);
  r = await req('GET', '/indicadores', TI2);
  check('instituição: escopo próprio com 1 reserva retirada', r.d.escopo === 'instituicao' && r.d.resumo.total === 1 && r.d.resumo.retirada === 1);
  r = await req('GET', '/indicadores', TI1);
  check('instituição 1: 1 reserva cancelada', r.d.resumo.cancelada === 1 && r.d.resumo.retirada === 0);
  r = await req('GET', '/indicadores', TAD);
  check('admin: visão geral com usuários e instituições', r.d.escopo === 'geral' && r.d.usuarios.doador >= 2 && r.d.instituicoes.aprovada >= 2);
  await req('DELETE', `/doacoes/${D3}`, TA);

  // ---------------------------------------------------------------
  secao('Reservas simultâneas e instituição não aprovada');
  const D4 = (await req('POST', '/doacoes', TA, { ...valida, titulo: 'Lote disputado' })).d.id;
  await cad(dadosInst(3));
  const TI3 = (await login(EMAIL('i3'))).d.token;
  const inst3 = (await req('GET', '/instituicoes', TAD)).d.find((i) => i.email === EMAIL('i3')).id;
  r = await req('POST', '/reservas', TI3, { doacao_id: D4 });
  check('instituição PENDENTE não reserva (403)', r.s === 403 && /aguarda/.test(r.d.erro), JSON.stringify(r.d));
  check('admin recusa a instituição 3', (await req('PUT', `/instituicoes/${inst3}/aprovacao`, TAD, { status: 'recusada' })).s === 200);
  r = await req('POST', '/reservas', TI3, { doacao_id: D4 });
  check('instituição RECUSADA não reserva (403)', r.s === 403 && /recusado/.test(r.d.erro), JSON.stringify(r.d));
  const disputa = await Promise.all([
    req('POST', '/reservas', TI1, { doacao_id: D4 }),
    req('POST', '/reservas', TI2, { doacao_id: D4 }),
    req('POST', '/reservas', TI1, { doacao_id: D4 }),
    req('POST', '/reservas', TI2, { doacao_id: D4 }),
  ]);
  const codigos = disputa.map((x) => x.s).sort().join(',');
  check('4 pedidos SIMULTÂNEOS pelo mesmo lote: 1 reserva criada (201) e 3 recusadas (409)', codigos === '201,409,409,409', codigos);
  const [[ativas]] = await pool.query("SELECT COUNT(*) AS n FROM reservas WHERE doacao_id = ? AND status = 'ativa'", [D4]);
  check('o banco tem exatamente 1 reserva ativa para o lote', ativas.n === 1, String(ativas.n));
  check('a doação disputada ficou "reservada"', (await req('GET', `/doacoes/${D4}`, TA)).d.status === 'reservada');
  const [[duplicada]] = await pool.query(
    "SELECT COUNT(*) AS n FROM (SELECT doacao_id FROM reservas WHERE status = 'ativa' GROUP BY doacao_id HAVING COUNT(*) > 1) t");
  check('nenhuma doação do banco tem duas reservas ativas', duplicada.n === 0);
  let violou = false;
  try {
    await pool.query("INSERT INTO reservas (doacao_id, instituicao_id) VALUES (?, ?)", [D4, inst1]);
  } catch (erro) {
    violou = erro.code === 'ER_DUP_ENTRY';
  }
  check('o índice único do banco recusa uma segunda reserva ativa (mesmo fora da API)', violou);

  secao('Perfil e existência do usuário são relidos do banco');
  await cad({ nome: 'Promovido', email: EMAIL('promovido'), senha: SENHA, nivel: 'doador' });
  const TPromovido = (await login(EMAIL('promovido'))).d.token;
  check('doador comum não acessa /usuarios (403)', (await req('GET', '/usuarios', TPromovido)).s === 403);
  await pool.query("UPDATE usuarios SET nivel = 'admin' WHERE email = ?", [EMAIL('promovido')]);
  check('mudou o perfil no banco: o MESMO token passa a valer como admin na hora (200)', (await req('GET', '/usuarios', TPromovido)).s === 200);
  await pool.query("UPDATE usuarios SET nivel = 'doador' WHERE email = ?", [EMAIL('promovido')]);
  check('perfil rebaixado: o mesmo token volta a ser bloqueado (403)', (await req('GET', '/usuarios', TPromovido)).s === 403);
  await pool.query('DELETE FROM usuarios WHERE email = ?', [EMAIL('promovido')]);
  check('usuário apagado: o token deixa de valer (401)', (await req('GET', '/doacoes', TPromovido)).s === 401);

  // ---------------------------------------------------------------
  secao('Tratamento de erros e front-end');
  check('JSON malformado (400)', (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })).status === 400);
  check('rota inexistente da API responde JSON 404', (await req('GET', '/rota-que-nao-existe')).s === 404);
  const pagina404 = await fetch(`${BASE}/pagina-que-nao-existe`, { headers: { Accept: 'text/html' } });
  check('rota inexistente no navegador mostra a página 404', pagina404.status === 404 && (pagina404.headers.get('content-type') || '').includes('text/html'));
  const grande = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(200000) }) });
  check('corpo grande demais (413)', grande.status === 413);
  const html = await fetch(`${BASE}/login.html`);
  check('front-end é servido pela API (login.html)', html.status === 200);
  check('cabeçalhos de segurança presentes', html.headers.get('x-content-type-options') === 'nosniff' && !html.headers.get('x-powered-by'));
}

executar()
  .catch((erro) => {
    falhas++;
    console.error('\nErro inesperado durante os testes:', erro);
  })
  .finally(async () => {
    try {
      await limparDadosDeTeste();
    } catch (erro) {
      console.error('Aviso: não foi possível limpar os dados de teste:', erro.message);
    }
    await pool.end();
    console.log(`\nRESULTADO: ${ok} verificações passaram, ${falhas} falharam.`);
    process.exit(falhas ? 1 : 0);
  });
