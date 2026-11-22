/* YouLift — interface. Toda conta vem de calc.js; todo número diário vem de dados.js (congelado).
   Nada aqui sorteia valores, e nenhuma chamada de rede é feita. */
(function () {
  'use strict';

  const Calc = window.YouLiftCalc;
  const Dados = window.YouLiftDados;

  const params = new URLSearchParams(location.search);
  const GRAVAR = params.get('gravar') === '1';
  const REDUZIDO = !GRAVAR && !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const ORIGENS = ['skincare', 'viagem'];
  const DIAS = Dados.experimento.dias;
  const DIA_MS = 10000 / DIAS; // cerca de 10 segundos para os 14 dias

  /* ---------- utilidades ---------- */

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const MENOS = '−';
  const NB = ' ';
  const formatadores = {};
  function nf(d) {
    return formatadores[d] || (formatadores[d] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  }
  function num(v, d) {
    d = d || 0;
    const r = Math.round(Math.abs(v) * Math.pow(10, d));
    const s = nf(d).format(Math.abs(v));
    return v < 0 && r > 0 ? MENOS + s : s;
  }
  function sinal(v, d) {
    const r = Math.round(Math.abs(v) * Math.pow(10, d || 0));
    return r === 0 ? '' : v > 0 ? '+' : MENOS;
  }
  function brl(v, d) {
    d = d == null ? 2 : d;
    return (v < 0 && Math.round(Math.abs(v) * Math.pow(10, d)) > 0 ? MENOS : '') + 'R$' + NB + nf(d).format(Math.abs(v));
  }
  function brlSinal(v) { return sinal(v, 2) + 'R$' + NB + nf(2).format(Math.abs(v)); }
  function pct(frac, d) { return num(frac * 100, d == null ? 2 : d) + '%'; }
  function ponto(x) { return Math.abs(x) < 2 ? 'ponto' : 'pontos'; }
  function pedidos(v) { return Math.abs(v - Math.round(v)) < 1e-9 ? num(Math.round(v)) : num(v, 1); }
  function aprox(n) {
    if (n >= 10000) return num(Math.round(n / 1000)) + ' mil';
    return num(Math.round(n / 100) * 100);
  }
  function remPx() { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; }

  /* Faz o número "contar" até o valor. Sem animação no modo de movimento reduzido. */
  function contar(el, alvo, fmt, dur, aoQuadro) {
    if (!el) return;
    if (el._raf) cancelAnimationFrame(el._raf);
    const de = el._v == null ? 0 : el._v;
    const escreve = (v) => { el.textContent = fmt(v); if (aoQuadro) aoQuadro(v); };
    if (REDUZIDO || !dur || de === alvo) { el._v = alvo; escreve(alvo); return; }
    const t0 = performance.now();
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el._v = k < 1 ? de + (alvo - de) * e : alvo;
      escreve(el._v);
      if (k < 1) el._raf = requestAnimationFrame(passo);
    };
    el._raf = requestAnimationFrame(passo);
  }
  function limpar(el, texto) {
    if (!el) return;
    if (el._raf) cancelAnimationFrame(el._raf);
    el._v = undefined;
    el.textContent = texto == null ? '—' : texto;
  }

  /* ---------- estado ---------- */

  const premissasPadrao = () => ({
    custoPrincipal: Dados.premissas.custoPrincipal,
    custoBump: { skincare: Dados.premissas.custoBump.skincare, viagem: Dados.premissas.custoBump.viagem },
    comissaoPct: Dados.premissas.comissaoPct,
    reembolsoPct: { ...Dados.premissas.reembolsoPct },
    margemPP: Dados.premissas.margemPP
  });

  const estado = {
    cena: 1,
    conta: { ...Dados.conta },
    categoriasExcluidas: Dados.regras.categoriasExcluidas.slice(),
    prem: premissasPadrao(),
    volume: 'grande',
    sims: { skincare: null, viagem: null },
    exp: { dia: 0, rodando: false, token: 0 },
    c1: { token: 0 },
    decisao: { skincare: 'pendente', viagem: 'pendente' },
    extras: { skincare: [], viagem: [] },
    visitou: {},
    revelar: 0
  };

  const produto = (id) => Dados.catalogo.find((p) => p.id === id);
  const ctxRegras = () => ({ ticket: Dados.principal.preco, minPct: Dados.regras.minPct, maxPct: Dados.regras.maxPct, categoriasExcluidas: estado.categoriasExcluidas });

  function candidata(origem) {
    const prod = produto(Dados.origens[origem].candidata);
    const el = Calc.elegibilidade(prod, ctxRegras());
    return { prod, el };
  }

  function recalcular() {
    const pr = estado.prem;
    for (const o of ORIGENS) {
      const c = candidata(o);
      if (!c.el.ok) { estado.sims[o] = null; continue; }
      estado.sims[o] = Calc.simular({
        dias: Calc.escalarDias(Dados.experimento[o], Dados.volumes[estado.volume].fator),
        ticket: Dados.principal.preco,
        precoBump: c.prod.preco,
        premissas: {
          custoPrincipal: pr.custoPrincipal,
          custoBump: pr.custoBump[o],
          comissao: pr.comissaoPct / 100,
          reembolsoCtr: pr.reembolsoPct.controle / 100,
          reembolsoTrt: pr.reembolsoPct[o] / 100,
          margem: pr.margemPP / 100
        }
      });
    }
  }

  /* ---------- navegação ---------- */

  const NOMES = ['', 'A conta', 'Sugestões', 'Experimento', 'Decisão'];

  function irPara(n, opcoes) {
    n = Math.max(1, Math.min(4, Math.round(Number(n)) || 1));
    if (n !== 3) pararExperimento();
    estado.c1.token++;
    estado.cena = n;
    $$('.cena').forEach((s) => { s.hidden = Number(s.id.replace('cena-', '')) !== n; });
    $$('.passos button').forEach((b) => {
      if (Number(b.dataset.ir) === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    $('#btn-ant').disabled = n === 1;
    $('#btn-prox').disabled = n === 4;
    document.title = 'YouLift: ' + NOMES[n].toLowerCase();
    if (!(opcoes && opcoes.semUrl)) {
      try {
        const u = new URL(location.href);
        u.searchParams.set('cena', String(n));
        history.replaceState(null, '', u);
      } catch (e) { /* arquivo local: segue sem atualizar o endereço */ }
    }
    if (n === 1) renderConta();
    if (n === 2) { renderSugestoes(); if (!estado.visitou[2] && !GRAVAR && !REDUZIDO) avaliarRegras(); }
    if (n === 3) { renderExperimento(); }
    if (n === 4) { renderDecisao(); revelarRegistro(); }
    estado.visitou[n] = true;
    window.scrollTo(0, 0);
    return n;
  }

  /* ---------- Cena 1: a conta ---------- */

  const PARAMS1 = [
    { k: 'checkouts', rotulo: 'Checkouts iniciados', min: 100, max: 5000, step: 100, fmt: (v) => num(v) },
    { k: 'conversao', rotulo: 'Conversão da venda', min: 5, max: 40, step: 0.5, fmt: (v) => num(v, 1) + '%' },
    { k: 'ticket', rotulo: 'Ticket médio', min: 50, max: 500, step: 1, fmt: (v) => brl(v, 0) },
    { k: 'precoBump', rotulo: 'Preço do bump', min: 5, max: 150, step: 1, fmt: (v) => brl(v, 0) },
    { k: 'aceite', rotulo: 'Aceite do bump', min: 1, max: 60, step: 1, fmt: (v) => num(v) + '%' }
  ];

  function montarConta() {
    const caixa = $('#c1-params');
    caixa.innerHTML = '';
    for (const p of PARAMS1) {
      const d = document.createElement('div');
      d.className = 'param';
      d.innerHTML = `<div class="param-topo"><label for="p-${p.k}">${p.rotulo}</label><output class="num" id="o-${p.k}" for="p-${p.k}"></output></div>` +
        `<input type="range" id="p-${p.k}" min="${p.min}" max="${p.max}" step="${p.step}" value="${estado.conta[p.k]}">`;
      caixa.appendChild(d);
      $('input', d).addEventListener('input', (e) => {
        estado.c1.token++;
        estado.conta[p.k] = parseFloat(e.target.value);
        renderConta();
      });
    }
    $('#c1-queda').addEventListener('input', (e) => {
      estado.c1.token++;
      estado.conta.queda = Math.round(parseFloat(e.target.value) * 10) / 10;
      renderConta();
    });
  }

  function renderConta() {
    const c = estado.conta;
    const r = Calc.cenarios(c);
    const eq = r.equilibrio;

    const heroi = $('#c1-eq');
    const fmtEq = (v) => num(v, 1);
    if (!estado.visitou.heroi1) { estado.visitou.heroi1 = true; contar(heroi, eq, fmtEq, 900); }
    else {
      if (heroi._raf) { cancelAnimationFrame(heroi._raf); heroi._raf = 0; }
      heroi._v = eq; heroi.textContent = fmtEq(eq);
    }
    $('#c1-eq-un').textContent = ponto(eq);
    $('#c1-marca-v').textContent = num(eq, 1);

    $('#c1-formula').innerHTML =
      `Conta: <span class="num">${num(c.conversao, 1)}%</span> menos <span class="num">${num(c.conversao, 1)}%</span> × ${brl(c.ticket, 0)} ÷ (${brl(c.ticket, 0)} + ${num(c.aceite)}% × ${brl(c.precoBump, 0)}) = ` +
      `<span class="num">${num(eq, 3)}</span> ponto percentual, sem arredondar. Um ponto percentual é, por exemplo, ir de ${num(c.conversao, 0)}% para ${num(c.conversao - 1, 0)}%.`;

    $('#c1-queda').value = c.queda;
    $('#c1-queda-v').textContent = num(c.queda, 1) + ' ' + ponto(c.queda);
    const trilho = $('#c1-trilho');
    trilho.style.setProperty('--eqf', String(Math.min(1, eq / 3)));
    $('#c1-z-ok').style.display = eq / 3 < 0.22 ? 'none' : '';

    for (const p of PARAMS1) {
      $('#o-' + p.k).textContent = p.fmt(c[p.k]);
      const inp = $('#p-' + p.k);
      if (Number(inp.value) !== c[p.k]) inp.value = c[p.k];
    }

    const extremo = Calc.cenarios({ ...c, queda: 3 });
    let lo = Math.min(0, extremo.difC);
    let hi = Math.max(0, r.difB);
    if (hi - lo < 1) hi = lo + 1;
    const folga = (hi - lo) * 0.06;
    lo -= folga; hi += folga;
    const pos = (x) => ((x - lo) / (hi - lo)) * 100;

    $('#c1-quadro').style.setProperty('--zero', pos(0) + '%');
    const linhas = { A: { ...r.A, dif: 0 }, B: { ...r.B, dif: r.difB }, C: { ...r.C, dif: r.difC } };
    for (const k of ['A', 'B', 'C']) {
      const li = $('.linha[data-c="' + k + '"]');
      const d = linhas[k];
      $('[data-pedidos]', li).textContent = pedidos(d.pedidos);
      $('[data-receita]', li).textContent = brl(d.receita);
      const dif = $('[data-dif]', li);
      dif.textContent = k === 'A' ? '—' : brlSinal(d.dif);
      dif.className = 'l-dif num ' + (k === 'A' ? '' : d.dif > 0 ? 'mais' : d.dif < 0 ? 'menos' : '');
      const barra = $('.l-barra', li);
      if (k !== 'A') {
        const esq = pos(Math.min(0, d.dif));
        const larg = (Math.abs(d.dif) / (hi - lo)) * 100;
        barra.style.setProperty('--esq', esq + '%');
        barra.style.setProperty('--larg', larg + '%');
      }
      if (k === 'C') li.classList.toggle('perde', d.dif < 0);
    }
    $('[data-nome-c]').textContent = `Com bump, conversão de ${num(c.conversao, 1)}% para ${num(c.conversao - c.queda, 1)}%`;

    const frase = $('#c1-frase');
    if (r.difC < 0) frase.innerHTML = `Com ${num(c.queda, 1)} ${ponto(c.queda)} de queda, a loja fatura <span class="num mau">${brl(-r.difC)}</span> a menos do que faturava sem o bump.`;
    else if (r.difC > 0) frase.innerHTML = `Com ${num(c.queda, 1)} ${ponto(c.queda)} de queda, a loja ainda fatura <span class="num bom">${brl(r.difC)}</span> a mais do que faturava sem o bump.`;
    else frase.textContent = 'Com essa queda, a loja fatura o mesmo com e sem o bump.';
  }

  function definirQueda(x) {
    estado.c1.token++;
    estado.conta.queda = Math.max(0, Math.min(3, Math.round(Number(x) * 10) / 10));
    if (estado.cena === 1) renderConta();
  }

  /* Anima o controle de queda de 0 até 1,0, passando pelo ponto de equilíbrio. */
  async function animarQueda() {
    const token = ++estado.c1.token;
    const alvo = Dados.conta.queda;
    const passos = Math.round(alvo * 10);
    estado.conta.queda = 0; renderConta();
    await esperar(900);
    for (let i = 1; i <= passos; i++) {
      if (token !== estado.c1.token) return false;
      estado.conta.queda = i / 10; renderConta();
      await esperar(i >= passos - 2 ? 520 : 340);
    }
    return token === estado.c1.token;
  }

  /* ---------- Cena 2: sugestões e regras ---------- */

  function motivoRegra(r) {
    if (r.id === 'estoque') return 'Sem estoque';
    if (r.id === 'preco') return r.lado === 'acima'
      ? `${num(r.valor, 1)}% do ticket, acima de ${Dados.regras.maxPct}%`
      : `${num(r.valor, 1)}% do ticket, abaixo de ${Dados.regras.minPct}%`;
    return 'Categoria excluída';
  }

  function renderSugestoes() {
    const tk = Dados.principal.preco;
    $('#c2-principal').innerHTML = `Produto principal nas duas origens: <b>${Dados.principal.nome}, ${brl(tk, 0)}</b>. ${Dados.marca}.`;
    $('#c2-rotulo-ia').textContent = Dados.rotuloIA;

    $('#c2-origens').innerHTML = ORIGENS.map((o) => {
      const og = Dados.origens[o];
      const { prod, el } = candidata(o);
      const just = og.justificativa.replace(/“([^”]+)”/g, '<q>“$1”</q>');
      const falhas = el.regras.filter((r) => !r.ok).map(motivoRegra);
      const conf = el.ok
        ? `Regras conferidas: <b class="ok">passou nas 3</b>. Estoque de ${num(prod.estoque)} unidades, preço em ${num(el.pct, 1)}% do ticket, categoria ${prod.categoria} liberada.`
        : `Regras conferidas: <b class="nao">reprovada</b> (${falhas.join('; ').toLowerCase()}). Nada vai para o teste e fica a oferta atual.`;
      return `<article class="origem" data-origem="${o}">
        <p class="origem-nome">Origem do tráfego: <b>${og.nome}</b></p>
        <div class="origem-preco"><span class="valor"><span class="mo">R$</span>${num(prod.preco)}</span><small><span class="num">${num(el.pct, 1)}%</span> do ticket de ${brl(tk, 0)}</small></div>
        <div><h2>${prod.nome}</h2><p class="just">${just}</p></div>
        <p class="origem-conf">${conf}</p>
      </article>`;
    }).join('');

    const ctx = ctxRegras();
    const minV = tk * Dados.regras.minPct / 100, maxV = tk * Dados.regras.maxPct / 100;
    const categorias = Array.from(new Set(Dados.catalogo.map((p) => p.categoria)));
    const selecionada = estado.categoriasExcluidas[0] || '';
    const sel = `<select id="sel-categoria" aria-label="Categoria excluída pelo produtor"><option value="">Nenhuma</option>${categorias.map((c) => `<option${c === selecionada ? ' selected' : ''}>${c}</option>`).join('')}</select>`;

    const linhas = Dados.catalogo.map((p) => {
      const e = Calc.elegibilidade(p, ctx);
      const r = (id) => e.regras.find((x) => x.id === id);
      const cel = (id, rot) => {
        const x = r(id);
        return `<td class="reg ${x.ok ? 'passa' : 'falha'}" data-r="${rot}">${x.ok ? 'passa' : motivoRegra(x)}</td>`;
      };
      const sug = ORIGENS.filter((o) => Dados.origens[o].candidata === p.id);
      const tag = sug.length ? `<small>Sugerida para ${sug.map((o) => o).join(' e ')}</small>` : '';
      return `<tr class="${sug.length ? 'sugerida' : ''}">
        <td class="produto"><span class="p-nome">${p.nome}</span><span class="p-desc">${p.descricao}</span></td>
        <td class="p-cat" data-r="Categoria">${p.categoria}</td>
        <td class="p-num num" data-r="Preço">${brl(p.preco, 0)}<small>${num(e.pct, 1)}% do ticket</small></td>
        <td class="p-num num" data-r="Estoque">${num(p.estoque)}</td>
        ${cel('estoque', 'Regra de estoque')}${cel('preco', 'Regra de preço')}${cel('categoria', 'Regra de categoria')}
        <td class="reg res ${e.ok ? 'ok' : 'nao'}" data-r="Resultado">${e.ok ? 'Elegível' : 'Reprovado'}${tag}</td>
      </tr>`;
    }).join('');

    $('#c2-tabela').innerHTML = `<table class="regras-tab"><thead><tr>
      <th scope="col"><span class="th-t">Catálogo fictício</span><span class="th-s">6 produtos, com descrição, categoria, preço e estoque</span></th>
      <th scope="col"><span class="th-t">Categoria</span></th>
      <th scope="col" class="dir"><span class="th-t">Preço</span></th>
      <th scope="col" class="dir"><span class="th-t">Estoque</span></th>
      <th scope="col"><span class="th-t">Regra de estoque</span><span class="th-s">precisa ter unidades</span></th>
      <th scope="col"><span class="th-t">Regra de preço</span><span class="th-s">de ${Dados.regras.minPct}% a ${Dados.regras.maxPct}% do ticket (${brl(minV)} a ${brl(maxV)})</span></th>
      <th scope="col"><span class="th-t">Regra de categoria</span><span class="th-s">fora da lista do produtor: ${sel}</span></th>
      <th scope="col"><span class="th-t">Resultado</span></th>
    </tr></thead><tbody>${linhas}</tbody></table>`;

    $('#sel-categoria').addEventListener('change', (e) => {
      estado.categoriasExcluidas = e.target.value ? [e.target.value] : [];
      recalcular();
      resetarExperimento();
      renderSugestoes(); renderExperimento(); renderDecisao();
    });
  }

  /* As regras "rodam" célula por célula: a ordem mostra que cada conferência acontece de verdade. */
  async function avaliarRegras() {
    estado.visitou[2] = true;
    const celulas = $$('#c2-tabela .reg');
    celulas.forEach((c) => c.classList.add('espera'));
    await esperar(500);
    for (const c of celulas) {
      if (estado.cena !== 2) { celulas.forEach((x) => x.classList.remove('espera')); return false; }
      c.classList.remove('espera');
      await esperar(95);
    }
    return true;
  }

  /* ---------- Cena 3: experimento ---------- */

  const refs = {};

  function montarExperimento() {
    $('#c3-paineis').innerHTML = ORIGENS.map((o) => `
      <article class="painel" data-origem="${o}">
        <header class="painel-cab">
          <div><h2>${Dados.origens[o].nome}</h2><p class="sub" data-sub></p></div>
          <p class="status" data-status data-estado="parado" aria-live="polite">Pronto para rodar</p>
        </header>
        <div class="grafico-cap"><span>Trava de conversão: limite superior de 99% da diferença, em pontos. Abaixo de zero, pausa.</span><span class="leitura" data-leitura>—</span></div>
        <div class="grafico" data-grafico></div>
        <table class="tab-exp">
          <thead><tr><th scope="col"></th><th scope="col">Controle</th><th scope="col">Tratamento</th></tr></thead>
          <tbody>
            <tr><td>Checkouts iniciados</td><td class="v num" data-c="n">—</td><td class="v num" data-t="n">—</td></tr>
            <tr><td>Conversão da venda principal</td><td class="v num" data-c="conv">—</td><td class="v num" data-t="conv">—</td></tr>
            <tr><td>Aceite do bump</td><td class="v num apagado" data-c="aceite">sem oferta</td><td class="v num" data-t="aceite">—</td></tr>
            <tr class="sobra"><td>Sobra por checkout iniciado</td><td class="v num" data-c="sobra">—</td><td class="v num" data-t="sobra">—</td></tr>
          </tbody>
        </table>
        <div class="painel-hero">
          <p class="valor"><span data-sinal></span><span class="mo">R$</span><span data-hero>—</span></p>
          <p class="legenda"><b data-hero-leg>por checkout iniciado</b><span class="lim-linha">Limite inferior do intervalo de 95%: <span class="num" data-lim>—</span></span><em data-acaso></em></p>
        </div>
      </article>`).join('');
    for (const o of ORIGENS) {
      const raiz = $('.painel[data-origem="' + o + '"]');
      refs[o] = {
        raiz,
        sub: $('[data-sub]', raiz),
        status: $('[data-status]', raiz),
        leitura: $('[data-leitura]', raiz),
        grafico: $('[data-grafico]', raiz),
        c: { n: $('[data-c="n"]', raiz), conv: $('[data-c="conv"]', raiz), aceite: $('[data-c="aceite"]', raiz), sobra: $('[data-c="sobra"]', raiz) },
        t: { n: $('[data-t="n"]', raiz), conv: $('[data-t="conv"]', raiz), aceite: $('[data-t="aceite"]', raiz), sobra: $('[data-t="sobra"]', raiz) },
        sinal: $('[data-sinal]', raiz),
        hero: $('[data-hero]', raiz),
        heroLeg: $('[data-hero-leg]', raiz),
        lim: $('[data-lim]', raiz),
        acaso: $('[data-acaso]', raiz),
        svg: null
      };
    }
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => { if (estado.cena === 3) { for (const o of ORIGENS) refs[o].svg = null; renderExperimento(); } });
      ro.observe($('#c3-paineis'));
    }
  }

  function montarPremissas() {
    const p = estado.prem;
    const campos = [
      { id: 'custoPrincipal', rot: 'Custo do produto principal (R$)', get: () => p.custoPrincipal, set: (v) => { p.custoPrincipal = v; }, step: 1 },
      { id: 'cb-skincare', rot: 'Custo do refil (R$)', get: () => p.custoBump.skincare, set: (v) => { p.custoBump.skincare = v; }, step: 1 },
      { id: 'cb-viagem', rot: 'Custo da nécessaire (R$)', get: () => p.custoBump.viagem, set: (v) => { p.custoBump.viagem = v; }, step: 1 },
      { id: 'comissao', rot: 'Comissão do creator (% da receita)', get: () => p.comissaoPct, set: (v) => { p.comissaoPct = v; }, step: 1 },
      { id: 'rb-controle', rot: 'Reembolso e chargeback no controle (%)', get: () => p.reembolsoPct.controle, set: (v) => { p.reembolsoPct.controle = v; }, step: 0.1 },
      { id: 'rb-skincare', rot: 'Reembolso e chargeback com o refil (%)', get: () => p.reembolsoPct.skincare, set: (v) => { p.reembolsoPct.skincare = v; }, step: 0.1 },
      { id: 'rb-viagem', rot: 'Reembolso e chargeback com a nécessaire (%)', get: () => p.reembolsoPct.viagem, set: (v) => { p.reembolsoPct.viagem = v; }, step: 0.1 },
      { id: 'margem', rot: 'Margem da trava (pontos de conversão)', get: () => p.margemPP, set: (v) => { p.margemPP = v; }, step: 0.1 }
    ];
    const grade = $('#prem-grade');
    grade.innerHTML = campos.map((c) => `<div><label for="pr-${c.id}">${c.rot}</label><input type="number" id="pr-${c.id}" step="${c.step}" min="0" inputmode="decimal" value="${c.get()}"></div>`).join('');
    campos.forEach((c) => {
      $('#pr-' + c.id).addEventListener('input', (e) => {
        const v = parseFloat(String(e.target.value).replace(',', '.'));
        if (!isFinite(v) || v < 0) return;
        c.set(v);
        recalcular();
        renderExperimento(); renderDecisao();
      });
    });
    $('#btn-prem-padrao').onclick = () => {
      estado.prem = premissasPadrao();
      montarPremissas();
      recalcular(); renderExperimento(); renderDecisao();
    };
  }

  function dominioY() {
    let lo = -1, hi = 2;
    for (const o of ORIGENS) {
      const s = estado.sims[o];
      if (!s) continue;
      for (const p of s.passos) { hi = Math.max(hi, p.est.conv.limSup99 * 100); lo = Math.min(lo, p.est.conv.limSup99 * 100); }
    }
    const passo = hi - lo > 10 ? 4 : 2;
    return { lo: Math.min(-1, Math.floor(lo)), hi: Math.ceil(hi + 0.2), passo };
  }

  const NS = 'http://www.w3.org/2000/svg';
  function preparar(o, dom) {
    const r = refs[o];
    const box = r.grafico;
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return false;
    const rem = remPx();
    const m = { l: 2.7 * rem, r: 0.4 * rem, t: 0.5 * rem, b: 1.5 * rem };
    const x = (d) => m.l + ((d - 1) / (DIAS - 1)) * (w - m.l - m.r);
    const y = (v) => m.t + ((dom.hi - v) / (dom.hi - dom.lo)) * (h - m.t - m.b);
    let html = '';
    for (let v = Math.ceil(dom.lo / dom.passo) * dom.passo; v <= dom.hi + 1e-9; v += dom.passo) {
      html += `<line class="${v === 0 ? 'eixo-zero' : 'grade'}" x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
      html += `<text x="${m.l - 0.5 * rem}" y="${y(v) + 4}" text-anchor="end">${v > 0 ? '+' : v < 0 ? MENOS : ''}${Math.abs(v)}</text>`;
    }
    [[1, 'start'], [7, 'middle'], [14, 'end']].forEach(([d, a]) => {
      html += `<text class="${d === 7 ? 'dia7' : ''}" x="${x(d)}" y="${h - 0.2 * rem}" text-anchor="${a}">dia ${d}</text>`;
    });
    html += `<g class="grupo-depois"><rect class="depois" data-depois/><line class="marca-pausa" data-marca/><text class="depois-txt" data-depois-txt text-anchor="middle">100% do tráfego no controle</text><text class="depois-txt" data-dia-pausa text-anchor="middle"></text></g>`;
    html += `<path class="linha-limite" data-linha d=""/><circle class="ponto" data-ponto r="5" cx="0" cy="0"/>`;
    box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Limite superior de 99% da diferença de conversão por dia"></svg>`;
    const svg = box.firstChild;
    svg.innerHTML = html;
    r.svg = { svg, x, y, w, h, m, linha: $('[data-linha]', svg), ponto: $('[data-ponto]', svg), depois: $('[data-depois]', svg), marca: $('[data-marca]', svg), depoisTxt: $('[data-depois-txt]', svg), diaPausa: $('[data-dia-pausa]', svg) };
    return true;
  }

  function atualizarGrafico(o, dia, dom) {
    const r = refs[o];
    const sim = estado.sims[o];
    if (!r.svg && !preparar(o, dom)) return;
    const g = r.svg;
    const idx = sim ? Math.min(dia, sim.passos.length) : 0;
    const ptos = [];
    for (let d = 1; d <= DIAS; d++) {
      const k = idx > 0 ? Math.min(d, idx) : 1;
      const v = sim && idx > 0 ? sim.passos[k - 1].est.conv.limSup99 * 100 : 0;
      ptos.push([g.x(idx > 0 ? Math.min(d, idx) : d), g.y(v)]);
    }
    if (idx > 0) {
      const d = 'M' + ptos.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
      g.linha.setAttribute('d', d);
      g.linha.style.setProperty('d', "path('" + d + "')");
      const p = ptos[idx - 1];
      g.ponto.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`;
      g.ponto.style.opacity = 1;
    } else {
      g.linha.setAttribute('d', '');
      g.linha.style.setProperty('d', "path('M0 0')");
      g.ponto.style.opacity = 0;
    }
    if (sim && sim.diaPausa) {
      const x0 = g.x(sim.diaPausa);
      g.depois.setAttribute('x', x0); g.depois.setAttribute('y', g.m.t);
      g.depois.setAttribute('width', Math.max(0, g.w - g.m.r - x0)); g.depois.setAttribute('height', g.h - g.m.t - g.m.b);
      g.marca.setAttribute('x1', x0); g.marca.setAttribute('x2', x0); g.marca.setAttribute('y1', g.m.t); g.marca.setAttribute('y2', g.h - g.m.b);
      g.depoisTxt.setAttribute('x', (x0 + g.w - g.m.r) / 2); g.depoisTxt.setAttribute('y', g.m.t + 1.4 * remPx());
      g.diaPausa.setAttribute('x', x0); g.diaPausa.setAttribute('y', g.h - 0.2 * remPx());
      g.diaPausa.textContent = 'dia ' + sim.diaPausa;
      const t7 = g.svg.querySelector('.dia7'); if (t7) t7.style.display = Math.abs(sim.diaPausa - 7) <= 2 ? 'none' : '';
    } else {
      g.depois.setAttribute('width', 0); g.depoisTxt.textContent = '100% do tráfego no controle';
      g.diaPausa.textContent = '';
      const t7 = g.svg.querySelector('.dia7'); if (t7) t7.style.display = '';
    }
  }

  function textoStatus(sim, dia) {
    if (!sim) return { t: 'Sem candidata elegível', e: 'parado' };
    if (dia === 0) return { t: 'Pronto para rodar', e: 'parado' };
    if (sim.diaPausa && dia >= sim.diaPausa) return { t: `Pausado pela trava no dia ${sim.diaPausa} — controle mantido`, e: 'pausado' };
    if (dia < DIAS) return { t: `Rodando, dia ${dia} de ${DIAS}`, e: 'rodando' };
    const v = sim.veredito.estado;
    if (v === 'pronto') return { t: 'Pronto para o produtor aprovar', e: 'pronto' };
    if (v === 'sem_ganho') return { t: 'Sem ganho — mantém a oferta atual', e: 'sem_ganho' };
    const pj = sim.veredito.projecao;
    return { t: 'Inconclusivo — mantém a oferta atual', e: 'inconclusivo', sub: pj ? `Se as taxas de agora se mantiverem, faltam cerca de ${num(Math.round(pj.faltam / 100) * 100)} checkouts por grupo.` : '' };
  }

  function renderExperimento() {
    const dia = estado.exp.dia;
    const dur = estado.exp.rodando ? 420 : 520;
    const dom = dominioY();

    $$('#seg-volume button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.volume === estado.volume)));
    const n = (o) => (estado.sims[o] ? estado.sims[o] : null);
    const ult = (o) => (n(o) ? n(o).passos[n(o).passos.length - 1].trt.n : 0);
    $('#c3-volume-nota').innerHTML = `Por grupo em 14 dias: skincare <span class="num">${aprox(Dados.volumes[estado.volume].fator * Dados.experimento.skincare.reduce((s, d) => s + d.t[0], 0))}</span>, viagem <span class="num">${aprox(Dados.volumes[estado.volume].fator * Dados.experimento.viagem.reduce((s, d) => s + d.t[0], 0))}</span>`;
    const am = Calc.tamanhoAmostra(20, 1);
    $('#c3-amostra').innerHTML = `Para enxergar 1 ponto de queda a partir de 20% de conversão, com 95% de confiança e 80% de poder, cada grupo precisa de cerca de <span class="num">${num(Math.round(am / 100) * 100)}</span> checkouts.`;

    const bRodar = $('#btn-rodar');
    bRodar.disabled = estado.exp.rodando;
    bRodar.textContent = dia >= DIAS && !estado.exp.rodando ? 'Rodar de novo' : 'Rodar experimento';
    $('#btn-pular').disabled = dia >= DIAS && !estado.exp.rodando;

    for (const o of ORIGENS) {
      const r = refs[o];
      const sim = estado.sims[o];
      const c = candidata(o);
      r.sub.textContent = `Oferta testada: ${c.prod.nome}, ${brl(c.prod.preco, 0)}`;
      const st = textoStatus(sim, dia);
      r.status.innerHTML = st.t + (st.sub ? `<small>${st.sub}</small>` : '');
      r.status.dataset.estado = st.e;
      const pausado = !!(sim && sim.diaPausa && dia >= sim.diaPausa);
      r.raiz.classList.toggle('pausado', pausado);
      r.raiz.classList.toggle('fim-pronto', !!(sim && dia >= DIAS && !sim.diaPausa && sim.veredito.estado === 'pronto'));
      r.raiz.classList.toggle('sem-dados', dia === 0 || !sim);
      atualizarGrafico(o, dia, dom);

      if (!sim) {
        for (const lado of ['c', 't']) for (const k of Object.keys(r[lado])) limpar(r[lado][k], '—');
        limpar(r.hero, '—'); r.sinal.textContent = ''; limpar(r.lim, '—'); limpar(r.leitura, '—');
        continue;
      }
      const idx = Math.min(dia, sim.passos.length);
      if (idx === 0) {
        for (const lado of ['c', 't']) for (const k of Object.keys(r[lado])) { if (!(lado === 'c' && k === 'aceite')) limpar(r[lado][k], '—'); }
        limpar(r.hero, '—'); r.sinal.textContent = ''; limpar(r.lim, '—'); limpar(r.leitura, '—'); r.acaso.textContent = '';
        r.heroLeg.textContent = 'A diferença na sobra por checkout aparece aqui quando o experimento rodar.';
        continue;
      }
      const p = sim.passos[idx - 1];
      const e = p.est;
      contar(r.c.n, p.ctr.n, (v) => num(v), dur);
      contar(r.t.n, p.trt.n, (v) => num(v), dur);
      contar(r.c.conv, e.conv.ctr * 100, (v) => num(v, 2) + '%', dur);
      contar(r.t.conv, e.conv.trt * 100, (v) => num(v, 2) + '%', dur);
      contar(r.t.aceite, e.aceite * 100, (v) => num(v, 1) + '%', dur);
      contar(r.c.sobra, e.sobra.ctr.media, (v) => brl(v), dur);
      contar(r.t.sobra, e.sobra.trt.media, (v) => brl(v), dur);
      contar(r.hero, e.sobra.dif, (v) => num(Math.abs(v), 2), dur, (v) => { r.sinal.textContent = sinal(v, 2); });
      r.heroLeg.textContent = e.sobra.dif >= 0 ? 'por checkout iniciado a mais que o controle' : 'por checkout iniciado a menos que o controle';
      r.lim.textContent = brlSinal(e.sobra.limInf95);
      r.acaso.textContent = dia >= DIAS && sim.veredito.estado === 'inconclusivo' ? 'A diferença ainda cabe no acaso.' : '';
      r.leitura.textContent = (e.conv.limSup99 >= 0 ? '+' : MENOS) + num(Math.abs(e.conv.limSup99) * 100, 2) + ' pt';
    }
  }

  function resetarExperimento() {
    pararExperimento();
    estado.exp.dia = 0;
  }

  function pararExperimento() {
    estado.exp.token++;
    estado.exp.rodando = false;
  }

  function rodar() {
    if (estado.cena !== 3) irPara(3);
    pararExperimento();
    const token = estado.exp.token;
    estado.exp.dia = 0;
    estado.exp.rodando = true;
    renderExperimento();
    return new Promise((resolver) => {
      const t0 = performance.now();
      let d = 0;
      const passo = () => {
        if (token !== estado.exp.token) return resolver(false);
        d++;
        estado.exp.dia = d;
        if (d >= DIAS) estado.exp.rodando = false;
        renderExperimento();
        if (d >= DIAS) return resolver(true);
        const prox = t0 + 450 + d * DIA_MS - performance.now();
        setTimeout(passo, Math.max(0, prox));
      };
      setTimeout(passo, 450);
    });
  }

  /* Para captura quadro a quadro: mostra o experimento parado num dia (0 a 14). */
  function definirDia(d) {
    if (estado.cena !== 3) irPara(3);
    pararExperimento();
    estado.exp.dia = Math.max(0, Math.min(DIAS, Math.round(Number(d))));
    estado.exp.rodando = estado.exp.dia > 0 && estado.exp.dia < DIAS;
    renderExperimento();
    return Promise.resolve(true);
  }

  function pular() {
    if (estado.cena !== 3) irPara(3);
    pararExperimento();
    estado.exp.dia = DIAS;
    renderExperimento();
    return Promise.resolve(true);
  }

  function definirVolume(v) {
    if (!Dados.volumes[v]) return;
    const terminou = estado.exp.dia >= DIAS;
    pararExperimento();
    estado.volume = v;
    recalcular();
    estado.exp.dia = terminou ? DIAS : 0;
    for (const o of ORIGENS) refs[o].svg = null;
    renderExperimento(); renderDecisao();
  }

  /* ---------- Cena 4: decisão ---------- */

  function veredito(o) {
    const sim = estado.sims[o];
    const { prod, el } = candidata(o);
    const d = estado.decisao[o];
    if (!sim) return { e: 'sem_candidata', t: 'Nenhuma oferta elegível — mantém a oferta atual', sub: '', explica: `A regra reprovou o ${prod.nome}. Nada foi para o teste.`, hero: null };
    const f = sim.final, e = f.est, v = sim.veredito;
    const pr = estado.prem;
    if (v.estado === 'pronto') {
      if (d === 'aprovado') return { e: 'aprovado', t: 'Aprovado pelo produtor', sub: '', explica: `O produtor aprovou. O ${prod.nome} passa a aparecer para todo o tráfego desta origem. Neste protótipo, nada é publicado de verdade.` };
      if (d === 'revertido') return { e: 'pronto', t: 'Voltou para a oferta atual', sub: '', explica: 'O produtor preferiu manter a oferta atual. O tráfego desta origem segue 100% no controle.' };
      return { e: 'pronto', t: 'Pronto para o produtor aprovar', sub: '', explica: `A conversão da venda principal ficou dentro da margem de ${num(pr.margemPP, 1)} ponto, e a sobra por checkout ficou acima do controle com 95% de confiança. O teste durou ${sim.ultimoDia} dias. Nada foi publicado: falta a decisão do produtor.` };
    }
    if (v.estado === 'pausado') return {
      e: 'pausado', t: `Pausado pela trava no dia ${sim.diaPausa}`, sub: 'Controle mantido',
      explica: `O aceite do bump foi mais alto, ${pct(e.aceite, 1)}, mas a conversão da venda principal caiu ${num(Math.abs(e.conv.dif) * 100, 2)} ponto. Com 99% de confiança, o tratamento converte menos que o controle. A trava pausou o teste no dia ${sim.diaPausa} e devolveu todo o tráfego ao controle.`
    };
    if (v.estado === 'sem_ganho') return { e: 'sem_ganho', t: 'Sem ganho — mantém a oferta atual', sub: '', explica: 'A sobra por checkout do tratamento não ficou acima da do controle. Fica a oferta atual.' };
    const pj = v.projecao;
    return {
      e: 'inconclusivo', t: 'Inconclusivo — mantém a oferta atual', sub: '',
      explica: pj
        ? `Com ${num(f.trt.n)} checkouts por grupo, a diferença que apareceu ainda cabe no acaso. Se as taxas de agora se mantiverem, o veredito pediria cerca de ${num(Math.round(pj.porGrupo / 100) * 100)} checkouts por grupo. Até lá, fica a oferta atual.`
        : `Com ${num(f.trt.n)} checkouts por grupo, a diferença que apareceu ainda cabe no acaso. Fica a oferta atual.`
    };
  }

  function registro(o) {
    const sim = estado.sims[o];
    const { prod, el } = candidata(o);
    const it = [];
    it.push({ d: 0, t: `Sugestão criada: ${prod.nome} (texto de modelo de linguagem, escrito antes)` });
    it.push({ d: 0, t: el.ok ? `Regras conferidas: estoque, preço (${num(el.pct, 1)}% do ticket) e categoria passaram` : `Regras conferidas: reprovada (${el.regras.filter((r) => !r.ok).map(motivoRegra).join('; ').toLowerCase()})`, c: el.ok ? '' : 'vermelho' });
    if (!sim) { it.push({ d: 0, t: 'Nada vai para o teste. Fica a oferta atual.', c: 'destaque' }); return it; }
    it.push({ d: 1, t: 'Experimento iniciado: 50% do tráfego em cada grupo' });
    const e = sim.final.est;
    if (sim.diaPausa) {
      it.push({ d: sim.diaPausa, t: `Trava disparada: limite superior de 99% da diferença de conversão em ${sinal(e.conv.limSup99 * 100, 2)}${num(Math.abs(e.conv.limSup99) * 100, 2)} pt, abaixo de zero`, c: 'vermelho' });
      it.push({ d: sim.diaPausa, t: 'Tratamento pausado. Todo o tráfego voltou para o controle' });
      it.push({ d: sim.diaPausa, t: 'Oferta atual mantida. Nada para o produtor aprovar', c: 'destaque' });
    } else {
      it.push({ d: DIAS, t: 'Experimento encerrado. A trava não disparou' });
      const v = sim.veredito;
      if (v.estado === 'pronto') it.push({ d: DIAS, t: 'Aguardando aprovação do produtor', c: 'destaque' });
      else if (v.estado === 'sem_ganho') it.push({ d: DIAS, t: 'Sem ganho por checkout. Oferta atual mantida', c: 'destaque' });
      else it.push({ d: DIAS, t: v.projecao ? `Inconclusivo: faltam cerca de ${num(Math.round(v.projecao.faltam / 100) * 100)} checkouts por grupo. Oferta atual mantida` : 'Inconclusivo. Oferta atual mantida', c: 'destaque' });
    }
    return it.concat(estado.extras[o]);
  }

  function renderDecisao() {
    const caixa = $('#c4-cartoes');
    caixa.innerHTML = ORIGENS.map((o) => {
      const sim = estado.sims[o];
      const { prod } = candidata(o);
      const v = veredito(o);
      const d = estado.decisao[o];
      const pronto = !!(sim && sim.veredito.estado === 'pronto');
      let hero = '', heroLeg = '', sust = '';
      if (sim) {
        const f = sim.final, e = f.est;
        if (sim.veredito.estado === 'pausado') {
          hero = `<span>${sinal(e.conv.dif * 100, 2)}${num(Math.abs(e.conv.dif) * 100, 2)}</span><span class="un">pontos</span>`;
          heroLeg = `de conversão no tratamento: ${pct(e.conv.ctr)} no controle contra ${pct(e.conv.trt)}`;
        } else if (sim.veredito.estado === 'inconclusivo' && sim.veredito.projecao) {
          hero = `<span>${num(Math.round(sim.veredito.projecao.faltam / 100) * 100)}</span>`;
          heroLeg = 'checkouts por grupo a mais para ter veredito';
        } else {
          hero = `<span>${sinal(e.sobra.dif, 2)}</span><span class="mo">R$</span><span>${num(Math.abs(e.sobra.dif), 2)}</span>`;
          heroLeg = e.sobra.dif >= 0 ? 'por checkout iniciado a mais que o controle' : 'por checkout iniciado a menos que o controle';
        }
        const trava = sim.veredito.estado === 'pausado'
          ? `<tr class="trava"><td colspan="2">Trava: limite superior (99%)</td><td class="num mau">${sinal(e.conv.limSup99 * 100, 2)}${num(Math.abs(e.conv.limSup99) * 100, 2)} pt</td></tr>`
          : `<tr class="trava"><td colspan="2">Sobra: limite inferior (95%)</td><td class="num">${brlSinal(e.sobra.limInf95)}</td></tr>`;
        sust = `<table class="sustenta"><thead><tr><th scope="col">Os números</th><th scope="col">Controle</th><th scope="col">Tratamento</th></tr></thead><tbody>
          <tr><td>Checkouts iniciados</td><td class="num">${num(f.ctr.n)}</td><td class="num">${num(f.trt.n)}</td></tr>
          <tr><td>Conversão</td><td class="num">${pct(e.conv.ctr)}</td><td class="num">${pct(e.conv.trt)}</td></tr>
          <tr><td>Aceite do bump</td><td class="nada">sem oferta</td><td class="num">${pct(e.aceite, 1)}</td></tr>
          <tr><td>Sobra por checkout</td><td class="num">${brl(e.sobra.ctr.media)}</td><td class="num">${brl(e.sobra.trt.media)}</td></tr>
          ${trava}
        </tbody></table>`;
      }
      const podeAprovar = pronto && d !== 'aprovado';
      const podeVoltar = pronto && d !== 'revertido';
      const nota = !pronto ? (sim && sim.veredito.estado === 'pausado' ? 'Nada para aprovar: o tráfego já voltou para o controle.' : 'Nada para aprovar: a oferta atual continua.') : '';
      const log = registro(o);
      return `<article class="cartao" data-origem="${o}" data-estado="${v.e}">
        <div class="cartao-esq">
          <div class="cartao-cab"><h2>${Dados.origens[o].nome}</h2><p>Oferta testada: ${prod.nome}, ${brl(prod.preco, 0)}</p></div>
          <p class="veredito">${v.t}${v.sub ? `<small>${v.sub}</small>` : ''}</p>
          <p class="explica">${v.explica}</p>
          ${hero ? `<div class="cartao-num"><p class="valor">${hero}</p><p class="legenda">${heroLeg}</p></div>` : ''}
          <div class="acoes">
            <button type="button" class="btn primario" data-acao="aprovar" data-origem="${o}" ${podeAprovar ? '' : 'disabled'}>Aprovar e publicar</button>
            <button type="button" class="btn" data-acao="reverter" data-origem="${o}" ${podeVoltar ? '' : 'disabled'}>Voltar para a oferta atual</button>
            ${nota ? `<p class="nota">${nota}</p>` : ''}
          </div>
        </div>
        <div class="cartao-dir">
          ${sust}
          <p class="registro-tit">Registro de eventos</p>
          <ol class="registro">${log.map((x, i) => `<li class="${x.c || ''}${x.extra && !x.visto ? ' nova' : ''}" style="--i:${i}"><span class="d">Dia ${x.d}</span><span class="t">${x.t}</span></li>`).join('')}</ol>
        </div>
      </article>`;
    }).join('');
    ORIGENS.forEach((o) => estado.extras[o].forEach((x) => { x.visto = true; }));
  }

  function aprovar(o) {
    const sim = estado.sims[o];
    if (!sim || sim.veredito.estado !== 'pronto' || estado.decisao[o] === 'aprovado') return false;
    estado.decisao[o] = 'aprovado';
    estado.extras[o].push({ extra: true, d: DIAS, t: `Produtor aprovou e publicou: ${candidata(o).prod.nome} para 100% do tráfego desta origem (simulado)`, c: 'verde' });
    renderDecisao();
    return true;
  }
  function reverter(o) {
    const sim = estado.sims[o];
    if (!sim || sim.veredito.estado !== 'pronto' || estado.decisao[o] === 'revertido') return false;
    estado.decisao[o] = 'revertido';
    estado.extras[o].push({ extra: true, d: DIAS, t: 'Produtor voltou para a oferta atual (rollback). Tráfego 100% no controle', c: 'destaque' });
    renderDecisao();
    return true;
  }

  async function revelarRegistro() {
    const raiz = $('#cena-4');
    raiz.classList.remove('revelar');
    void raiz.offsetWidth;
    raiz.classList.add('revelar');
    const token = ++estado.revelar;
    await esperar(2600);
    if (token === estado.revelar) raiz.classList.remove('revelar');
    return true;
  }

  /* ---------- ligações ---------- */

  function ligar() {
    $$('.passos button').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.ir)));
    $('#btn-ant').addEventListener('click', () => irPara(estado.cena - 1));
    $('#btn-prox').addEventListener('click', () => irPara(estado.cena + 1));
    $('#btn-rodar').addEventListener('click', () => { rodar(); });
    $('#btn-pular').addEventListener('click', () => { pular(); });
    $$('#seg-volume button').forEach((b) => b.addEventListener('click', () => definirVolume(b.dataset.volume)));
    $('#btn-prem').addEventListener('click', () => {
      const p = $('#prem');
      const abrir = p.hidden;
      p.hidden = !abrir;
      $('#btn-prem').setAttribute('aria-expanded', String(abrir));
    });
    $('#c4-cartoes').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-acao]');
      if (!b || b.disabled) return;
      if (b.dataset.acao === 'aprovar') aprovar(b.dataset.origem); else reverter(b.dataset.origem);
    });
    document.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, select, textarea')) return;
      if (e.key === 'ArrowRight') irPara(estado.cena + 1);
      if (e.key === 'ArrowLeft') irPara(estado.cena - 1);
      if (e.key === 'Escape') { $('#prem').hidden = true; $('#btn-prem').setAttribute('aria-expanded', 'false'); }
    });
  }

  /* ---------- início ---------- */

  recalcular();
  montarConta();
  montarExperimento();
  montarPremissas();
  ligar();

  const inicial = Math.max(1, Math.min(4, parseInt(params.get('cena'), 10) || 1));
  renderSugestoes();
  renderDecisao();
  irPara(inicial, { semUrl: true });

  /* Rodar a animação da cena atual (também usado pelo modo de gravação). */
  function rodarCena() {
    const n = estado.cena;
    if (n === 1) return animarQueda();
    if (n === 2) return avaliarRegras();
    if (n === 3) return rodar();
    if (n === 4) return revelarRegistro();
    return Promise.resolve(true);
  }

  const fontes = (document.fonts && document.fonts.ready) ? Promise.race([document.fonts.ready, esperar(2500)]) : Promise.resolve();
  const pronto = fontes.then(async () => {
    for (const o of ORIGENS) refs[o].svg = null;
    if (estado.cena === 3) renderExperimento();
    document.documentElement.dataset.pronto = '1';
    if (GRAVAR) {
      await esperar(500);
      return rodarCena();
    }
    return true;
  });

  window.youlift = {
    irPara,
    rodar: rodarCena,
    definirQueda,
    pular,
    definirDia,
    definirVolume,
    aprovar,
    reverter,
    pronto,
    estado: () => ({
      cena: estado.cena,
      queda: estado.conta.queda,
      volume: estado.volume,
      dia: estado.exp.dia,
      rodando: estado.exp.rodando,
      decisao: { ...estado.decisao },
      vereditos: Object.fromEntries(ORIGENS.map((o) => [o, estado.sims[o] ? { estado: estado.sims[o].veredito.estado, diaPausa: estado.sims[o].diaPausa } : null]))
    })
  };
})();
