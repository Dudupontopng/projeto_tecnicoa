const usuario = exigirLogin(['instituicao']);
if (usuario) iniciar();

async function iniciar() {
  montarTopo(usuario);

  const listaDisponiveis = document.getElementById('lista-disponiveis');
  const listaReservas = document.getElementById('lista-reservas');
  const filtroCategoria = document.getElementById('filtro-categoria');
  const filtroValidade = document.getElementById('filtro-validade');
  const avisoAprovacao = document.getElementById('aviso-aprovacao');

  let aprovada = false;

  // O status de aprovação é consultado na API (pode ter mudado desde o login).
  async function carregarPerfil() {
    const eu = await api('/auth/me');
    aprovada = eu.status_aprovacao === 'aprovada';
    avisoAprovacao.className = 'aviso escondido';
    if (eu.status_aprovacao === 'pendente') {
      avisoAprovacao.textContent = 'Seu cadastro está aguardando aprovação de um administrador. Você já pode ver as doações, mas ainda não pode reservar.';
      avisoAprovacao.className = 'aviso';
    } else if (eu.status_aprovacao === 'recusada') {
      avisoAprovacao.textContent = 'O cadastro da sua instituição foi recusado. Entre em contato com a administração.';
      avisoAprovacao.className = 'aviso erro';
    }
  }

  async function carregarCategorias() {
    const categorias = await api('/categorias');
    preencherCategorias(filtroCategoria, categorias, 'Todas');
  }

  // ---------- doações disponíveis ----------
  async function carregarDisponiveis() {
    const params = new URLSearchParams();
    if (filtroCategoria.value) params.set('categoria_id', filtroCategoria.value);
    if (filtroValidade.value) params.set('validade_ate', filtroValidade.value);
    const consulta = params.toString() ? `?${params}` : '';
    try {
      const doacoes = await api(`/doacoes${consulta}`);
      limpar(listaDisponiveis);
      if (doacoes.length === 0) {
        listaDisponiveis.append(vazio('Nenhuma doação disponível no momento.'));
        return;
      }
      doacoes.forEach((d) => listaDisponiveis.append(cartaoDoacao(d)));
    } catch (erro) {
      mostrarMensagem(erro.message, 'erro');
    }
  }

  function cartaoDoacao(d) {
    const botao = el('button', {
      class: 'btn btn-peq', type: 'button', disabled: !aprovada,
      title: aprovada ? '' : 'Disponível após a aprovação da instituição',
      onclick: () => reservar(d),
    }, 'Reservar');

    return el('article', { class: 'item' },
      el('div', { class: 'item-topo' }, el('h3', {}, d.titulo), badge(d.status)),
      el('div', { class: 'meta' },
        el('span', {}, `Doador: ${d.doador_nome}`),
        el('span', {}, `Categoria: ${d.categoria_nome}`),
        el('span', {}, `Quantidade: ${formatarQuantidade(d.quantidade, d.unidade)}`),
        el('span', {}, `Validade: ${formatarData(d.validade)}`),
        el('span', {}, `Retirar até: ${formatarDataHora(d.retirada_ate)}`)
      ),
      d.descricao ? el('p', { class: 'descricao' }, d.descricao) : null,
      el('div', { class: 'acoes' }, botao)
    );
  }

  async function reservar(d) {
    if (!confirm(`Reservar "${d.titulo}"? Você precisará retirar até ${formatarDataHora(d.retirada_ate)}.`)) return;
    const ok = await executar(
      () => api('/reservas', { metodo: 'POST', corpo: { doacao_id: d.id } }),
      'Doação reservada!'
    );
    // Dê certo ou errado (ex.: outra instituição reservou antes), atualiza as listas.
    await carregarDisponiveis();
    if (ok) carregarReservas();
  }

  // ---------- minhas reservas ----------
  async function carregarReservas() {
    try {
      const reservas = await api('/reservas');
      limpar(listaReservas);
      if (reservas.length === 0) {
        listaReservas.append(vazio('Você ainda não fez nenhuma reserva.'));
        return;
      }
      reservas.forEach((r) => listaReservas.append(cartaoReserva(r)));
    } catch (erro) {
      mostrarMensagem(erro.message, 'erro');
    }
  }

  function cartaoReserva(r) {
    const acoes = [];
    if (r.status === 'ativa') {
      acoes.push(el('button', {
        class: 'btn btn-perigo btn-peq', type: 'button', onclick: () => cancelar(r),
      }, 'Cancelar reserva'));
    }
    return el('article', { class: 'item' },
      el('div', { class: 'item-topo' }, el('h3', {}, r.titulo), badge(r.status)),
      el('div', { class: 'meta' },
        el('span', {}, `Doador: ${r.doador_nome}`),
        el('span', {}, `Quantidade: ${formatarQuantidade(r.quantidade, r.unidade)}`),
        el('span', {}, `Reservada em: ${formatarDataHora(r.reservada_em)}`),
        r.status === 'ativa' ? el('span', {}, `Retirar até: ${formatarDataHora(r.retirada_ate)}`) : null,
        r.retirada_em ? el('span', {}, `Retirada em: ${formatarDataHora(r.retirada_em)}`) : null
      ),
      acoes.length ? el('div', { class: 'acoes' }, acoes) : null
    );
  }

  async function cancelar(r) {
    if (!confirm(`Cancelar a reserva de "${r.titulo}"? A doação voltará a ficar disponível.`)) return;
    const ok = await executar(
      () => api(`/reservas/${r.id}/cancelar`, { metodo: 'PUT' }),
      'Reserva cancelada.'
    );
    if (ok) {
      carregarReservas();
      carregarDisponiveis();
    }
  }

  // ---------- eventos ----------
  filtroCategoria.addEventListener('change', carregarDisponiveis);
  filtroValidade.addEventListener('change', carregarDisponiveis);
  document.getElementById('btn-limpar').addEventListener('click', () => {
    filtroCategoria.value = '';
    filtroValidade.value = '';
    carregarDisponiveis();
  });
  async function carregarHistorico() {
    try {
      renderIndicadores(document.getElementById('indicadores'), await api('/indicadores'));
    } catch (erro) {
      mostrarMensagem(erro.message, 'erro');
    }
  }

  ativarAbas((aba) => {
    if (aba === 'reservas') carregarReservas();
    else if (aba === 'historico') carregarHistorico();
    else carregarDisponiveis();
  });

  try {
    await carregarPerfil();
    await carregarCategorias();
    await carregarDisponiveis();
    carregarReservas();
  } catch (erro) {
    mostrarMensagem(erro.message, 'erro');
  }
}
