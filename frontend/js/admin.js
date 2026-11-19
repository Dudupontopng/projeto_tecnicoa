const usuario = exigirLogin(['admin']);
if (usuario) iniciar();

function iniciar() {
  montarTopo(usuario);

  // Monta uma tabela a partir de cabeçalhos e linhas (cada linha é uma lista de células).
  function tabela(cabecalhos, linhas) {
    return el('table', {},
      el('thead', {}, el('tr', {}, cabecalhos.map((c) => el('th', {}, c)))),
      el('tbody', {}, linhas.map((linha) => el('tr', {}, linha.map((celula) => el('td', {}, celula)))))
    );
  }

  function botao(texto, classe, aoClicar) {
    return el('button', { class: `btn btn-peq ${classe}`, type: 'button', onclick: aoClicar }, texto);
  }

  // ---------- resumo ----------
  async function carregarResumo() {
    try {
      const [doacoes, usuarios] = await Promise.all([api('/doacoes'), api('/usuarios')]);
      const conta = (s) => doacoes.filter((d) => d.status === s).length;
      const caixas = [
        ['Usuários', usuarios.length],
        ['Doações', doacoes.length],
        ['Disponíveis', conta('disponivel')],
        ['Reservadas', conta('reservada')],
        ['Retiradas', conta('retirada')],
      ];
      const resumo = document.getElementById('resumo');
      limpar(resumo);
      caixas.forEach(([rotulo, valor]) =>
        resumo.append(el('div', {}, el('strong', {}, String(valor)), el('span', {}, rotulo)))
      );
    } catch (erro) {
      mostrarMensagem(erro.message, 'erro');
    }
  }

  // ---------- instituições ----------
  const filtroInst = document.getElementById('filtro-inst');
  const areaInst = document.getElementById('lista-instituicoes');

  async function carregarInstituicoes() {
    try {
      const consulta = filtroInst.value ? `?status=${filtroInst.value}` : '';
      const lista = await api(`/instituicoes${consulta}`);
      limpar(areaInst);
      if (lista.length === 0) {
        areaInst.append(vazio('Nenhuma instituição neste status.'));
        return;
      }
      areaInst.append(tabela(
        ['Instituição', 'E-mail', 'Endereço', 'Status', 'Ações'],
        lista.map((i) => [
          i.nome, i.email, `${i.endereco} - ${i.cidade}`, badge(i.status_aprovacao),
          el('div', { class: 'acoes', style: 'margin:0' },
            i.status_aprovacao !== 'aprovada' ? botao('Aprovar', '', () => decidir(i, 'aprovada')) : null,
            i.status_aprovacao !== 'recusada' ? botao('Recusar', 'btn-perigo', () => decidir(i, 'recusada')) : null
          ),
        ])
      ));
    } catch (erro) {
      mostrarMensagem(erro.message, 'erro');
    }
  }

  async function decidir(instituicao, status) {
    const ok = await executar(
      () => api(`/instituicoes/${instituicao.id}/aprovacao`, { metodo: 'PUT', corpo: { status } }),
      `Instituição ${status}.`
    );
    if (ok) carregarInstituicoes();
  }

  // ---------- doações (moderação) ----------
  const filtroDoacoes = document.getElementById('filtro-doacoes');
  const areaDoacoes = document.getElementById('lista-doacoes');

  async function carregarDoacoes() {
    try {
      const consulta = filtroDoacoes.value ? `?status=${filtroDoacoes.value}` : '';
      const lista = await api(`/doacoes${consulta}`);
      limpar(areaDoacoes);
      if (lista.length === 0) {
        areaDoacoes.append(vazio('Nenhuma doação encontrada.'));
        return;
      }
      areaDoacoes.append(tabela(
        ['Doação', 'Doador', 'Quantidade', 'Validade', 'Status', 'Ações'],
        lista.map((d) => [
          d.titulo, d.doador_nome, formatarQuantidade(d.quantidade, d.unidade),
          formatarData(d.validade), badge(d.status),
          ['disponivel', 'expirada'].includes(d.status)
            ? botao('Excluir', 'btn-perigo', () => excluirDoacao(d))
            : d.status === 'reservada' && d.reserva_instituicao
              ? `Reservada por ${d.reserva_instituicao}`
              : '',
        ])
      ));
    } catch (erro) {
      mostrarMensagem(erro.message, 'erro');
    }
  }

  async function excluirDoacao(d) {
    if (!confirm(`Excluir a doação "${d.titulo}"?`)) return;
    const ok = await executar(() => api(`/doacoes/${d.id}`, { metodo: 'DELETE' }), 'Doação excluída.');
    if (ok) {
      carregarDoacoes();
      carregarResumo();
    }
  }

  // ---------- categorias ----------
  const areaCategorias = document.getElementById('lista-categorias');

  async function carregarCategorias() {
    try {
      const lista = await api('/categorias');
      limpar(areaCategorias);
      areaCategorias.append(tabela(
        ['Categoria', 'Ações'],
        lista.map((c) => [
          c.nome,
          el('div', { class: 'acoes', style: 'margin:0' },
            botao('Renomear', 'btn-sec', () => renomearCategoria(c)),
            botao('Excluir', 'btn-perigo', () => excluirCategoria(c))
          ),
        ])
      ));
    } catch (erro) {
      mostrarMensagem(erro.message, 'erro');
    }
  }

  document.getElementById('form-categoria').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const campo = document.getElementById('nome-categoria');
    const ok = await executar(
      () => api('/categorias', { metodo: 'POST', corpo: { nome: campo.value } }),
      'Categoria criada.'
    );
    if (ok) {
      campo.value = '';
      carregarCategorias();
    }
  });

  async function renomearCategoria(c) {
    const nome = prompt('Novo nome da categoria:', c.nome);
    if (nome === null) return;
    const ok = await executar(
      () => api(`/categorias/${c.id}`, { metodo: 'PUT', corpo: { nome } }),
      'Categoria atualizada.'
    );
    if (ok) carregarCategorias();
  }

  async function excluirCategoria(c) {
    if (!confirm(`Excluir a categoria "${c.nome}"?`)) return;
    const ok = await executar(() => api(`/categorias/${c.id}`, { metodo: 'DELETE' }), 'Categoria excluída.');
    if (ok) carregarCategorias();
  }

  // ---------- usuários ----------
  const areaUsuarios = document.getElementById('lista-usuarios');

  const formUsuario = document.getElementById('form-usuario');
  const msgUsuario = document.getElementById('u-msg');
  let editandoUsuarioId = null;

  async function carregarUsuarios() {
    try {
      const lista = await api('/usuarios');
      limpar(areaUsuarios);
      areaUsuarios.append(tabela(
        ['Nome', 'E-mail', 'Perfil', 'Cadastro', 'Ações'],
        lista.map((u) => [
          u.nome, u.email, badge(u.nivel), formatarDataHora(u.criado_em),
          el('div', { class: 'acoes', style: 'margin:0' },
            botao('Editar', 'btn-sec', () => editarUsuario(u)),
            // Não há botão de excluir para a própria conta do administrador logado.
            u.id !== usuario.id ? botao('Excluir', 'btn-perigo', () => excluirUsuario(u)) : null
          ),
        ])
      ));
    } catch (erro) {
      mostrarMensagem(erro.message, 'erro');
    }
  }

  function fecharFormUsuario() {
    editandoUsuarioId = null;
    formUsuario.reset();
    formUsuario.classList.add('escondido');
    msgUsuario.classList.add('escondido');
  }

  function editarUsuario(u) {
    editandoUsuarioId = u.id;
    document.getElementById('titulo-usuario').textContent = `Editando ${u.nome} (${ROTULOS[u.nivel]})`;
    document.getElementById('u-nome').value = u.nome;
    document.getElementById('u-email').value = u.email;
    document.getElementById('u-senha').value = '';
    msgUsuario.classList.add('escondido');
    formUsuario.classList.remove('escondido');
    formUsuario.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  formUsuario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    msgUsuario.classList.add('escondido');
    const corpo = {
      nome: document.getElementById('u-nome').value,
      email: document.getElementById('u-email').value,
    };
    const senha = document.getElementById('u-senha').value;
    if (senha) corpo.senha = senha;
    try {
      await api(`/usuarios/${editandoUsuarioId}`, { metodo: 'PUT', corpo });
      mostrarMensagem('Usuário atualizado.');
      fecharFormUsuario();
      carregarUsuarios();
    } catch (erro) {
      msgUsuario.textContent = erro.message;
      msgUsuario.classList.remove('escondido');
    }
  });

  document.getElementById('u-cancelar').addEventListener('click', fecharFormUsuario);

  async function excluirUsuario(u) {
    if (!confirm(`Excluir o usuário "${u.nome}"? Esta ação não pode ser desfeita.`)) return;
    const ok = await executar(() => api(`/usuarios/${u.id}`, { metodo: 'DELETE' }), 'Usuário excluído.');
    if (ok) {
      if (editandoUsuarioId === u.id) fecharFormUsuario();
      carregarUsuarios();
      carregarResumo();
    }
  }

  // ---------- indicadores ----------
  async function carregarIndicadores() {
    try {
      renderIndicadores(document.getElementById('indicadores'), await api('/indicadores'));
    } catch (erro) {
      mostrarMensagem(erro.message, 'erro');
    }
  }

  // ---------- eventos ----------
  filtroInst.addEventListener('change', carregarInstituicoes);
  filtroDoacoes.addEventListener('change', carregarDoacoes);
  ativarAbas((aba) => {
    if (aba === 'instituicoes') carregarInstituicoes();
    if (aba === 'doacoes') carregarDoacoes();
    if (aba === 'categorias') carregarCategorias();
    if (aba === 'usuarios') carregarUsuarios();
    if (aba === 'indicadores') carregarIndicadores();
  });

  carregarResumo();
  carregarInstituicoes();
}
