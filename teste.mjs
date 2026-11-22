/* YouLift — asserções da lógica (rode com: node teste.mjs).
   Importa calc.js e dados.js, os mesmos arquivos que a página carrega. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const C = require('./calc.js');
const D = require('./dados.js');

let ok = 0;
function teste(nome, fn) {
  try { fn(); ok++; console.log('  ok   ' + nome); }
  catch (e) { console.log('  FALHOU ' + nome + '\n         ' + e.message); process.exitCode = 1; }
}
const perto = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} não está a ${tol} de ${b}`);

function sim(origem, volume = 'grande', mexer) {
  const cand = D.catalogo.find((p) => p.id === D.origens[origem].candidata);
  const pr = D.premissas;
  const premissas = {
    custoPrincipal: pr.custoPrincipal,
    custoBump: pr.custoBump[origem],
    comissao: pr.comissaoPct / 100,
    reembolsoCtr: pr.reembolsoPct.controle / 100,
    reembolsoTrt: pr.reembolsoPct[origem] / 100,
    margem: pr.margemPP / 100
  };
  if (mexer) mexer(premissas);
  return C.simular({
    dias: C.escalarDias(D.experimento[origem], D.volumes[volume].fator),
    ticket: D.principal.preco,
    precoBump: cand.preco,
    premissas
  });
}

console.log('Cena 1 — a conta do artigo');
const padrao = { ...D.conta };
const c = C.cenarios(padrao);
teste('Cenário A = R$ 39.400,00 (200 pedidos)', () => { assert.equal(c.A.receita, 39400); assert.equal(c.A.pedidos, 200); });
teste('Cenário B = R$ 41.250,00 (200 pedidos)', () => { assert.equal(c.B.receita, 41250); assert.equal(c.B.pedidos, 200); });
teste('Cenário C = R$ 39.187,50 (190 pedidos)', () => { assert.equal(c.C.receita, 39187.5); assert.equal(c.C.pedidos, 190); });
teste('C fica abaixo de A com queda de 1,0 ponto', () => assert.ok(c.C.receita < c.A.receita));
teste('Ponto de equilíbrio = 0,897 (±0,001)', () => perto(c.equilibrio, 0.897, 0.001));
teste('Na queda = ponto de equilíbrio, C = A (conta fecha)', () => {
  const cc = C.cenarios({ ...padrao, queda: c.equilibrio });
  perto(cc.C.receita, cc.A.receita, 0.01);
});
teste('Abaixo do equilíbrio C > A; acima, C < A', () => {
  assert.ok(C.cenarios({ ...padrao, queda: 0.8 }).C.receita > 39400);
  assert.ok(C.cenarios({ ...padrao, queda: 0.9 }).C.receita < 39400);
});
teste('Sem queda, C = B', () => assert.equal(C.cenarios({ ...padrao, queda: 0 }).C.receita, 41250));

console.log('\nTamanho de amostra');
const amostra = C.tamanhoAmostra(20, 1);
teste(`Amostra para 1 ponto de queda a partir de 20% = ${amostra} (entre 19.000 e 20.500)`, () => assert.ok(amostra >= 19000 && amostra <= 20500));

console.log('\nCena 2 — regras de elegibilidade');
const ctxRegras = { ticket: D.principal.preco, ...D.regras };
const avaliados = D.catalogo.map((p) => ({ p, r: C.elegibilidade(p, ctxRegras) }));
const reprovaPor = (id) => avaliados.filter((x) => x.r.regras.find((g) => g.id === id && !g.ok));
teste('Há produto reprovado por falta de estoque', () => assert.ok(reprovaPor('estoque').length >= 1));
teste('Há produto reprovado por preço acima de 30% do ticket', () => assert.ok(reprovaPor('preco').some((x) => x.r.regras.find((g) => g.id === 'preco').lado === 'acima')));
teste('Há produto reprovado por categoria excluída', () => assert.ok(reprovaPor('categoria').length >= 1));
teste('A regra de preço também barra abaixo de 10% do ticket', () => {
  const r = C.elegibilidade({ preco: 15, estoque: 5, categoria: 'X' }, ctxRegras);
  assert.equal(r.ok, false);
  assert.equal(r.regras.find((g) => g.id === 'preco').lado, 'abaixo');
});
teste('As duas candidatas passam nas três regras', () => {
  for (const o of Object.values(D.origens)) {
    const x = avaliados.find((a) => a.p.id === o.candidata);
    assert.equal(x.r.ok, true, o.candidata);
  }
});
teste('O catálogo tem 6 produtos e a candidata custa R$ 37 em cada origem', () => {
  assert.equal(D.catalogo.length, 6);
  for (const o of Object.values(D.origens)) assert.equal(D.catalogo.find((p) => p.id === o.candidata).preco, 37);
});
teste('Cada trecho citado na justificativa existe no texto do catálogo e na justificativa', () => {
  for (const o of Object.values(D.origens)) {
    const desc = D.catalogo.find((p) => p.id === o.candidata).descricao;
    for (const q of o.citacoes) {
      assert.ok(desc.includes(q), `"${q}" não está no catálogo`);
      assert.ok(o.justificativa.includes('“' + q + '”'), `"${q}" não está na justificativa`);
    }
  }
});

console.log('\nCena 3 — experimento (campanha grande)');
const sk = sim('skincare');
const vi = sim('viagem');
const eSk = sk.final.est;
teste('Skincare não pausa e termina "pronto para aprovar"', () => {
  assert.equal(sk.diaPausa, null);
  assert.equal(sk.ultimoDia, 14);
  assert.equal(sk.veredito.estado, 'pronto');
  assert.ok(sk.veredito.naoInferior && sk.veredito.sobraPositiva);
});
teste('Skincare: conversão não inferior e sobra com limite inferior de 95% acima de zero', () => {
  assert.ok(eSk.conv.dif - 1.645 * eSk.conv.ep > -0.005);
  assert.ok(eSk.sobra.dif - 1.645 * eSk.sobra.ep > 0);
});
teste(`Viagem pausa no dia ${vi.diaPausa} (entre 5 e 8)`, () => assert.ok(vi.diaPausa >= 5 && vi.diaPausa <= 8));
teste('Viagem: a trava dispara pela regra diferença + 2,326 × EP < 0 e não antes', () => {
  const ult = vi.passos[vi.passos.length - 1].est.conv;
  assert.ok(ult.dif + 2.326 * ult.ep < 0);
  for (const p of vi.passos.slice(0, -1)) assert.ok(p.est.conv.dif + 2.326 * p.est.conv.ep >= 0);
});
teste('Viagem termina "pausado" e para de acumular no dia da pausa', () => {
  assert.equal(vi.veredito.estado, 'pausado');
  assert.equal(vi.passos.length, vi.diaPausa);
});
teste('Viagem: aceite do bump mais alto que a skincare, conversão pior que o controle', () => {
  assert.ok(vi.final.est.aceite > eSk.aceite);
  assert.ok(vi.final.est.conv.dif < 0);
});
teste('Erro-padrão confere com a fórmula raiz(p1(1-p1)/n1 + p2(1-p2)/n2)', () => {
  const f = vi.final;
  const p1 = f.trt.k / f.trt.n, p2 = f.ctr.k / f.ctr.n;
  perto(f.est.conv.ep, Math.sqrt(p1 * (1 - p1) / f.trt.n + p2 * (1 - p2) / f.ctr.n), 1e-12);
});
teste('Sobra por checkout = (receita - custo - comissão - reembolsos) ÷ checkouts', () => {
  const g = sk.final.trt;
  const receita = g.k * 197 + g.b * 37;
  const esperado = (receita - (g.k * 58 + g.b * 9) - 0.2 * receita - 0.031 * receita) / g.n;
  perto(eSk.sobra.trt.media, esperado, 1e-9);
});
teste('Variância da sobra por checkout bate com a conta direta sobre os três resultados possíveis', () => {
  const g = sk.final.trt;
  const m = 1 - 0.2 - 0.031;
  const vSem = 197 * m - 58, vCom = 234 * m - 58 - 9;
  const media = ((g.k - g.b) * vSem + g.b * vCom) / g.n;
  const ex2 = ((g.k - g.b) * vSem ** 2 + g.b * vCom ** 2) / g.n;
  perto(eSk.sobra.trt.variancia, (ex2 - media ** 2) * g.n / (g.n - 1), 1e-6);
});
teste('Tratar custo do refil bem mais alto tira a aprovação da skincare', () => {
  const s2 = sim('skincare', 'grande', (p) => { p.custoBump = 60; });
  assert.notEqual(s2.veredito.estado, 'pronto');
});
teste('Mudar premissas de custo não muda o dia da pausa da viagem', () => {
  const v2 = sim('viagem', 'grande', (p) => { p.custoBump = 3; p.comissao = 0.1; });
  assert.equal(v2.diaPausa, vi.diaPausa);
});

console.log('\nCena 3 — volume "produtor pequeno" (×0,07)');
const skP = sim('skincare', 'pequeno');
const viP = sim('viagem', 'pequeno');
teste('Skincare fica inconclusiva', () => assert.equal(skP.veredito.estado, 'inconclusivo'));
teste('Viagem fica inconclusiva (a trava não dispara com pouco volume)', () => {
  assert.equal(viP.diaPausa, null);
  assert.equal(viP.veredito.estado, 'inconclusivo');
});
teste('O volume escalado soma 7% do original (arredondamento acumulado)', () => {
  for (const o of ['skincare', 'viagem']) {
    const orig = D.experimento[o].reduce((s, d) => s + d.t[0], 0);
    const esc = C.escalarDias(D.experimento[o], 0.07).reduce((s, d) => s + d.t[0], 0);
    assert.equal(esc, Math.round(orig * 0.07));
  }
});
teste('Inconclusivo informa quantos checkouts por grupo faltam', () => {
  for (const s of [skP, viP]) {
    const pj = s.veredito.projecao;
    assert.ok(pj && pj.faltam > 0 && pj.porGrupo > s.final.trt.n);
  }
});

console.log('\nIntegridade dos dados congelados');
teste('14 dias por origem, compras <= checkouts, bumps <= compras, controle sem bump', () => {
  for (const o of ['skincare', 'viagem']) {
    const dias = D.experimento[o];
    assert.equal(dias.length, 14);
    for (const d of dias) {
      for (const g of [d.c, d.t]) { assert.ok(g[1] <= g[0] && g[2] <= g[1] && g[0] > 0); }
      assert.equal(d.c[2], 0);
    }
  }
});
teste('Totais perto do descrito: skincare ~30 mil por grupo, viagem ~1.720 por dia', () => {
  const nSk = D.experimento.skincare.reduce((s, d) => s + d.t[0], 0);
  assert.ok(nSk > 29000 && nSk < 31000);
  const nVi = D.experimento.viagem.reduce((s, d) => s + d.t[0], 0) / 14;
  assert.ok(nVi > 1650 && nVi < 1790);
});

console.log('\n' + ok + ' verificações passaram.');
const f = (x, d = 2) => x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
console.log('\nNúmeros finais (campanha grande, premissas padrão)');
for (const [nome, s] of [['skincare', sk], ['viagem', vi]]) {
  const e = s.final.est;
  console.log(`  ${nome}: dia ${s.ultimoDia}${s.diaPausa ? ' (pausa no dia ' + s.diaPausa + ')' : ''} | checkouts ${s.final.ctr.n}/${s.final.trt.n} | conversão ${f(e.conv.ctr * 100)}% / ${f(e.conv.trt * 100)}% | aceite ${f(e.aceite * 100, 1)}% | sobra R$ ${f(e.sobra.ctr.media)} / R$ ${f(e.sobra.trt.media)} (dif ${f(e.sobra.dif)}, limite inferior 95% ${f(e.sobra.limInf95)}) | limite sup. 99% ${f(e.conv.limSup99 * 100)} pt | veredito ${s.veredito.estado}`);
}
for (const [nome, s] of [['skincare', skP], ['viagem', viP]]) {
  const pj = s.veredito.projecao;
  console.log(`  ${nome} (produtor pequeno): checkouts por grupo ${s.final.trt.n} | veredito ${s.veredito.estado} | faltam ${pj.faltam} (chegaria a ${pj.porGrupo})`);
}
console.log(`  amostra para 1 ponto de queda: ${amostra}`);
console.log(`  equilíbrio: ${C.pontoEquilibrio(padrao)}`);
