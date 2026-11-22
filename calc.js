/* YouLift — cálculos puros (sem DOM, sem sorteio).
   Funciona no navegador (window.YouLiftCalc) e no Node (require/import). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.YouLiftCalc = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Valores críticos da normal usados na página. */
  const Z = Object.freeze({
    trava: 2.326,       // trava: limite superior do intervalo unilateral de 99%
    naoInferior: 1.645, // não inferioridade da conversão: 95% unilateral
    ic95: 1.645,        // sobra por checkout: limite inferior de 95% unilateral
    alfa: 1.645,        // tamanho de amostra: 95% de confiança unilateral
    poder: 0.842        // tamanho de amostra: 80% de poder
  });

  const centavos = (x) => Math.round(x * 100) / 100;
  const limpa = (x) => Math.round(x * 1e6) / 1e6;

  /* ---------- Cena 1: a conta do artigo ---------- */

  /* Todos os percentuais entram em pontos (20 = 20%). */
  function pontoEquilibrio(p) {
    const receitaPorPedidoComBump = p.ticket + (p.aceite / 100) * p.precoBump;
    return p.conversao - (p.conversao * p.ticket) / receitaPorPedidoComBump;
  }

  function cenarios(p) {
    const pedidosA = limpa((p.checkouts * p.conversao) / 100);
    const pedidosC = limpa((p.checkouts * (p.conversao - p.queda)) / 100);
    const porPedidoComBump = p.ticket + (p.aceite / 100) * p.precoBump;
    const A = { pedidos: pedidosA, receita: centavos(pedidosA * p.ticket) };
    const B = { pedidos: pedidosA, receita: centavos(pedidosA * porPedidoComBump) };
    const Cc = { pedidos: pedidosC, receita: centavos(pedidosC * porPedidoComBump) };
    return {
      A, B, C: Cc,
      difB: centavos(B.receita - A.receita),
      difC: centavos(Cc.receita - A.receita),
      equilibrio: pontoEquilibrio(p)
    };
  }

  /* Checkouts por grupo para enxergar `queda` pontos a partir de `base`%,
     com 95% de confiança unilateral e 80% de poder (variância da conversão-base). */
  function tamanhoAmostra(base, queda) {
    const p = base / 100;
    const d = queda / 100;
    return Math.ceil((2 * p * (1 - p) * Math.pow(Z.alfa + Z.poder, 2)) / (d * d));
  }

  /* ---------- Cena 2: regras de elegibilidade ---------- */

  function elegibilidade(produto, ctx) {
    const pct = (produto.preco / ctx.ticket) * 100;
    const minPct = ctx.minPct == null ? 10 : ctx.minPct;
    const maxPct = ctx.maxPct == null ? 30 : ctx.maxPct;
    const excluidas = ctx.categoriasExcluidas || [];
    const regras = [
      { id: 'estoque', ok: produto.estoque > 0, valor: produto.estoque },
      {
        id: 'preco',
        ok: pct >= minPct && pct <= maxPct,
        valor: pct,
        lado: pct > maxPct ? 'acima' : pct < minPct ? 'abaixo' : null
      },
      { id: 'categoria', ok: excluidas.indexOf(produto.categoria) === -1, valor: produto.categoria }
    ];
    return { ok: regras.every((r) => r.ok), regras, pct };
  }

  /* ---------- Cena 3: experimento ---------- */

  /* dias: [{c:[n,k,b], t:[n,k,b]}] — n checkouts, k compras, b compras com bump.
     Escala o volume com arredondamento acumulado (os totais ficam exatos). */
  function escalarDias(dias, fator) {
    if (fator === 1) return dias;
    const acum = [0, 0, 0, 0, 0, 0];
    const ant = [0, 0, 0, 0, 0, 0];
    return dias.map((d) => {
      const atual = d.c.concat(d.t);
      const saida = atual.map((v, i) => {
        acum[i] += v;
        const alvo = Math.round(acum[i] * fator);
        const delta = alvo - ant[i];
        ant[i] = alvo;
        return delta;
      });
      const c = saida.slice(0, 3);
      const t = saida.slice(3);
      c[1] = Math.min(c[1], c[0]); t[1] = Math.min(t[1], t[0]);
      c[2] = Math.min(c[2], c[1]); t[2] = Math.min(t[2], t[1]);
      return { c, t };
    });
  }

  /* Sobra por checkout iniciado de um grupo:
     (receita - custo dos produtos - comissão - reembolsos e chargebacks) / checkouts.
     Cada checkout vale 0 (não comprou), vSem (comprou sem bump) ou vCom (comprou com bump);
     daí sai a variância amostral usada nos intervalos. */
  function sobraGrupo(g, x) {
    const receita = g.k * x.ticket + g.b * x.precoBump;
    const custo = g.k * x.custoPrincipal + g.b * x.custoBump;
    const comissao = x.comissao * receita;
    const reembolso = x.reembolso * receita;
    const liquido = receita - custo - comissao - reembolso;
    if (!g.n) return { n: 0, receita, custo, comissao, reembolso, liquido, media: 0, variancia: 0 };
    const media = liquido / g.n;
    const m = 1 - x.comissao - x.reembolso;
    const vSem = x.ticket * m - x.custoPrincipal;
    const vCom = (x.ticket + x.precoBump) * m - x.custoPrincipal - x.custoBump;
    const kSem = g.k - g.b;
    const ex2 = (kSem * vSem * vSem + g.b * vCom * vCom) / g.n;
    const variancia = g.n > 1 ? Math.max(0, (ex2 - media * media) * (g.n / (g.n - 1))) : 0;
    return { n: g.n, receita, custo, comissao, reembolso, liquido, media, variancia, vSem, vCom };
  }

  function estatisticas(c, t, ctxC, ctxT) {
    const p2 = c.n ? c.k / c.n : 0;
    const p1 = t.n ? t.k / t.n : 0;
    const dif = p1 - p2;
    const ep = c.n && t.n ? Math.sqrt((p1 * (1 - p1)) / t.n + (p2 * (1 - p2)) / c.n) : 0;
    const sc = sobraGrupo(c, ctxC);
    const st = sobraGrupo(t, ctxT);
    const difS = st.media - sc.media;
    const epS = c.n && t.n ? Math.sqrt(st.variancia / t.n + sc.variancia / c.n) : 0;
    return {
      conv: {
        ctr: p2, trt: p1, dif, ep,
        limSup99: dif + Z.trava * ep,
        limInfNI: dif - Z.naoInferior * ep
      },
      aceite: t.k ? t.b / t.k : 0,
      sobra: { ctr: sc, trt: st, dif: difS, ep: epS, limInf95: difS - Z.ic95 * epS, limSup95: difS + Z.ic95 * epS }
    };
  }

  function somarAte(dias, ate, lado) {
    const s = { n: 0, k: 0, b: 0 };
    for (let i = 0; i < ate; i++) {
      s.n += dias[i][lado][0]; s.k += dias[i][lado][1]; s.b += dias[i][lado][2];
    }
    return s;
  }

  /* Quantos checkouts por grupo o veredito pediria se as taxas atuais se mantivessem. */
  function projecao(passo, margem) {
    const e = passo.est;
    const n = passo.trt.n;
    let fNI = Infinity, fS = Infinity, fP = Infinity;
    if (e.conv.dif + margem > 0) fNI = Math.pow((Z.naoInferior * e.conv.ep) / (e.conv.dif + margem), 2);
    if (e.sobra.dif > 0) fS = Math.pow((Z.ic95 * e.sobra.ep) / e.sobra.dif, 2);
    if (e.conv.dif < 0) fP = Math.pow((Z.trava * e.conv.ep) / -e.conv.dif, 2);
    const fAprovar = Math.max(fNI, fS, 1);
    const f = Math.min(fAprovar, fP);
    if (!isFinite(f)) return null;
    const necessario = Math.ceil(n * f);
    return {
      porGrupo: necessario,
      faltam: Math.max(0, necessario - n),
      resolveCom: fP <= fAprovar ? 'trava' : 'aprovacao'
    };
  }

  /* entrada.dias já deve vir na escala de volume desejada.
     entrada.premissas: { custoPrincipal, custoBump, comissao (0-1), reembolsoCtr (0-1),
                          reembolsoTrt (0-1), margem (0-1) }  */
  function simular(entrada) {
    const { dias, ticket, precoBump, premissas: pr } = entrada;
    const ctxC = { ticket, precoBump: 0, custoPrincipal: pr.custoPrincipal, custoBump: 0, comissao: pr.comissao, reembolso: pr.reembolsoCtr };
    const ctxT = { ticket, precoBump, custoPrincipal: pr.custoPrincipal, custoBump: pr.custoBump, comissao: pr.comissao, reembolso: pr.reembolsoTrt };
    const passos = [];
    let diaPausa = null;
    for (let d = 1; d <= dias.length; d++) {
      const c = somarAte(dias, d, 'c');
      const t = somarAte(dias, d, 't');
      const est = estatisticas(c, t, ctxC, ctxT);
      const pausa = est.conv.limSup99 < 0;
      passos.push({ dia: d, ctr: c, trt: t, est, pausa });
      if (pausa) { diaPausa = d; break; }
    }
    const final = passos[passos.length - 1];
    const e = final.est;
    const naoInferior = e.conv.limInfNI > -pr.margem;
    const sobraPositiva = e.sobra.limInf95 > 0;
    let estado;
    if (diaPausa) estado = 'pausado';
    else if (naoInferior && sobraPositiva) estado = 'pronto';
    else if (e.sobra.limSup95 < 0) estado = 'sem_ganho';
    else estado = 'inconclusivo';
    return {
      passos,
      diaPausa,
      ultimoDia: final.dia,
      final,
      veredito: {
        estado,
        naoInferior,
        sobraPositiva,
        projecao: estado === 'inconclusivo' ? projecao(final, pr.margem) : null
      },
      ctx: { controle: ctxC, tratamento: ctxT }
    };
  }

  return { Z, centavos, pontoEquilibrio, cenarios, tamanhoAmostra, elegibilidade, escalarDias, sobraGrupo, estatisticas, projecao, simular };
});
