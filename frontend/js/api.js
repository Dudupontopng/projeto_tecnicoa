// ======================================================================
// Funções compartilhadas por todas as páginas: sessão, Fetch e DOM.
// ======================================================================

// Se a página foi aberta pelo próprio servidor (localhost:3000) a API é a mesma origem.
const API_URL = window.location.origin === 'http://localhost:3000' ? '' : 'http://localhost:3000';

const PAGINAS = { doador: 'doador.html', instituicao: 'instituicao.html', admin: 'admin.html' };
const ROTULOS = {
  disponivel: 'Disponível', reservada: 'Reservada', retirada: 'Retirada',
  cancelada: 'Cancelada', expirada: 'Expirada', pendente: 'Pendente',
  aprovada: 'Aprovada', recusada: 'Recusada', ativa: 'Ativa',
  admin: 'Administrador', doador: 'Doador', instituicao: 'Instituição',
};
const UNIDADES = {
  kg: 'kg', g: 'g', L: 'L', ml: 'ml', un: 'unidade(s)', porcoes: 'porção(ões)', caixas: 'caixa(s)',
};

// ---------- sessão (token JWT guardado no navegador) ----------
function salvarSessao(token, usuario) {
  localStorage.setItem('token', token);
  localStorage.setItem('usuario', JSON.stringify(usuario));
}

function obterToken() {
  return localStorage.getItem('token');
}

function obterUsuario() {
  try {
    return JSON.parse(localStorage.getItem('usuario'));
  } catch {
    return null;
  }
}

function limparSessao() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
}

function irPara(pagina) {
  window.location.href = pagina;
}

function sair() {
  limparSessao();
  irPara('login.html');
}

// Protege a página: só entra quem está logado e tem um dos perfis informados.
// Isto é só conforto de navegação; a segurança real está na API.
function exigirLogin(niveisPermitidos) {
  const usuario = obterUsuario();
  if (!obterToken() || !usuario) {
    irPara('login.html');
    return null;
  }
  if (!niveisPermitidos.includes(usuario.nivel)) {
    irPara(PAGINAS[usuario.nivel] || 'login.html');
    return null;
  }
  return usuario;
}

function montarTopo(usuario) {
  const nome = document.getElementById('nome-usuario');
  if (nome) nome.textContent = `${usuario.nome} (${ROTULOS[usuario.nivel]})`;
  const botao = document.getElementById('btn-sair');
  if (botao) botao.addEventListener('click', sair);
}

// ---------- Fetch ----------
async function api(caminho, { metodo = 'GET', corpo } = {}) {
  const cabecalhos = {};
  const token = obterToken();
  if (corpo) cabecalhos['Content-Type'] = 'application/json';
  if (token) cabecalhos.Authorization = `Bearer ${token}`;

  let resposta;
  try {
    resposta = await fetch(API_URL + caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error('Não foi possível conectar à API. Verifique se o servidor está rodando.');
  }

  let dados = null;
  try {
    dados = await resposta.json();
  } catch {
    /* resposta sem corpo JSON */
  }

  // Token vencido/inválido em qualquer rota protegida: volta para o login.
  if (resposta.status === 401 && obterToken()) {
    limparSessao();
    irPara('login.html');
    throw new Error((dados && dados.erro) || 'Sessão expirada.');
  }
  if (!resposta.ok) {
    throw new Error((dados && dados.erro) || 'Erro ao processar a requisição.');
  }
  return dados;
}

// ---------- DOM ----------
// Cria elementos sem usar innerHTML: textos entram como texto puro (evita XSS).
function el(tag, props = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props)) {
    if (chave === 'class') no.className = valor;
    else if (chave.startsWith('on') && typeof valor === 'function') no.addEventListener(chave.slice(2), valor);
    else if (valor !== false && valor != null) no.setAttribute(chave, valor === true ? '' : valor);
  }
  for (const filho of filhos.flat()) {
    if (filho != null && filho !== false) no.append(filho);
  }
  return no;
}

function limpar(no) {
  while (no.firstChild) no.removeChild(no.firstChild);
}

function badge(status) {
  return el('span', { class: `badge b-${status}` }, ROTULOS[status] || status);
}

function vazio(texto) {
  return el('div', { class: 'vazio' }, texto);
}

let temporizadorToast;
function mostrarMensagem(texto, tipo = 'ok') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = el('div', { id: 'toast' });
    document.body.append(toast);
  }
  toast.textContent = texto;
  toast.className = `visivel ${tipo === 'erro' ? 'erro' : ''}`;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => toast.classList.remove('visivel'), 3500);
}

// Executa uma ação da API e mostra o resultado (sucesso ou erro) para o usuário.
async function executar(acao, mensagemSucesso) {
  try {
    const resultado = await acao();
    if (mensagemSucesso) mostrarMensagem(mensagemSucesso);
    return resultado || true;
  } catch (erro) {
    mostrarMensagem(erro.message, 'erro');
    return false;
  }
}

// ---------- formatação ----------
function formatarData(texto) {
  if (!texto) return '';
  const [a, m, d] = texto.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function formatarDataHora(texto) {
  return texto ? `${formatarData(texto)} ${texto.slice(11, 16)}` : '';
}

function formatarQuantidade(quantidade, unidade) {
  return `${Number(quantidade).toLocaleString('pt-BR')} ${UNIDADES[unidade] || unidade}`;
}

function dataDeHoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function preencherCategorias(select, categorias, textoPadrao) {
  limpar(select);
  select.append(el('option', { value: '' }, textoPadrao));
  categorias.forEach((c) => select.append(el('option', { value: c.id }, c.nome)));
}

// Abas: mostra só a seção escolhida.
function ativarAbas(aoTrocar) {
  const abas = document.querySelectorAll('.aba');
  abas.forEach((aba) => {
    aba.addEventListener('click', () => {
      abas.forEach((a) => a.classList.toggle('ativa', a === aba));
      document.querySelectorAll('[data-secao]').forEach((s) => {
        s.classList.toggle('escondido', s.dataset.secao !== aba.dataset.alvo);
      });
      if (aoTrocar) aoTrocar(aba.dataset.alvo);
    });
  });
}
