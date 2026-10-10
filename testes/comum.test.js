// Testes das funções puras de js/comum.js. Rodar com: node --test testes/
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  slug,
  gerarIdProduto,
  gerarIdCategoria,
  normalizarBusca,
  formatarPreco,
  centavosParaTexto,
  lerPreco,
  precoMinimo,
  hojeLocal,
  somarDias,
  ehNovidade,
  agoraISOLocal,
  formatarDataBR,
  formatarDiaMes,
  formatarDataHoraBR,
  bytesParaBase64,
  base64ParaBytes,
  textoParaBase64,
  base64ParaTexto,
  ordenarProdutos,
  ordenarCategorias,
  proximaOrdemProduto,
  proximaOrdemCategoria,
  normalizarCatalogo,
  imagemPermitida,
  aplicarAlteracoes,
  compactarOps,
  fotosPendentesUsadas,
  validarCatalogo,
} from '../js/comum.js';

// As datas são testadas no horário de Brasília, onde mora o problema das 21h.
process.env.TZ = 'America/Sao_Paulo';

const NBSP = ' ';

function catalogo() {
  return {
    versao: 1,
    atualizadoEm: '2026-10-09T20:00:00-03:00',
    categorias: [
      { id: 'camisetas', nome: 'Camisetas', ordem: 1 },
      { id: 'biblias', nome: 'Bíblias', ordem: 2 },
      { id: 'outros', nome: 'Outros', ordem: 3 },
    ],
    produtos: [
      { id: 'camiseta-jesus-a1', categoria: 'camisetas', nome: 'Camiseta Jesus', precoCentavos: 7450, imagem: '', miniatura: '', visivel: true, ordem: 10 },
      { id: 'biblia-estudo-a2', categoria: 'biblias', nome: 'Bíblia de Estudo', precoCentavos: 8990, imagem: '', miniatura: '', visivel: true, ordem: 10, novidadeAte: '2026-11-09' },
      { id: 'caneca-a3', categoria: 'outros', nome: 'Caneca', precoCentavos: 3990, imagem: '', miniatura: '', visivel: false, ordem: 10 },
    ],
  };
}

describe('slug e ids', () => {
  test('slug tira acentos, minúsculas e troca o resto por "-"', () => {
    assert.equal(slug('Camiseta Fé e Graça'), 'camiseta-fe-e-graca');
    assert.equal(slug('  Bíblia — Edição “Especial”!  '), 'biblia-edicao-especial');
    assert.equal(slug('Kit   de   Oração (2025)'), 'kit-de-oracao-2025');
    assert.equal(slug('ÇÃÕÉÜ'), 'caoeu');
    assert.equal(slug('---'), '');
    assert.equal(slug(''), '');
    assert.equal(slug(null), '');
  });

  test('gerarIdProduto = slug + "-" + Date.now() em base 36', () => {
    const agora = 1760050800000;
    assert.equal(gerarIdProduto('Caneca Cristã', agora), `caneca-crista-${agora.toString(36)}`);
    assert.match(gerarIdProduto('Caneca'), /^caneca-[a-z0-9]+$/);
    assert.match(gerarIdProduto('!!!', agora), /^produto-[a-z0-9]+$/);
  });

  test('gerarIdCategoria acrescenta -2, -3… quando já existe', () => {
    assert.equal(gerarIdCategoria('Bíblias', []), 'biblias');
    assert.equal(gerarIdCategoria('Bíblias', ['biblias']), 'biblias-2');
    assert.equal(gerarIdCategoria('Bíblias', ['biblias', 'biblias-2']), 'biblias-3');
    assert.equal(gerarIdCategoria('Bíblias', ['biblias', 'biblias-3']), 'biblias-2');
  });
});

describe('busca sem acentos', () => {
  test('normalizarBusca ignora acentos, maiúsculas e espaços extras', () => {
    assert.equal(normalizarBusca('  BÍBLIA   Graça  '), 'biblia graca');
    assert.equal(normalizarBusca('Oração'), 'oracao');
    assert.equal(normalizarBusca(undefined), '');
  });

  test('"biblia" encontra "Bíblia de Estudo" e "CAMISETA" encontra "Camiseta Jesus"', () => {
    const nomes = catalogo().produtos.map((p) => p.nome);
    const buscar = (termo) => nomes.filter((n) => normalizarBusca(n).includes(normalizarBusca(termo)));
    assert.deepEqual(buscar('biblia'), ['Bíblia de Estudo']);
    assert.deepEqual(buscar('BÍBLIA'), ['Bíblia de Estudo']);
    assert.deepEqual(buscar('CAMISETA'), ['Camiseta Jesus']);
    assert.deepEqual(buscar('xyz'), []);
  });
});

describe('lerPreco (todos os exemplos da seção 10.4)', () => {
  const aceitos = [
    ['74', 7400],
    ['74,5', 7450],
    ['74,50', 7450],
    ['R$ 74,50', 7450],
    ['1.234,50', 123450],
    ['1.234', 123400],
    ['0,29', 29],
    ['1,15', 115],
    ['74.50', 7450],
    ['74.5', 7450],
    [`R$${NBSP}74,50`, 7450], // como o próprio formatarPreco escreve
    ['R$74,50', 7450],
    ['  74,50  ', 7450],
    ['100.000,00', 10000000], // o limite exato ainda vale
    ['0,01', 1],
  ];
  for (const [texto, centavos] of aceitos) {
    test(`aceita ${JSON.stringify(texto)} → ${centavos}`, () => {
      assert.equal(lerPreco(texto), centavos);
    });
  }

  const recusados = [
    '', '   ', 'R$', null, undefined,
    '0', '0,00', '0,0',
    '-5', '-74,50', 'R$ -1',
    'abc', '12a', 'R$ dez', '74,50 reais',
    '74,505', '0,001', '1.234,567',
    '100.000,01', '100001', '1.000.000',
    '74.', ',50', '1.2.3', '74,5,0',
  ];
  for (const texto of recusados) {
    test(`recusa ${JSON.stringify(texto)} → null`, () => {
      assert.equal(lerPreco(texto), null);
    });
  }

  test('sem ponto flutuante: nenhum valor de 0,01 a 2,00 perde centavo', () => {
    for (let c = 1; c <= 200; c++) {
      const texto = `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')}`;
      assert.equal(lerPreco(texto), c, texto);
    }
  });
});

describe('formatarPreco', () => {
  test('usa "R$" + U+00A0 (espaço que não quebra)', () => {
    assert.equal(formatarPreco(0), `R$${NBSP}0,00`);
    assert.equal(formatarPreco(5), `R$${NBSP}0,05`);
    assert.equal(formatarPreco(7450), `R$${NBSP}74,50`);
    assert.equal(formatarPreco(123450), `R$${NBSP}1.234,50`);
    assert.ok(!formatarPreco(7450).includes(' '), 'não pode ter espaço comum');
  });

  test('centavosParaTexto preenche o campo do painel', () => {
    assert.equal(centavosParaTexto(7450), '74,50');
    assert.equal(centavosParaTexto(123450), '1.234,50');
    assert.equal(lerPreco(centavosParaTexto(123450)), 123450, 'ida e volta');
  });

  test('precoMinimo considera as variações ("a partir de")', () => {
    assert.equal(precoMinimo({ precoCentavos: 7450 }), 7450);
    assert.equal(precoMinimo({ precoCentavos: 7450, variacoes: [{ nome: 'Infantil', precoCentavos: 5990 }] }), 5990);
  });
});

describe('datas locais e Novidade', () => {
  test('hojeLocal usa o dia local, não o UTC (21h30 em Brasília ainda é o mesmo dia)', () => {
    const noite = new Date('2026-10-10T00:30:00Z'); // 09/10 às 21h30 em Brasília
    assert.equal(hojeLocal(noite), '2026-10-09');
    assert.notEqual(noite.toISOString().slice(0, 10), hojeLocal(noite), 'o jeito errado daria o dia seguinte');
    assert.equal(hojeLocal(new Date(2026, 0, 5, 0, 0)), '2026-01-05');
  });

  test('somarDias soma sem passar por UTC (Novidade = hoje + 30)', () => {
    assert.equal(somarDias('2026-10-09', 30), '2026-11-08');
    assert.equal(somarDias('2026-12-15', 30), '2027-01-14');
    assert.equal(somarDias('2028-02-28', 1), '2028-02-29');
    assert.equal(somarDias('2026-03-01', -1), '2026-02-28');
  });

  test('ehNovidade compara como texto e vale até o último dia', () => {
    const p = { novidadeAte: '2026-11-09' };
    assert.equal(ehNovidade(p, '2026-10-09'), true);
    assert.equal(ehNovidade(p, '2026-11-09'), true, 'no próprio dia ainda é novidade');
    assert.equal(ehNovidade(p, '2026-11-10'), false);
    assert.equal(ehNovidade({}, '2026-10-09'), false);
    assert.equal(ehNovidade({ novidadeAte: '2026-1-9' }, '2026-01-01'), false, 'formato inválido');
    assert.equal(ehNovidade({ novidadeAte: '2026-10-09' }, hojeLocal(new Date('2026-10-10T00:30:00Z'))), true);
  });

  test('agoraISOLocal grava com o deslocamento local (-03:00)', () => {
    const instante = new Date(Date.UTC(2026, 9, 9, 23, 0, 0));
    assert.equal(agoraISOLocal(instante), '2026-10-09T20:00:00-03:00');
    assert.equal(new Date(agoraISOLocal(instante)).getTime(), instante.getTime());
    assert.match(agoraISOLocal(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  test('formatação de datas para exibir', () => {
    assert.equal(formatarDataBR('2026-10-09T20:00:00-03:00'), '09/10/2026');
    assert.equal(formatarDataBR('2026-10-09T23:30:00-03:00'), '09/10/2026');
    assert.equal(formatarDataBR('não é data'), '');
    assert.equal(formatarDiaMes('2026-11-09'), '09/11');
    assert.equal(formatarDiaMes('lixo'), '');
    assert.equal(formatarDataHoraBR('2026-10-09T20:05:00-03:00'), '09/10 às 20:05');
  });
});

describe('base64 ↔ UTF-8', () => {
  const frase = 'Bíblia Graça — “Fé” 🙏';

  test('ida e volta sem corromper acentos, aspas curvas e emoji', () => {
    const b64 = textoParaBase64(frase);
    assert.equal(b64, Buffer.from(frase, 'utf8').toString('base64'));
    assert.equal(base64ParaTexto(b64), frase);
  });

  test('aceita o base64 com quebras de linha que a API do GitHub devolve', () => {
    const b64 = Buffer.from(frase.repeat(10), 'utf8').toString('base64');
    const comQuebras = b64.replace(/.{1,60}/g, '$&\n');
    assert.ok(comQuebras.includes('\n'));
    assert.equal(base64ParaTexto(comQuebras), frase.repeat(10));
  });

  test('bytes grandes (fotos) não estouram a pilha', () => {
    const bytes = new Uint8Array(300 * 1024).map((_, i) => (i * 31) % 256);
    const b64 = bytesParaBase64(bytes);
    assert.equal(b64, Buffer.from(bytes).toString('base64'));
    assert.deepEqual(base64ParaBytes(b64), bytes);
  });
});

describe('ordem e catálogo', () => {
  test('produtos por ordem e depois por nome em pt-BR', () => {
    const ordenados = ordenarProdutos([
      { nome: 'Zebra', ordem: 10 }, { nome: 'Água', ordem: 20 }, { nome: 'Ébano', ordem: 20 }, { nome: 'Abacate', ordem: 20 },
    ]).map((p) => p.nome);
    assert.deepEqual(ordenados, ['Zebra', 'Abacate', 'Água', 'Ébano']);
    assert.deepEqual(ordenarCategorias(catalogo().categorias.reverse()).map((c) => c.id), ['camisetas', 'biblias', 'outros']);
  });

  test('próxima ordem: produto = maior da categoria + 10; categoria = maior + 1', () => {
    const { produtos, categorias } = catalogo();
    assert.equal(proximaOrdemProduto(produtos, 'camisetas'), 20);
    assert.equal(proximaOrdemProduto(produtos, 'categoria-vazia'), 10);
    assert.equal(proximaOrdemCategoria(categorias), 4);
    assert.equal(proximaOrdemCategoria([]), 1);
  });

  test('imagemPermitida só aceita caminhos dentro de img/produtos/', () => {
    assert.equal(imagemPermitida('img/produtos/caneca-a3-lq9.webp'), true);
    assert.equal(imagemPermitida('img/produtos/caneca-a3-lq9-mini.jpg'), true);
    assert.equal(imagemPermitida('https://images.unsplash.com/foto.jpg'), false);
    assert.equal(imagemPermitida('/img/produtos/x.webp'), false);
    assert.equal(imagemPermitida('img/produtos/../../segredo'), false);
  });

  test('normalizarCatalogo descarta só o produto quebrado', () => {
    const dados = catalogo();
    dados.produtos.push({ id: 'sem-preco', categoria: 'outros', nome: 'Sem preço' });
    const limpo = normalizarCatalogo(dados);
    assert.equal(limpo.produtos.length, 3);
    assert.throws(() => normalizarCatalogo({ produtos: [] }));
  });
});

describe('rascunho: compactarOps + aplicarAlteracoes', () => {
  const novo = {
    id: 'caneca-nova-b1', categoria: 'outros', nome: 'Caneca Nova', precoCentavos: 2500,
    imagem: 'pendente:foto-1', miniatura: 'pendente:foto-1-mini', visivel: true, ordem: 20,
  };
  const criar = { tipo: 'produto', acao: 'criar', id: novo.id, dados: novo, rotulo: 'Caneca Nova' };

  test('criar + alterar = um "criar" com os dados atualizados', () => {
    const base = catalogo();
    let ops = compactarOps([], criar, base);
    ops = compactarOps(ops, { tipo: 'produto', acao: 'alterar', id: novo.id, campos: { precoCentavos: 2990, info: 'Branca' } }, base);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].acao, 'criar');
    assert.equal(ops[0].dados.precoCentavos, 2990);
    assert.equal(ops[0].dados.info, 'Branca');
  });

  test('criar + excluir = nada (e a foto pendente deixa de ser usada)', () => {
    const base = catalogo();
    let ops = compactarOps([], criar, base);
    assert.deepEqual([...fotosPendentesUsadas(ops)].sort(), ['foto-1', 'foto-1-mini']);
    ops = compactarOps(ops, { tipo: 'produto', acao: 'excluir', id: novo.id }, base);
    assert.deepEqual(ops, []);
    assert.equal(fotosPendentesUsadas(ops).size, 0);
  });

  test('vários "alterar" viram um só, com os campos mesclados', () => {
    const base = catalogo();
    let ops = compactarOps([], { tipo: 'produto', acao: 'alterar', id: 'camiseta-jesus-a1', campos: { precoCentavos: 7990 } }, base);
    ops = compactarOps(ops, { tipo: 'produto', acao: 'alterar', id: 'camiseta-jesus-a1', campos: { info: 'P ao GG' } }, base);
    assert.deepEqual(ops, [{ tipo: 'produto', acao: 'alterar', id: 'camiseta-jesus-a1', campos: { precoCentavos: 7990, info: 'P ao GG' } }]);
  });

  test('alterar + excluir = excluir', () => {
    const base = catalogo();
    let ops = compactarOps([], { tipo: 'produto', acao: 'alterar', id: 'caneca-a3', campos: { visivel: true } }, base);
    ops = compactarOps(ops, { tipo: 'produto', acao: 'excluir', id: 'caneca-a3', rotulo: 'Caneca' }, base);
    assert.deepEqual(ops, [{ tipo: 'produto', acao: 'excluir', id: 'caneca-a3', rotulo: 'Caneca' }]);
  });

  test('um "alterar" que volta ao valor original desaparece', () => {
    const base = catalogo();
    let ops = compactarOps([], { tipo: 'produto', acao: 'alterar', id: 'camiseta-jesus-a1', campos: { precoCentavos: 7990 } }, base);
    ops = compactarOps(ops, { tipo: 'produto', acao: 'alterar', id: 'camiseta-jesus-a1', campos: { precoCentavos: 7450 } }, base);
    assert.deepEqual(ops, []);
    ops = compactarOps([], { tipo: 'produto', acao: 'alterar', id: 'camiseta-jesus-a1', campos: { nome: 'Camiseta Jesus' } }, base);
    assert.deepEqual(ops, [], 'alterar sem mudança real nem entra');
  });

  test('compactarOps não mexe no array recebido', () => {
    const base = catalogo();
    const ops = [Object.freeze({ tipo: 'produto', acao: 'alterar', id: 'camiseta-jesus-a1', campos: Object.freeze({ precoCentavos: 7990 }) })];
    const copia = structuredClone(ops);
    compactarOps(ops, { tipo: 'produto', acao: 'alterar', id: 'camiseta-jesus-a1', campos: { info: 'x' } }, base);
    assert.deepEqual(ops, copia);
  });

  test('aplicar o rascunho compactado dá o mesmo resultado que aplicar passo a passo', () => {
    const base = catalogo();
    const passos = [
      criar,
      { tipo: 'produto', acao: 'alterar', id: novo.id, campos: { precoCentavos: 2990 } },
      { tipo: 'produto', acao: 'alterar', id: 'camiseta-jesus-a1', campos: { precoCentavos: 7990 } },
      { tipo: 'produto', acao: 'alterar', id: 'camiseta-jesus-a1', campos: { info: 'P ao GG' } },
      { tipo: 'produto', acao: 'alterar', id: 'biblia-estudo-a2', campos: { novidadeAte: null } },
      { tipo: 'produto', acao: 'excluir', id: 'caneca-a3' },
    ];
    let ops = [];
    for (const op of passos) ops = compactarOps(ops, op, base);
    assert.equal(ops.length, 4);
    const compactado = aplicarAlteracoes(base, ops).dados;
    const passoAPasso = aplicarAlteracoes(base, passos).dados;
    assert.deepEqual(compactado, passoAPasso);
    assert.equal(compactado.produtos.find((p) => p.id === novo.id).precoCentavos, 2990);
    assert.ok(!('novidadeAte' in compactado.produtos.find((p) => p.id === 'biblia-estudo-a2')), 'null remove o campo');
    assert.ok(!compactado.produtos.some((p) => p.id === 'caneca-a3'));
  });

  test('aplicarAlteracoes não altera a base nem as ops', () => {
    const base = catalogo();
    const copiaBase = structuredClone(base);
    const ops = [criar, { tipo: 'produto', acao: 'alterar', id: 'camiseta-jesus-a1', campos: { precoCentavos: 1 } }];
    const copiaOps = structuredClone(ops);
    const { dados } = aplicarAlteracoes(base, ops);
    dados.produtos[0].nome = 'mudado depois';
    assert.deepEqual(base, copiaBase);
    assert.deepEqual(ops, copiaOps);
  });

  test('"criar" com id que já existe não duplica', () => {
    const base = catalogo();
    const { dados } = aplicarAlteracoes(base, [{ tipo: 'produto', acao: 'criar', id: 'caneca-a3', dados: { ...base.produtos[2], nome: 'Outra' } }]);
    assert.equal(dados.produtos.filter((p) => p.id === 'caneca-a3').length, 1);
    assert.equal(dados.produtos.find((p) => p.id === 'caneca-a3').nome, 'Caneca');
  });

  test('item excluído em outro aparelho: a alteração é descartada com aviso', () => {
    const base = catalogo();
    const ops = [
      { tipo: 'produto', acao: 'alterar', id: 'produto-sumiu-z9', campos: { precoCentavos: 100 }, rotulo: 'Boné Sara' },
      { tipo: 'categoria', acao: 'alterar', id: 'categoria-sumiu', campos: { nome: 'Acessórios' }, rotulo: 'Acessórios' },
      { tipo: 'produto', acao: 'excluir', id: 'tambem-sumiu' },
    ];
    const { dados, avisos } = aplicarAlteracoes(base, ops);
    assert.deepEqual(dados, base);
    assert.equal(avisos.length, 2);
    assert.match(avisos[0], /"Boné Sara" foi excluído em outro aparelho; sua alteração foi descartada/);
    assert.match(avisos[1], /"Acessórios" foi excluído em outro aparelho/);
  });

  test('categoria com produto OCULTO não é excluída', () => {
    const base = catalogo(); // "caneca-a3" está oculto na categoria "outros"
    const { dados, avisos } = aplicarAlteracoes(base, [{ tipo: 'categoria', acao: 'excluir', id: 'outros', rotulo: 'Outros' }]);
    assert.ok(dados.categorias.some((c) => c.id === 'outros'));
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /"Outros" ainda tem produtos \(inclusive ocultos\)/);
  });

  test('categoria sai quando o mesmo rascunho tira os produtos dela', () => {
    const base = catalogo();
    const { dados, avisos } = aplicarAlteracoes(base, [
      { tipo: 'categoria', acao: 'excluir', id: 'outros' },
      { tipo: 'produto', acao: 'alterar', id: 'caneca-a3', campos: { categoria: 'camisetas' } },
    ]);
    assert.ok(!dados.categorias.some((c) => c.id === 'outros'));
    assert.deepEqual(avisos, []);
  });
});

describe('validarCatalogo', () => {
  test('catálogo correto não tem erros', () => {
    assert.deepEqual(validarCatalogo(catalogo()), []);
  });

  test('o data/produtos.json do repositório está válido', () => {
    const dados = JSON.parse(readFileSync(new URL('../data/produtos.json', import.meta.url), 'utf8'));
    assert.deepEqual(validarCatalogo(dados), []);
    assert.equal(dados.produtos.length, 20);
  });

  const casos = [
    ['categoria inexistente', (d) => { d.produtos[0].categoria = 'nao-existe'; }, /Camiseta Jesus.*categoria não existe/],
    ['nome vazio', (d) => { d.produtos[0].nome = '   '; }, /falta o nome/],
    ['preço zero', (d) => { d.produtos[0].precoCentavos = 0; }, /preço inválido/],
    ['preço com vírgula (float)', (d) => { d.produtos[0].precoCentavos = 74.5; }, /preço inválido/],
    ['preço em texto', (d) => { d.produtos[0].precoCentavos = 'R$ 74,50'; }, /preço inválido/],
    ['variação com preço inválido', (d) => { d.produtos[0].variacoes = [{ nome: 'Infantil', precoCentavos: -1 }]; }, /variação 1 tem preço inválido/],
    ['variação sem nome', (d) => { d.produtos[0].variacoes = [{ nome: '', precoCentavos: 100 }]; }, /variação 1 está sem nome/],
    ['id repetido', (d) => { d.produtos[1].id = d.produtos[0].id; }, /id repetido/],
    ['foto ainda pendente', (d) => { d.produtos[0].imagem = 'pendente:foto-1'; }, /foto ainda não foi enviada/],
    ['foto com URL externa', (d) => { d.produtos[0].imagem = 'https://exemplo.com/x.jpg'; }, /caminho de foto inválido/],
    ['data de novidade inválida', (d) => { d.produtos[0].novidadeAte = '09/11/2026'; }, /data de novidade inválida/],
    ['categoria repetida', (d) => { d.categorias.push({ id: 'outros', nome: 'Outros 2', ordem: 9 }); }, /Categoria repetida/],
  ];
  for (const [nome, estragar, erroEsperado] of casos) {
    test(`acusa: ${nome}`, () => {
      const dados = catalogo();
      estragar(dados);
      const erros = validarCatalogo(dados);
      assert.ok(erros.some((e) => erroEsperado.test(e)), `erros: ${JSON.stringify(erros)}`);
    });
  }

  test('"pendente:" só passa com permitirPendentes', () => {
    const dados = catalogo();
    dados.produtos[0].imagem = 'pendente:foto-1';
    dados.produtos[0].miniatura = 'pendente:foto-1-mini';
    assert.deepEqual(validarCatalogo(dados, { permitirPendentes: true }), []);
    assert.equal(validarCatalogo(dados).length, 2);
  });
});
