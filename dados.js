/* YouLift — dados simulados e congelados.
   Tudo aqui é fictício: marca, produtos, creators e números diários.
   Os números diários do experimento foram gerados uma vez por `_gerar-dados.mjs`
   (gerador pseudoaleatório com semente) e colados abaixo. A página nunca sorteia nada. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.YouLiftDados = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const dados = {
    fonte: {
      titulo: 'Blog da YouShop — Order bump e upsell: como aumentar o ticket médio sem perder conversão',
      url: 'https://blog.youshop.co/order-bump-e-upsell-no-checkout/'
    },

    /* Valores da conta do artigo (cena 1). Percentuais em pontos (20 = 20%). */
    conta: { checkouts: 1000, conversao: 20, ticket: 197, precoBump: 37, aceite: 25, queda: 1.0 },

    marca: 'Marca fictícia de cuidados pessoais',
    principal: { nome: 'Kit de rotina completa', preco: 197 },

    /* Regras definidas pelo produtor (fictício). */
    regras: { minPct: 10, maxPct: 30, categoriasExcluidas: ['Fragrâncias'] },

    catalogo: [
      {
        id: 'refil', nome: 'Refil 30 dias', preco: 37, estoque: 1480, categoria: 'Reposição',
        descricao: 'Refil do sérum e do hidratante do kit. Rende 30 dias de uso diário.'
      },
      {
        id: 'necessaire', nome: 'Nécessaire de viagem', preco: 37, estoque: 920, categoria: 'Acessórios',
        descricao: 'Nécessaire impermeável com 3 frascos de 50 ml. Cabe na bagagem de mão.'
      },
      {
        id: 'mascara', nome: 'Máscara de argila (lote limitado)', preco: 49, estoque: 0, categoria: 'Skincare',
        descricao: 'Máscara facial de uso semanal, vendida em lotes pequenos.'
      },
      {
        id: 'serum', nome: 'Sérum de vitamina C 30 ml', preco: 129, estoque: 640, categoria: 'Skincare',
        descricao: 'Sérum concentrado, vendido separado do kit.'
      },
      {
        id: 'agua', nome: 'Água perfumada 100 ml', preco: 45, estoque: 310, categoria: 'Fragrâncias',
        descricao: 'Água perfumada de uso corporal, fragrância cítrica.'
      },
      {
        id: 'toalha', nome: 'Toalha de microfibra', preco: 29, estoque: 2100, categoria: 'Acessórios',
        descricao: 'Toalha de rosto de secagem rápida, vendida em par.'
      }
    ],

    /* Texto fixo, escrito antes. Nenhuma chamada a modelo acontece nesta página.
       As citações precisam aparecer palavra por palavra na descrição do catálogo (o teste confere). */
    origens: {
      skincare: {
        nome: 'Creator de skincare',
        candidata: 'refil',
        justificativa:
          'Quem veio por um vídeo de skincare está começando uma rotina, e o catálogo descreve o refil como “Refil do sérum e do hidratante do kit”. O texto também diz “30 dias de uso diário”, o que cobre o primeiro mês depois da compra.',
        citacoes: ['Refil do sérum e do hidratante do kit', '30 dias de uso diário']
      },
      viagem: {
        nome: 'Creator de viagem',
        candidata: 'necessaire',
        justificativa:
          'Quem veio por um vídeo de viagem precisa levar a rotina na mala, e o catálogo descreve a nécessaire com “3 frascos de 50 ml”. O texto também diz “Cabe na bagagem de mão”, o que resolve o problema de quem viaja com pouco espaço.',
        citacoes: ['3 frascos de 50 ml', 'Cabe na bagagem de mão']
      }
    },

    rotuloIA:
      'Sugestões geradas previamente por um modelo de linguagem a partir do catálogo fictício (sem chamada ao vivo). As regras e as contas rodam nesta página.',

    /* Premissas editáveis do experimento (cena 3). */
    premissas: {
      custoPrincipal: 58,
      custoBump: { skincare: 9, viagem: 14 },
      comissaoPct: 20,
      reembolsoPct: { controle: 3.0, skincare: 3.1, viagem: 4.2 },
      margemPP: 0.5
    },

    volumes: {
      grande: { rotulo: 'Campanha grande', fator: 1 },
      pequeno: { rotulo: 'Produtor pequeno', fator: 0.07 }
    },

    /* Cada dia: c = controle, t = tratamento, [checkouts iniciados, compras, compras com o bump].
       O controle não tem bump novo, então o terceiro número dele é sempre 0. */
    experimento: /*GERADO:INICIO*/ {
      "dias": 14,
      "sementes": {
        "skincare": 3673,
        "viagem": 34291
      },
      "nota": "Números diários simulados, gerados uma vez com gerador pseudoaleatório semeado (mulberry32).",
      "skincare": [
        { "c": [2261, 444, 0], "t": [2198, 467, 129] },
        { "c": [2185, 459, 0], "t": [2135, 458, 132] },
        { "c": [2073, 458, 0], "t": [2090, 448, 126] },
        { "c": [2233, 436, 0], "t": [2231, 441, 124] },
        { "c": [2266, 456, 0], "t": [2316, 460, 126] },
        { "c": [2131, 429, 0], "t": [1989, 429, 104] },
        { "c": [1997, 412, 0], "t": [1912, 373, 112] },
        { "c": [2147, 400, 0], "t": [2273, 468, 117] },
        { "c": [2150, 429, 0], "t": [2130, 404, 108] },
        { "c": [2238, 434, 0], "t": [2124, 456, 120] },
        { "c": [2221, 441, 0], "t": [2160, 407, 107] },
        { "c": [2207, 427, 0], "t": [2324, 448, 129] },
        { "c": [2141, 429, 0], "t": [2059, 404, 102] },
        { "c": [1901, 388, 0], "t": [1906, 376, 94] }
      ],
      "viagem": [
        { "c": [1799, 345, 0], "t": [1726, 332, 106] },
        { "c": [1686, 348, 0], "t": [1740, 323, 99] },
        { "c": [1680, 334, 0], "t": [1853, 355, 131] },
        { "c": [1727, 342, 0], "t": [1673, 314, 118] },
        { "c": [1881, 373, 0], "t": [1763, 305, 92] },
        { "c": [1634, 346, 0], "t": [1727, 322, 103] },
        { "c": [1557, 314, 0], "t": [1593, 282, 91] },
        { "c": [1896, 383, 0], "t": [1772, 350, 112] },
        { "c": [1870, 354, 0], "t": [1771, 300, 104] },
        { "c": [1625, 325, 0], "t": [1592, 293, 91] },
        { "c": [1816, 360, 0], "t": [1680, 336, 107] },
        { "c": [1772, 357, 0], "t": [1750, 322, 117] },
        { "c": [1691, 337, 0], "t": [1698, 293, 102] },
        { "c": [1598, 333, 0], "t": [1582, 320, 96] }
      ]
    } /*GERADO:FIM*/
  };

  return dados;
});
