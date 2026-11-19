// Desenha os indicadores devolvidos por GET /indicadores (cartões, totais, barras e gráfico mensal).
// Usa só HTML e CSS (sem biblioteca de gráficos), montado via DOM.

function mesPorExtenso(mes) {
  return `${mes.slice(5)}/${mes.slice(0, 4)}`; // 2026-11 -> 11/2026
}

function renderIndicadores(container, d) {
  limpar(container);
  const inst = d.escopo === 'instituicao';
  const r = d.resumo;

  // ---- cartões de resumo
  const caixas = inst
    ? [['Reservas', r.total], ['Ativas', r.ativa], ['Retiradas', r.retirada], ['Canceladas', r.cancelada]]
    : [
        [d.escopo === 'doador' ? 'Doações publicadas' : 'Doações', r.total],
        ['Disponíveis', r.disponivel], ['Reservadas', r.reservada],
        ['Retiradas', r.retirada], ['Expiradas', r.expirada],
        ['Aproveitamento', d.aproveitamento === null ? '—' : `${d.aproveitamento.toLocaleString('pt-BR')}%`],
      ];
  const resumo = el('div', { class: 'resumo' });
  caixas.forEach(([rotulo, valor]) =>
    resumo.append(el('div', {}, el('strong', {}, String(valor)), el('span', {}, rotulo)))
  );
  container.append(resumo);
  if (!inst) {
    container.append(el('p', { class: 'ind-nota' },
      'Aproveitamento = doações retiradas ÷ (retiradas + expiradas). Mostra quanto do alimento publicado realmente chegou a quem precisa.'));
  }

  // ---- visão geral do administrador
  if (d.escopo === 'geral' && d.usuarios) {
    const u = d.usuarios;
    const i = d.instituicoes;
    container.append(el('p', {},
      `Usuários: ${u.doador} doador(es), ${u.instituicao} instituição(ões), ${u.admin} administrador(es). ` +
      `Instituições: ${i.aprovada} aprovada(s), ${i.pendente} pendente(s), ${i.recusada} recusada(s).`));
  }

  // ---- quantidade retirada por unidade
  const titulos = {
    instituicao: 'Alimento que você já retirou',
    doador: 'Alimento que você já doou (retirado)',
    geral: 'Total de alimento retirado na plataforma',
  };
  const blocoUnidades = el('div', {}, el('h3', {}, titulos[d.escopo]));
  if (d.retirado_por_unidade.length === 0) {
    blocoUnidades.append(el('p', { class: 'ind-nota' }, 'Nenhuma retirada concluída ainda.'));
  } else {
    const chips = el('div', { class: 'ind-unidades' });
    d.retirado_por_unidade.forEach((u) => chips.append(el('span', { class: 'ind-unidade' }, formatarQuantidade(u.quantidade, u.unidade))));
    blocoUnidades.append(chips,
      el('p', { class: 'ind-nota' }, 'Unidades diferentes (kg, litros, porções) não são somadas entre si.'));
  }
  container.append(blocoUnidades);

  // ---- por categoria
  const blocoCategorias = el('div', {}, el('h3', {}, 'Por categoria'));
  if (d.por_categoria.length === 0) {
    blocoCategorias.append(el('p', { class: 'ind-nota' }, 'Ainda não há registros.'));
  } else {
    const maximo = Math.max(1, ...d.por_categoria.map((c) => c.total));
    d.por_categoria.forEach((c) => {
      blocoCategorias.append(el('div', { class: 'barra' },
        el('span', {}, c.categoria),
        el('div', { class: 'barra-trilho' }, el('div', { class: 'barra-preench', style: `width:${Math.round((c.total / maximo) * 100)}%` })),
        el('span', { class: 'barra-valor' }, `${c.retiradas} de ${c.total} retirada(s)`)
      ));
    });
  }
  container.append(blocoCategorias);

  // ---- últimos 6 meses
  const maximoMes = Math.max(1, ...d.por_mes.map((m) => m.total));
  const colunas = el('div', { class: 'colunas' });
  d.por_mes.forEach((m) => {
    colunas.append(el('div', { class: 'coluna', title: `${mesPorExtenso(m.mes)}: ${m.total} / ${m.retiradas} retirada(s)` },
      el('div', { class: 'coluna-barras' },
        el('span', { style: `height:${Math.round((m.total / maximoMes) * 100)}%` }),
        el('span', { class: 'ret', style: `height:${Math.round((m.retiradas / maximoMes) * 100)}%` })),
      el('div', { class: 'coluna-rotulo' }, mesPorExtenso(m.mes))));
  });
  container.append(el('div', {},
    el('h3', {}, 'Últimos 6 meses'),
    colunas,
    el('div', { class: 'legenda' },
      el('span', {}, el('i'), inst ? 'Reservas' : 'Publicadas'),
      el('span', {}, el('i', { class: 'ret' }), 'Retiradas'))));
}
