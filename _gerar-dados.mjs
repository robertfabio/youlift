/* Gerador único dos números diários simulados do YouLift.
   Uso: node _gerar-dados.mjs   (procura a semente de cada origem e reescreve o bloco GERADO de dados.js)
   Depois de rodar, os números ficam congelados em dados.js e a página nunca sorteia nada. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const aqui = dirname(fileURLToPath(import.meta.url));
const calc = require('./calc.js');
const dados = require('./dados.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(r) {
  let u = 0; while (u === 0) u = r();
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const SEMANA = [1.03, 1.0, 0.99, 1.01, 1.04, 0.96, 0.92];

function gerar(semente, cfg) {
  const r = mulberry32(semente);
  const z = () => normal(r);
  const dias = [];
  for (let d = 0; d < 14; d++) {
    const total = Math.round(2 * cfg.base * SEMANA[d % 7] * (1 + 0.025 * z()));
    const nt = Math.round(total / 2 + (Math.sqrt(total) / 2) * z());
    const nc = total - nt;
    const f = 1 + 0.015 * z();
    const pc = cfg.pCtr * f;
    const pt = cfg.pTrt * f;
    const kc = Math.round(nc * pc + Math.sqrt(nc * pc * (1 - pc)) * z());
    const kt = Math.round(nt * pt + Math.sqrt(nt * pt * (1 - pt)) * z());
    const bt = Math.round(kt * cfg.aceite + Math.sqrt(kt * cfg.aceite * (1 - cfg.aceite)) * z());
    dias.push({ c: [nc, kc, 0], t: [nt, kt, bt] });
  }
  return dias;
}

function entradaSim(origem, dias) {
  const cand = dados.catalogo.find((p) => p.id === dados.origens[origem].candidata);
  const pr = dados.premissas;
  return {
    dias,
    ticket: dados.principal.preco,
    precoBump: cand.preco,
    premissas: {
      custoPrincipal: pr.custoPrincipal,
      custoBump: pr.custoBump[origem],
      comissao: pr.comissaoPct / 100,
      reembolsoCtr: pr.reembolsoPct.controle / 100,
      reembolsoTrt: pr.reembolsoPct[origem] / 100,
      margem: pr.margemPP / 100
    }
  };
}

const soma = (dias, lado, i) => dias.reduce((s, d) => s + d[lado][i], 0);
const perto = (x, a, b) => x >= a && x <= b;

const alvos = {
  skincare: {
    cfg: { base: 2150, pCtr: 0.2, pTrt: 0.202, aceite: 0.27 },
    ok(dias) {
      const nc = soma(dias, 'c', 0), nt = soma(dias, 't', 0);
      const cc = soma(dias, 'c', 1) / nc, ct = soma(dias, 't', 1) / nt;
      const ac = soma(dias, 't', 2) / soma(dias, 't', 1);
      if (!perto(cc, 0.1995, 0.2005) || !perto(ct, 0.2015, 0.2025) || !perto(ac, 0.2695, 0.2705)) return false;
      if (!perto(nc, 29800, 30400) || !perto(nt, 29800, 30400)) return false;
      const grande = calc.simular(entradaSim('skincare', dias));
      if (grande.diaPausa || grande.veredito.estado !== 'pronto') return false;
      const ef = grande.final.est;
      if (!perto(ef.sobra.dif, 1.05, 1.35) || !perto(ef.conv.dif, 0.0015, 0.0025)) return false;
      const pequeno = calc.simular(entradaSim('skincare', calc.escalarDias(dias, 0.07)));
      return pequeno.veredito.estado === 'inconclusivo';
    }
  },
  viagem: {
    cfg: { base: 1720, pCtr: 0.2, pTrt: 0.186, aceite: 0.33 },
    ok(dias) {
      const nc = soma(dias, 'c', 0), nt = soma(dias, 't', 0);
      const cc = soma(dias, 'c', 1) / nc, ct = soma(dias, 't', 1) / nt;
      const ac = soma(dias, 't', 2) / soma(dias, 't', 1);
      if (!perto(cc, 0.1995, 0.2005) || !perto(ct, 0.1855, 0.1865) || !perto(ac, 0.328, 0.332)) return false;
      if (!perto(nc, 23800, 24400) || !perto(nt, 23800, 24400)) return false;
      const grande = calc.simular(entradaSim('viagem', dias));
      if (grande.diaPausa !== 6) return false;
      const e6 = grande.final.est;
      if (!perto(e6.conv.dif, -0.0155, -0.0132) || !perto(e6.sobra.dif, -1.1, -0.75)) return false;
      if (grande.passos[3].est.conv.limSup99 < 0) return false;
      if (!perto(e6.aceite, 0.327, 0.333)) return false;
      const pequeno = calc.simular(entradaSim('viagem', calc.escalarDias(dias, 0.07)));
      return pequeno.veredito.estado === 'inconclusivo';
    }
  }
};

const escolhidas = {};
const gerado = {};
for (const origem of Object.keys(alvos)) {
  let achou = null;
  for (let s = (origem === 'viagem' ? 2000 : 1); s < 400000 && !achou; s++) {
    const dias = gerar(s, alvos[origem].cfg);
    if (alvos[origem].ok(dias)) achou = { semente: s, dias };
  }
  if (!achou) throw new Error('nenhuma semente serviu para ' + origem);
  escolhidas[origem] = achou.semente;
  gerado[origem] = achou.dias.map((d) => ({ c: d.c, t: d.t }));
}

const bloco = {
  dias: 14,
  sementes: escolhidas,
  nota: 'Números diários simulados, gerados uma vez com gerador pseudoaleatório semeado (mulberry32).',
  skincare: gerado.skincare,
  viagem: gerado.viagem
};

const arquivo = join(aqui, 'dados.js');
let texto = readFileSync(arquivo, 'utf8');
const corpo = JSON.stringify(bloco, null, 2)
  .replace(/\{\s+"c": \[([^\]]+)\],\s+"t": \[([^\]]+)\]\s+\}/g, (_, c, t) => `{ "c": [${c.replace(/\s+/g, ' ').trim()}], "t": [${t.replace(/\s+/g, ' ').trim()}] }`)
  .split('\n').map((l, i) => (i === 0 ? l : '    ' + l)).join('\n');
texto = texto.replace(/\/\*GERADO:INICIO\*\/[\s\S]*?\/\*GERADO:FIM\*\//, `/*GERADO:INICIO*/ ${corpo} /*GERADO:FIM*/`);
writeFileSync(arquivo, texto);
console.log('sementes', escolhidas);
