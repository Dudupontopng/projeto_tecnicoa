const usuario = exigirLogin(['doador']);
if (usuario) iniciar();

function iniciar() {
  montarTopo(usuario);

  const form = document.getElementById('form-doacao');
  const campos = {
    titulo: document.getElementById('titulo'),
    categoria: document.getElementById('categoria'),
    quantidade: document.getElementById('quantidade'),
    unidade: document.getElementById('unidade'),
    validade: document.getElementById('validade'),
    retirada: document.getElementById('retirada'),
    descricao: document.getElementById('descricao'),
  };
  const tituloForm = document.getElementById('titulo-form');
  const btnSalvar = document.getElementById('btn-salvar');
  const btnCancelarEdicao = document.getElementById('btn-cancelar-edicao');
  const msgForm = document.getElementById('msg-form');
  const lista = document.getElementById('lista');
  const filtroStatus = document.getElementById('filtro-status');
  const filtroCategoria = document.getElementById('filtro-categoria');

  let editandoId = null;
  let doacoes = [];

  campos.validade.min = dataDeHoje();

  // ---------- carregar dados ----------
  async function carregarCategorias() {
    const categorias = await api('/categorias');
    preencherCategorias(campos.categoria, categorias, 'Selecione...');
    preencherCategorias(filtroCategoria, categorias, 'Todas');
  }

  async function carregarDoacoes() {
    const params = new URLSearchParams();
    if (filtroStatus.value) params.set('status', filtroStatus.value);
    if (filtroCategoria.value) params.set('categoria_id', filtroCategoria.value);
    const consulta = params.toString() ? `?${params}` : '';
    try {
      doacoes = await api(`/doacoes${consulta}`);
      desenharLista();
    } catch (erro) {
      mostrarMensagem(erro.message, 'erro');
    }
    atualizarResumo();
    carregarIndicadores();
  }

  // O resumo usa sempre a lista completa (sem filtros) para os totais.
  async function atualizarResumo() {
    try {
      const todas = await api('/doacoes');
      const conta = (s) => todas.filter((d) => d.status === s).length;
      const caixas = [
        ['Publicadas', todas.length],
        ['Disponíveis', conta('disponivel')],
        ['Reservadas', conta('reservada')],
        ['Retiradas', conta('retirada')],
      ];
      const resumo = document.getElementById('resumo');
      limpar(resumo);
      caixas.forEach(([rotulo, valor]) =>
        resumo.append(el('div', {}, el('strong', {}, String(valor)), el('span', {}, rotulo)))
      );
    } catch {
      /* o erro já aparece na listagem */
    }
  }

  async function carregarIndicadores() {
    try {
      renderIndicadores(document.getElementById('indicadores'), await api('/indicadores'));
    } catch {
      /* o erro já aparece na listagem */
    }
  }

  // ---------- desenhar a lista ----------
  function desenharLista() {
    limpar(lista);
    if (doacoes.length === 0) {
      lista.append(vazio('Nenhuma doação encontrada. Publique a primeira ao lado!'));
      return;
    }
    doacoes.forEach((d) => lista.append(cartao(d)));
  }

  function cartao(d) {
    const editavel = d.status === 'disponivel' || d.status === 'expirada';
    const acoes = [];

    if (editavel) {
      acoes.push(el('button', { class: 'btn btn-sec btn-peq', type: 'button', onclick: () => iniciarEdicao(d) }, 'Editar'));
      acoes.push(el('button', { class: 'btn btn-perigo btn-peq', type: 'button', onclick: () => excluir(d) }, 'Excluir'));
    }
    if (d.status === 'reservada' && d.reserva_id) {
      acoes.push(el('button', { class: 'btn btn-peq', type: 'button', onclick: () => confirmarRetirada(d) }, 'Confirmar retirada'));
    }

    return el('article', { class: 'item' },
      el('div', { class: 'item-topo' }, el('h3', {}, d.titulo), badge(d.status)),
      el('div', { class: 'meta' },
        el('span', {}, `Categoria: ${d.categoria_nome}`),
        el('span', {}, `Quantidade: ${formatarQuantidade(d.quantidade, d.unidade)}`),
        el('span', {}, `Validade: ${formatarData(d.validade)}`),
        el('span', {}, `Retirar até: ${formatarDataHora(d.retirada_ate)}`)
      ),
      d.descricao ? el('p', { class: 'descricao' }, d.descricao) : null,
      d.status === 'reservada' && d.reserva_instituicao
        ? el('p', { class: 'descricao' }, `Reservada por: ${d.reserva_instituicao}`)
        : null,
      d.status === 'expirada'
        ? el('p', { class: 'descricao' }, 'Prazo vencido. Edite as datas para publicar novamente.')
        : null,
      acoes.length ? el('div', { class: 'acoes' }, acoes) : null
    );
  }

  // ---------- criar / editar ----------
  function lerFormulario() {
    return {
      titulo: campos.titulo.value.trim(),
      categoria_id: Number(campos.categoria.value),
      quantidade: Number(campos.quantidade.value),
      unidade: campos.unidade.value,
      validade: campos.validade.value,
      retirada_ate: campos.retirada.value,
      descricao: campos.descricao.value.trim(),
    };
  }

  function limparFormulario() {
    form.reset();
    editandoId = null;
    tituloForm.textContent = 'Nova doação';
    btnSalvar.textContent = 'Publicar doação';
    btnCancelarEdicao.classList.add('escondido');
    msgForm.classList.add('escondido');
  }

  function iniciarEdicao(d) {
    editandoId = d.id;
    campos.titulo.value = d.titulo;
    campos.categoria.value = d.categoria_id;
    campos.quantidade.value = d.quantidade;
    campos.unidade.value = d.unidade;
    campos.validade.value = d.validade;
    campos.retirada.value = d.retirada_ate.slice(0, 16).replace(' ', 'T');
    campos.descricao.value = d.descricao || '';
    tituloForm.textContent = `Editando doação #${d.id}`;
    btnSalvar.textContent = 'Salvar alterações';
    btnCancelarEdicao.classList.remove('escondido');
    msgForm.classList.add('escondido');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    msgForm.classList.add('escondido');
    btnSalvar.disabled = true;
    try {
      const corpo = lerFormulario();
      if (editandoId) {
        await api(`/doacoes/${editandoId}`, { metodo: 'PUT', corpo });
        mostrarMensagem('Doação atualizada.');
      } else {
        await api('/doacoes', { metodo: 'POST', corpo });
        mostrarMensagem('Doação publicada!');
      }
      limparFormulario();
      await carregarDoacoes();
    } catch (erro) {
      // Erros de validação vindos da API aparecem logo abaixo do formulário.
      msgForm.textContent = erro.message;
      msgForm.classList.remove('escondido');
    } finally {
      btnSalvar.disabled = false;
    }
  });

  btnCancelarEdicao.addEventListener('click', limparFormulario);

  // ---------- excluir / confirmar retirada ----------
  async function excluir(d) {
    if (!confirm(`Excluir a doação "${d.titulo}"?`)) return;
    const ok = await executar(() => api(`/doacoes/${d.id}`, { metodo: 'DELETE' }), 'Doação excluída.');
    if (ok) {
      if (editandoId === d.id) limparFormulario();
      carregarDoacoes();
    }
  }

  async function confirmarRetirada(d) {
    if (!confirm(`Confirmar que "${d.titulo}" foi retirada por ${d.reserva_instituicao}?`)) return;
    const ok = await executar(
      () => api(`/reservas/${d.reserva_id}/retirada`, { metodo: 'PUT' }),
      'Retirada confirmada. Obrigado por doar!'
    );
    if (ok) carregarDoacoes();
  }

  filtroStatus.addEventListener('change', carregarDoacoes);
  filtroCategoria.addEventListener('change', carregarDoacoes);

  carregarCategorias().then(carregarDoacoes).catch((erro) => mostrarMensagem(erro.message, 'erro'));
}
