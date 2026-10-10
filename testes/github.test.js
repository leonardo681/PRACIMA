// Testes de js/github.js com um GitHub falso (nenhuma chamada de rede de verdade).
// Rodar com: node --test testes/
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  criarClienteGitHub,
  aguardarNoAr,
  ErroGitHub,
  OWNER,
  REPO,
  BRANCH,
  API,
  API_VERSION,
  CAMINHO_PRODUTOS,
  CAMINHO_IGREJA,
} from '../js/github.js';
import { agoraISOLocal, validarCatalogo } from '../js/comum.js';

const TOKEN = 'chave-falsa-so-para-teste';
const AGORA = Date.UTC(2026, 9, 10, 0, 30, 0);
const CARIMBO = AGORA.toString(36);
const REPO_API = `/repos/${OWNER}/${REPO}`;
const FRASE = 'Bíblia Graça — “Fé” 🙏';

/* ---------- Dados de exemplo ---------- */

function catalogoBase() {
  return {
    versao: 1,
    atualizadoEm: '2026-10-01T10:00:00-03:00',
    categorias: [
      { id: 'camisetas', nome: 'Camisetas', ordem: 1 },
      { id: 'biblias', nome: 'Bíblias', ordem: 2 },
      { id: 'outros', nome: 'Outros', ordem: 3 },
    ],
    produtos: [
      {
        id: 'camiseta-jesus-a1', categoria: 'camisetas', nome: 'Camiseta Jesus', precoCentavos: 7450,
        imagem: `img/produtos/camiseta-jesus-a1-${CARIMBO}.webp`,
        miniatura: `img/produtos/camiseta-jesus-a1-${CARIMBO}-mini.webp`,
        visivel: true, ordem: 10,
      },
      { id: 'biblia-estudo-a2', categoria: 'biblias', nome: 'Bíblia de Estudo', precoCentavos: 8990, imagem: '', miniatura: '', visivel: true, ordem: 10 },
      { id: 'caneca-a3', categoria: 'outros', nome: 'Caneca', precoCentavos: 3990, imagem: '', miniatura: '', visivel: false, ordem: 10 },
    ],
  };
}

function igrejaBase() {
  return {
    nome: 'Igreja Sara Nossa Terra Biguaçu',
    slogan: 'Uma igreja para você',
    cultos: [{ dia: 'Terça', horario: '20h', nome: 'Fé e Milagres' }],
    loja: { pagamentos: [], local: '', horario: '', aviso: 'Vendas somente presenciais.' },
  };
}

const paraJSON = (dados) => JSON.stringify(dados, null, 2) + '\n';
// A API de conteúdo do GitHub devolve o base64 quebrado em linhas de 60 caracteres.
const base64ComQuebras = (texto) => Buffer.from(texto, 'utf8').toString('base64').replace(/.{1,60}/g, '$&\n');
const fotoFalsa = (chave) => Buffer.from(`bytes da ${chave}`).toString('base64');

function congelar(valor) {
  if (valor && typeof valor === 'object') {
    Object.values(valor).forEach(congelar);
    Object.freeze(valor);
  }
  return valor;
}

/* ---------- GitHub falso ---------- */

function resposta(status, corpo, headers = {}) {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

function nomeDaRota(metodo, caminho) {
  if (caminho === '/user') return `${metodo} user`;
  const resto = caminho.startsWith(`${REPO_API}/`) ? caminho.slice(REPO_API.length + 1) : caminho;
  if (resto === `git/ref/heads/${BRANCH}`) return `${metodo} ref`;
  if (resto === `git/refs/heads/${BRANCH}`) return `${metodo} refs`;
  if (resto === `contents/${CAMINHO_PRODUTOS}`) return `${metodo} produtos`;
  if (resto === `contents/${CAMINHO_IGREJA}`) return `${metodo} igreja`;
  if (resto === 'git/trees') return `${metodo} trees`;
  if (resto.startsWith('git/commits')) return metodo === 'GET' ? 'GET commit' : `${metodo} commits`;
  if (resto.startsWith('git/blobs')) return metodo === 'GET' ? 'GET blob' : `${metodo} blobs`;
  return `${metodo} ${resto}`;
}

// Guarda trees e commits de verdade: o PATCH só aceita fast-forward, como o GitHub.
// "forcar" = respostas forçadas por rota, em fila ({ status, corpo, headers }, um Error para simular
// falha de rede, ou null para deixar aquela chamada passar normalmente).
function criarGitHubFalso({ arquivos, extrasNaArvore = {}, forcar = {}, aoChamar, arquivoGrande = false } = {}) {
  let contador = 0;
  const novoSha = (tipo) => `${tipo}-${++contador}`;
  const trees = new Map();
  const commits = new Map();
  const blobs = new Map();

  const iniciais = arquivos ?? { [CAMINHO_PRODUTOS]: paraJSON(catalogoBase()), [CAMINHO_IGREJA]: paraJSON(igrejaBase()) };
  const arvoreInicial = new Map();
  for (const [caminho, texto] of Object.entries(iniciais)) if (texto !== undefined) arvoreInicial.set(caminho, { content: texto });
  for (const [caminho, entrada] of Object.entries(extrasNaArvore)) arvoreInicial.set(caminho, entrada);
  trees.set('tree-inicial', arvoreInicial);
  commits.set('head-inicial', { tree: 'tree-inicial', parents: [], message: 'inicial' });

  const estado = { head: 'head-inicial' };
  const chamadas = [];

  const arvoreDoHead = () => trees.get(commits.get(estado.head).tree);
  const lerNoHead = (caminho) => arvoreDoHead().get(caminho)?.content;

  // Outro aparelho publica um commit em cima do head atual.
  function publicarNoOutroAparelho(mudar) {
    const dados = JSON.parse(lerNoHead(CAMINHO_PRODUTOS));
    mudar(dados);
    const arvore = new Map(arvoreDoHead());
    arvore.set(CAMINHO_PRODUTOS, { content: paraJSON(dados) });
    const treeSha = novoSha('tree-outro');
    trees.set(treeSha, arvore);
    const commitSha = novoSha('commit-outro');
    commits.set(commitSha, { tree: treeSha, parents: [estado.head], message: 'Catálogo: outro aparelho' });
    estado.head = commitSha;
  }

  function responder(rota, url, corpo) {
    const ultimo = url.pathname.split('/').pop();
    switch (rota) {
      case 'GET user':
        return resposta(200, { login: OWNER });
      case 'GET ref':
        return resposta(200, { ref: `refs/heads/${BRANCH}`, object: { sha: estado.head, type: 'commit' } });
      case 'GET commit': {
        const commit = commits.get(ultimo);
        if (!commit) return resposta(404, { message: 'Not Found' });
        return resposta(200, { sha: ultimo, tree: { sha: commit.tree }, parents: commit.parents.map((sha) => ({ sha })) });
      }
      case 'GET produtos':
      case 'GET igreja': {
        const caminho = rota === 'GET produtos' ? CAMINHO_PRODUTOS : CAMINHO_IGREJA;
        const commit = commits.get(url.searchParams.get('ref'));
        const arquivo = commit && trees.get(commit.tree).get(caminho);
        if (!arquivo) return resposta(404, { message: 'Not Found' });
        if (arquivoGrande) {
          const sha = `blob-grande-${caminho.replace(/[^a-z0-9]/gi, '-')}`;
          blobs.set(sha, { content: Buffer.from(arquivo.content, 'utf8').toString('base64'), encoding: 'base64' });
          return resposta(200, { type: 'file', path: caminho, encoding: 'none', content: '', sha, size: 2_000_000 });
        }
        return resposta(200, {
          type: 'file', path: caminho, encoding: 'base64', content: base64ComQuebras(arquivo.content),
          sha: `sha-${caminho}`, size: Buffer.byteLength(arquivo.content),
        });
      }
      case 'GET blob': {
        const blob = blobs.get(ultimo);
        if (!blob) return resposta(404, { message: 'Not Found' });
        return resposta(200, { sha: ultimo, content: base64ComQuebras(Buffer.from(blob.content, 'base64').toString('utf8')), encoding: 'base64' });
      }
      case 'POST blobs': {
        const sha = novoSha('blob');
        blobs.set(sha, corpo);
        return resposta(201, { sha });
      }
      case 'POST trees': {
        const base = trees.get(corpo.base_tree);
        if (!base) return resposta(422, { message: 'Invalid tree info' });
        const arvore = new Map(base);
        for (const e of corpo.tree) {
          if (e.sha === null) arvore.delete(e.path);
          else if (typeof e.content === 'string') arvore.set(e.path, { content: e.content });
          else if (blobs.has(e.sha)) arvore.set(e.path, { sha: e.sha });
          else return resposta(422, { message: 'tree.sha is not a valid blob' });
        }
        const sha = novoSha('tree');
        trees.set(sha, arvore);
        return resposta(201, { sha });
      }
      case 'POST commits': {
        if (!trees.has(corpo.tree)) return resposta(422, { message: 'Tree not found' });
        const sha = novoSha('commit');
        commits.set(sha, { tree: corpo.tree, parents: corpo.parents, message: corpo.message });
        return resposta(201, { sha });
      }
      case 'PATCH refs': {
        const commit = commits.get(corpo.sha);
        if (!commit) return resposta(422, { message: 'Object does not exist' });
        if (corpo.force !== true && !commit.parents.includes(estado.head)) {
          return resposta(422, { message: 'Update is not a fast forward' });
        }
        estado.head = corpo.sha;
        return resposta(200, { ref: `refs/heads/${BRANCH}`, object: { sha: corpo.sha, type: 'commit' } });
      }
      default:
        return resposta(404, { message: 'Not Found' });
    }
  }

  const github = {
    chamadas,
    estado,
    commits,
    blobs,
    lerNoHead,
    arvoreDoHead,
    publicarNoOutroAparelho,
    async fetch(endereco, init = {}) {
      const url = new URL(endereco);
      const metodo = init.method ?? 'GET';
      const corpo = init.body === undefined ? undefined : JSON.parse(init.body);
      const rota = nomeDaRota(metodo, url.pathname);
      const chamada = { rota, metodo, url: endereco, caminho: url.pathname + url.search, headers: { ...init.headers }, cache: init.cache, corpo };
      chamadas.push(chamada);
      if (aoChamar) await aoChamar(chamada, github);
      const fila = forcar[rota];
      if (fila && fila.length) {
        const forcada = fila.shift();
        if (forcada instanceof Error) throw forcada;
        if (forcada) return resposta(forcada.status, forcada.corpo ?? { message: `Erro ${forcada.status}` }, forcada.headers);
      }
      return responder(rota, url, corpo);
    },
  };
  return github;
}

// Cliente com relógio falso: "esperar" resolve na hora e só avança o relógio.
function montar(github, extras = {}) {
  const relogio = { agora: AGORA };
  const esperas = [];
  const cliente = criarClienteGitHub({
    token: TOKEN,
    fetch: github.fetch,
    esperar: (ms) => {
      esperas.push(ms);
      relogio.agora += ms;
      return Promise.resolve();
    },
    agora: () => relogio.agora,
    ...extras,
  });
  return { cliente, esperas, relogio };
}

const rotas = (github) => github.chamadas.map((c) => c.rota);
const contar = (github, rota) => github.chamadas.filter((c) => c.rota === rota).length;
const escritas = (github) => github.chamadas.filter((c) => c.metodo !== 'GET');
const corpos = (github, rota) => github.chamadas.filter((c) => c.rota === rota).map((c) => c.corpo);

function obterFotoFalsa(pedidas = []) {
  return async (chave) => {
    pedidas.push(chave);
    return { base64: fotoFalsa(chave), extensao: 'webp' };
  };
}

function erroDoTipo(tipo, mensagem) {
  return (erro) => {
    assert.ok(erro instanceof ErroGitHub, `esperava ErroGitHub, veio ${erro?.name}: ${erro?.message}`);
    assert.equal(erro.tipo, tipo);
    if (mensagem !== undefined) assert.equal(erro.message, mensagem);
    return true;
  };
}

function nuncaForce(github) {
  for (const corpo of corpos(github, 'PATCH refs')) assert.equal(corpo.force, false);
  for (const c of github.chamadas) assert.notEqual(c.corpo?.force, true);
}

const SEQUENCIA_LEITURA = ['GET ref', 'GET commit', 'GET produtos', 'GET igreja'];
const SEQUENCIA_GRAVACAO = ['POST trees', 'POST commits', 'PATCH refs'];

const opPreco = (precoCentavos = 7990) =>
  ({ tipo: 'produto', acao: 'alterar', id: 'camiseta-jesus-a1', campos: { precoCentavos }, rotulo: 'Camiseta Jesus' });

const opCriarComFoto = (id = 'caneca-nova-b1', uuid = 'aaaa-1111') => ({
  tipo: 'produto', acao: 'criar', id, rotulo: 'Caneca Nova',
  dados: {
    id, categoria: 'outros', nome: 'Caneca Nova', precoCentavos: 2500,
    imagem: `pendente:foto-${uuid}`, miniatura: `pendente:foto-${uuid}-mini`, visivel: true, ordem: 20,
  },
});

/* ---------- Testes ---------- */

describe('constantes e cabeçalhos', () => {
  test('constantes do contrato', () => {
    assert.equal(OWNER, 'leonardo681');
    assert.equal(REPO, 'PRACIMA');
    assert.equal(BRANCH, 'main');
    assert.equal(API, 'https://api.github.com');
    assert.equal(API_VERSION, '2026-03-10');
  });

  test('toda chamada leva os cabeçalhos exatos e cache: "no-store"', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    await cliente.validarChave();
    await cliente.usuario();
    await cliente.publicar({ ops: [opPreco(), opCriarComFoto()], obterFoto: obterFotoFalsa() });
    assert.ok(github.chamadas.length >= 10);
    for (const c of github.chamadas) {
      const esperado = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${TOKEN}`,
        'X-GitHub-Api-Version': API_VERSION,
      };
      if (c.metodo === 'POST' || c.metodo === 'PATCH') esperado['Content-Type'] = 'application/json';
      assert.deepEqual(c.headers, esperado, `${c.metodo} ${c.caminho}`);
      assert.equal(c.cache, 'no-store', `${c.metodo} ${c.caminho}`);
      assert.ok(c.url.startsWith(`${API}/`));
    }
  });

  test('sem chave nenhuma não chega a chamar a rede', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github, { token: '  ' });
    await assert.rejects(cliente.lerDados(), erroDoTipo('chave-invalida', 'Chave do GitHub inválida ou expirada.'));
    assert.equal(github.chamadas.length, 0);
  });

  test('chave colada com caractere invisível vira "chave inválida", não "sem conexão"', async () => {
    for (const token of [`${TOKEN}​`, `github_pat_${'á'}bc`, 'github_pat_ab cd']) {
      const github = criarGitHubFalso();
      const { cliente } = montar(github, { token });
      await assert.rejects(cliente.validarChave(), erroDoTipo('chave-invalida', 'Chave do GitHub inválida ou expirada.'));
      assert.equal(github.chamadas.length, 0);
    }
  });
});

describe('validarChave e usuario', () => {
  test('201 → ok, com POST git/blobs {content:"teste", encoding:"utf-8"} e nada mais', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    assert.equal(await cliente.validarChave(), true);
    assert.deepEqual(rotas(github), ['POST blobs']);
    assert.equal(github.chamadas[0].caminho, `${REPO_API}/git/blobs`);
    assert.deepEqual(github.chamadas[0].corpo, { content: 'teste', encoding: 'utf-8' });
    assert.equal(contar(github, 'POST commits'), 0, 'não cria commit');
  });

  test('401 → chave inválida ou expirada', async () => {
    const github = criarGitHubFalso({ forcar: { 'POST blobs': [{ status: 401, corpo: { message: 'Bad credentials' } }] } });
    const { cliente } = montar(github);
    await assert.rejects(cliente.validarChave(), erroDoTipo('chave-invalida', 'Chave do GitHub inválida ou expirada.'));
  });

  for (const status of [403, 404]) {
    test(`${status} → sem permissão de escrita`, async () => {
      const github = criarGitHubFalso({ forcar: { 'POST blobs': [{ status, corpo: { message: 'Resource not accessible by personal access token' } }] } });
      const { cliente } = montar(github);
      await assert.rejects(
        cliente.validarChave(),
        erroDoTipo('sem-permissao', 'Esta chave não tem permissão de escrita no repositório PRACIMA (Contents: Read and write).'),
      );
    });
  }

  test('usuario() devolve o login de GET /user', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    assert.equal(await cliente.usuario(), 'leonardo681');
    assert.deepEqual(github.chamadas.map((c) => `${c.metodo} ${c.caminho}`), ['GET /user']);
  });
});

describe('lerDados', () => {
  test('ref → commit → conteúdo (produtos e igreja) no head, decodificado em UTF-8', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    const r = await cliente.lerDados();
    assert.deepEqual(rotas(github), SEQUENCIA_LEITURA);
    assert.deepEqual(github.chamadas.map((c) => c.caminho), [
      `${REPO_API}/git/ref/heads/main`,
      `${REPO_API}/git/commits/head-inicial`,
      `${REPO_API}/contents/data/produtos.json?ref=head-inicial`,
      `${REPO_API}/contents/data/igreja.json?ref=head-inicial`,
    ]);
    assert.equal(r.headSha, 'head-inicial');
    assert.deepEqual(r.produtos, catalogoBase());
    assert.equal(r.produtos.categorias[1].nome, 'Bíblias');
    assert.deepEqual(r.igreja, igrejaBase());
    assert.equal(r.igreja.nome, 'Igreja Sara Nossa Terra Biguaçu');
  });

  test('igreja.json faltando → igreja = null (sem erro)', async () => {
    const github = criarGitHubFalso({ arquivos: { [CAMINHO_PRODUTOS]: paraJSON(catalogoBase()) } });
    const { cliente } = montar(github);
    const r = await cliente.lerDados();
    assert.equal(r.igreja, null);
    assert.equal(r.produtos.produtos.length, 3);
  });

  test('igreja.json com erro de digitação → igreja = null (sem erro)', async () => {
    const github = criarGitHubFalso({
      arquivos: { [CAMINHO_PRODUTOS]: paraJSON(catalogoBase()), [CAMINHO_IGREJA]: '{ "nome": "Sara", }' },
    });
    const { cliente } = montar(github);
    assert.equal((await cliente.lerDados()).igreja, null);
  });

  test('produtos.json com erro de digitação → erro de validação explicando como voltar', async () => {
    const github = criarGitHubFalso({ arquivos: { [CAMINHO_PRODUTOS]: '{ "produtos": [ }' } });
    const { cliente } = montar(github);
    await assert.rejects(cliente.lerDados(), (e) => {
      erroDoTipo('validacao')(e);
      assert.match(e.message, /data\/produtos\.json.*History/);
      return true;
    });
  });

  test('produtos.json inexistente → nao-encontrado', async () => {
    const github = criarGitHubFalso({ arquivos: { [CAMINHO_IGREJA]: paraJSON(igrejaBase()) } });
    const { cliente } = montar(github);
    await assert.rejects(cliente.lerDados(), (e) => {
      erroDoTipo('nao-encontrado')(e);
      assert.match(e.message, /data\/produtos\.json/);
      return true;
    });
  });

  test('arquivo acima de 1 MB (encoding "none") é lido pelo blob', async () => {
    const github = criarGitHubFalso({ arquivoGrande: true });
    const { cliente } = montar(github);
    const r = await cliente.lerDados();
    assert.deepEqual(r.produtos, catalogoBase());
    assert.deepEqual(r.igreja, igrejaBase());
    assert.deepEqual(rotas(github), ['GET ref', 'GET commit', 'GET produtos', 'GET blob', 'GET igreja', 'GET blob']);
  });
});

describe('publicar: fluxo feliz', () => {
  test('sequência exata ref → commit → contents → trees → commits → PATCH, um commit só', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    const r = await cliente.publicar({ ops: [opPreco()], resumo: 'Camiseta Jesus: preço' });

    assert.deepEqual(rotas(github), [...SEQUENCIA_LEITURA, ...SEQUENCIA_GRAVACAO]);
    assert.equal(contar(github, 'POST commits'), 1);
    assert.equal(contar(github, 'PATCH refs'), 1);
    assert.equal(github.chamadas.at(-1).caminho, `${REPO_API}/git/refs/heads/main`);

    const [tree] = corpos(github, 'POST trees');
    assert.equal(tree.base_tree, 'tree-inicial');
    assert.equal(tree.tree.length, 1, 'só o catálogo (igreja não foi mexida)');
    assert.deepEqual(Object.keys(tree.tree[0]).sort(), ['content', 'mode', 'path', 'type']);
    assert.equal(tree.tree[0].path, 'data/produtos.json');
    assert.equal(tree.tree[0].mode, '100644');
    assert.equal(tree.tree[0].type, 'blob');

    const [commit] = corpos(github, 'POST commits');
    assert.equal(commit.message, 'Catálogo: Camiseta Jesus: preço');
    assert.deepEqual(commit.parents, ['head-inicial']);

    const [patch] = corpos(github, 'PATCH refs');
    assert.deepEqual(patch, { sha: r.commitSha, force: false });
    assert.equal(github.estado.head, r.commitSha);

    // O que voltou é exatamente o que foi commitado.
    assert.equal(tree.tree[0].content, JSON.stringify(r.produtos, null, 2) + '\n');
    assert.equal(github.lerNoHead(CAMINHO_PRODUTOS), tree.tree[0].content);
    assert.equal(r.produtos.produtos.find((p) => p.id === 'camiseta-jesus-a1').precoCentavos, 7990);
    assert.equal(r.produtos.atualizadoEm, agoraISOLocal(new Date(AGORA)));
    assert.deepEqual(r.igreja, igrejaBase(), 'sem igreja nova, devolve a do repositório');
    assert.deepEqual(r.avisos, []);
    nuncaForce(github);
  });

  test('escritas em série com o intervalo entre elas', async () => {
    const github = criarGitHubFalso();
    const { cliente, esperas } = montar(github);
    await cliente.publicar({ ops: [opCriarComFoto()], obterFoto: obterFotoFalsa() });
    // 5 escritas (2 blobs, tree, commit, PATCH) → 4 intervalos de 500 ms
    assert.equal(escritas(github).length, 5);
    assert.deepEqual(esperas, [500, 500, 500, 500]);

    const github2 = criarGitHubFalso();
    const { cliente: semIntervalo, esperas: esperas2 } = montar(github2, { intervaloEscritaMs: 0 });
    await semIntervalo.publicar({ ops: [opPreco()] });
    assert.deepEqual(esperas2, []);
  });

  test('mensagem do commit sem resumo', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    await cliente.publicar({ ops: [opPreco(), opCriarComFoto()], obterFoto: obterFotoFalsa(), igreja: igrejaBase() });
    assert.equal(corpos(github, 'POST commits')[0].message, 'Catálogo: 2 alterações e informações da igreja');
  });

  test('conteúdo do tree em texto UTF-8 puro (acentos, aspas curvas e emoji intactos)', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    const op = {
      tipo: 'produto', acao: 'criar', id: 'biblia-graca-c1', rotulo: FRASE,
      dados: { id: 'biblia-graca-c1', categoria: 'biblias', nome: FRASE, descricao: 'Edição “especial” — coração', precoCentavos: 12990, imagem: '', miniatura: '', visivel: true, ordem: 20 },
    };
    const r = await cliente.publicar({ ops: [op] });
    const entrada = corpos(github, 'POST trees')[0].tree.find((e) => e.path === CAMINHO_PRODUTOS);
    assert.equal(typeof entrada.content, 'string');
    assert.ok(!('encoding' in entrada), 'sem base64 no tree');
    assert.ok(entrada.content.includes(`"nome": "${FRASE}"`));
    assert.ok(entrada.content.includes('"nome": "Bíblias"'), 'o que veio do GitHub também continua certo');
    assert.ok(!/Ã|�/.test(entrada.content), 'nada de texto corrompido');
    assert.ok(entrada.content.endsWith('}\n'));
    assert.equal(r.produtos.produtos.find((p) => p.id === 'biblia-graca-c1').nome, FRASE);
  });

  test('igreja vai no MESMO commit quando é informada', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    const igreja = { ...igrejaBase(), loja: { pagamentos: ['Pix', 'cartão', 'dinheiro'], local: 'Balcão da loja', horario: 'Antes e depois dos cultos', aviso: 'Vendas somente presenciais.' } };
    const r = await cliente.publicar({ ops: [opPreco()], igreja });

    assert.equal(contar(github, 'POST commits'), 1);
    assert.equal(contar(github, 'PATCH refs'), 1);
    const entradas = corpos(github, 'POST trees')[0].tree;
    assert.deepEqual(entradas.map((e) => e.path), [CAMINHO_PRODUTOS, CAMINHO_IGREJA]);
    assert.equal(entradas[1].content, JSON.stringify(igreja, null, 2) + '\n');
    assert.deepEqual(r.igreja, igreja);
    assert.equal(github.lerNoHead(CAMINHO_IGREJA), entradas[1].content);
    assert.equal(github.lerNoHead(CAMINHO_PRODUTOS), entradas[0].content);
  });

  test('só a igreja (rascunho de produtos vazio) também publica num commit', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    const igreja = { ...igrejaBase(), slogan: 'Uma igreja para você!' };
    const r = await cliente.publicar({ ops: [], igreja });
    assert.deepEqual(r.igreja, igreja);
    assert.equal(corpos(github, 'POST commits')[0].message, 'Catálogo: informações da igreja');
  });

  test('aoProgresso recebe as etapas, e um erro nele não derruba a publicação', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    const mensagens = [];
    await cliente.publicar({
      ops: [opCriarComFoto('caneca-nova-b1', 'aaaa'), opCriarComFoto('caneca-azul-b2', 'bbbb')],
      obterFoto: obterFotoFalsa(),
      aoProgresso: (texto) => {
        mensagens.push(texto);
        throw new Error('tela quebrou');
      },
    });
    assert.ok(mensagens.includes('Enviando foto 1 de 2…'));
    assert.ok(mensagens.includes('Enviando foto 2 de 2…'));
    assert.equal(github.estado.head, github.chamadas.filter((c) => c.rota === 'PATCH refs').at(-1).corpo.sha);
  });
});

describe('publicar: fotos', () => {
  test('fotos pendentes viram blobs e caminhos img/produtos/{id}-{carimbo}(.webp|-mini.webp)', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    const pedidas = [];
    const r = await cliente.publicar({ ops: [opCriarComFoto()], obterFoto: obterFotoFalsa(pedidas) });

    assert.deepEqual(rotas(github), [...SEQUENCIA_LEITURA, 'POST blobs', 'POST blobs', ...SEQUENCIA_GRAVACAO]);
    assert.deepEqual(pedidas, ['foto-aaaa-1111', 'foto-aaaa-1111-mini']);
    assert.deepEqual(corpos(github, 'POST blobs'), [
      { content: fotoFalsa('foto-aaaa-1111'), encoding: 'base64' },
      { content: fotoFalsa('foto-aaaa-1111-mini'), encoding: 'base64' },
    ]);

    const caneca = r.produtos.produtos.find((p) => p.id === 'caneca-nova-b1');
    assert.equal(caneca.imagem, `img/produtos/caneca-nova-b1-${CARIMBO}.webp`);
    assert.equal(caneca.miniatura, `img/produtos/caneca-nova-b1-${CARIMBO}-mini.webp`);
    assert.deepEqual(validarCatalogo(r.produtos), []);

    const entradas = corpos(github, 'POST trees')[0].tree;
    assert.deepEqual(entradas.slice(0, 2), [
      { path: caneca.imagem, mode: '100644', type: 'blob', sha: 'blob-1' },
      { path: caneca.miniatura, mode: '100644', type: 'blob', sha: 'blob-2' },
    ]);
    assert.ok(!entradas.at(-1).content.includes('pendente:'));
    assert.equal(github.arvoreDoHead().get(caneca.imagem).sha, 'blob-1');
  });

  test('extensão jpg (Safari do iPhone) também funciona', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    const r = await cliente.publicar({
      ops: [opCriarComFoto()],
      obterFoto: async (chave) => ({ base64: fotoFalsa(chave), extensao: 'jpg' }),
    });
    const caneca = r.produtos.produtos.find((p) => p.id === 'caneca-nova-b1');
    assert.equal(caneca.imagem, `img/produtos/caneca-nova-b1-${CARIMBO}.jpg`);
    assert.equal(caneca.miniatura, `img/produtos/caneca-nova-b1-${CARIMBO}-mini.jpg`);
  });

  test('aceita o tipo do Blob como extensão e tira o prefixo "data:" do base64', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    const r = await cliente.publicar({
      ops: [opCriarComFoto()],
      obterFoto: async (chave) => ({ base64: `data:image/jpeg;base64,${fotoFalsa(chave)}`, extensao: 'image/jpeg' }),
    });
    const caneca = r.produtos.produtos.find((p) => p.id === 'caneca-nova-b1');
    assert.equal(caneca.imagem, `img/produtos/caneca-nova-b1-${CARIMBO}.jpg`);
    assert.equal(caneca.miniatura, `img/produtos/caneca-nova-b1-${CARIMBO}-mini.jpg`);
    assert.deepEqual(corpos(github, 'POST blobs')[0], { content: fotoFalsa('foto-aaaa-1111'), encoding: 'base64' });
  });

  test('nunca reaproveita um caminho de foto que já existe, e não apaga as fotos antigas', async () => {
    const antigas = {
      [`img/produtos/camiseta-jesus-a1-${CARIMBO}.webp`]: { sha: 'blob-antigo' },
      [`img/produtos/camiseta-jesus-a1-${CARIMBO}-mini.webp`]: { sha: 'blob-antigo-mini' },
    };
    const github = criarGitHubFalso({ extrasNaArvore: antigas });
    const { cliente } = montar(github);
    const op = {
      tipo: 'produto', acao: 'alterar', id: 'camiseta-jesus-a1', rotulo: 'Camiseta Jesus',
      campos: { imagem: 'pendente:foto-cccc', miniatura: 'pendente:foto-cccc-mini' },
    };
    const r = await cliente.publicar({ ops: [op], obterFoto: obterFotoFalsa() });
    const camiseta = r.produtos.produtos.find((p) => p.id === 'camiseta-jesus-a1');
    assert.equal(camiseta.imagem, `img/produtos/camiseta-jesus-a1-${CARIMBO}-2.webp`);
    assert.equal(camiseta.miniatura, `img/produtos/camiseta-jesus-a1-${CARIMBO}-2-mini.webp`);

    const entradas = corpos(github, 'POST trees')[0].tree;
    assert.ok(entradas.every((e) => e.sha !== null), 'nenhuma entrada apagando arquivo');
    assert.ok(!entradas.some((e) => Object.hasOwn(antigas, e.path)), 'não regrava caminho existente');
    for (const caminho of Object.keys(antigas)) assert.ok(github.arvoreDoHead().has(caminho), `${caminho} continua no repositório`);
  });

  test('foto pendente que sumiu do aparelho → erro de validação antes de enviar qualquer coisa', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    const ops = congelar([opCriarComFoto()]);
    await assert.rejects(
      cliente.publicar({ ops, obterFoto: async () => null }),
      (e) => {
        erroDoTipo('validacao')(e);
        assert.match(e.message, /Caneca Nova/);
        return true;
      },
    );
    assert.equal(escritas(github).length, 0);
  });
});

describe('publicar: novas tentativas no PATCH', () => {
  for (const status of [409, 422]) {
    test(`${status} no PATCH → espera 2 s e recomeça do passo 1, reaproveitando os blobs`, async () => {
      const github = criarGitHubFalso({ forcar: { 'PATCH refs': [{ status, corpo: { message: 'Update is not a fast forward' } }] } });
      const { cliente, esperas } = montar(github);
      const pedidas = [];
      const r = await cliente.publicar({ ops: [opCriarComFoto()], obterFoto: obterFotoFalsa(pedidas) });

      assert.deepEqual(rotas(github), [
        ...SEQUENCIA_LEITURA, 'POST blobs', 'POST blobs', ...SEQUENCIA_GRAVACAO,
        ...SEQUENCIA_LEITURA, ...SEQUENCIA_GRAVACAO,
      ]);
      assert.equal(esperas.filter((ms) => ms === 2000).length, 1);
      assert.equal(contar(github, 'POST blobs'), 2, 'blobs não são reenviados');
      assert.deepEqual(pedidas, ['foto-aaaa-1111', 'foto-aaaa-1111-mini']);

      const [primeira, segunda] = corpos(github, 'POST trees');
      assert.deepEqual(segunda.tree.slice(0, 2), primeira.tree.slice(0, 2), 'mesmos caminhos e mesmos sha');
      assert.equal(github.estado.head, r.commitSha);
      assert.equal(github.commits.get(r.commitSha).parents.length, 1);
      nuncaForce(github);
    });
  }

  test('outro aparelho publicou no meio: o rascunho é reaplicado sobre a versão nova', async () => {
    let headDoOutro = null;
    const github = criarGitHubFalso({
      aoChamar: (chamada, gh) => {
        if (chamada.rota === 'POST commits' && !headDoOutro) {
          gh.publicarNoOutroAparelho((d) => {
            d.produtos.find((p) => p.id === 'biblia-estudo-a2').precoCentavos = 9990;
            d.produtos = d.produtos.filter((p) => p.id !== 'caneca-a3');
          });
          headDoOutro = gh.estado.head;
        }
      },
    });
    const { cliente } = montar(github);
    const ops = [opPreco(7990), { tipo: 'produto', acao: 'alterar', id: 'caneca-a3', campos: { visivel: true }, rotulo: 'Caneca' }];
    const r = await cliente.publicar({ ops });

    assert.equal(contar(github, 'PATCH refs'), 2);
    const produtos = r.produtos.produtos;
    assert.equal(produtos.find((p) => p.id === 'camiseta-jesus-a1').precoCentavos, 7990, 'minha alteração');
    assert.equal(produtos.find((p) => p.id === 'biblia-estudo-a2').precoCentavos, 9990, 'a do outro aparelho continua');
    assert.ok(!produtos.some((p) => p.id === 'caneca-a3'));
    assert.equal(r.avisos.length, 1);
    assert.match(r.avisos[0], /"Caneca" foi excluído em outro aparelho; sua alteração foi descartada/);
    assert.deepEqual(github.commits.get(r.commitSha).parents, [headDoOutro], 'commit em cima do outro aparelho');
    assert.equal(github.estado.head, r.commitSha);
    nuncaForce(github);
  });

  test('desiste depois de 3 tentativas com a mensagem certa', async () => {
    const github = criarGitHubFalso({ forcar: { 'PATCH refs': [{ status: 409 }, { status: 422 }, { status: 409 }] } });
    const { cliente, esperas } = montar(github);
    await assert.rejects(
      cliente.publicar({ ops: [opPreco()] }),
      erroDoTipo('conflito', 'Outra pessoa alterou o catálogo agora. Recarregue e tente de novo.'),
    );
    assert.equal(contar(github, 'PATCH refs'), 3);
    assert.equal(contar(github, 'GET ref'), 3, 'não existe 4ª tentativa');
    assert.equal(esperas.filter((ms) => ms === 2000).length, 2);
    assert.equal(github.estado.head, 'head-inicial');
    nuncaForce(github);
  });

  test('o código nunca usa force: true', () => {
    const codigo = readFileSync(new URL('../js/github.js', import.meta.url), 'utf8');
    assert.ok(!/force\s*:\s*true/.test(codigo));
  });
});

describe('publicar: erros (o rascunho nunca é tocado)', () => {
  const opsDeExemplo = () => congelar([opPreco(), opCriarComFoto()]);

  test('401 → chave inválida; ops intactas e nada gravado', async () => {
    const github = criarGitHubFalso({ forcar: { 'GET ref': [{ status: 401, corpo: { message: 'Bad credentials' } }] } });
    const { cliente } = montar(github);
    const ops = opsDeExemplo();
    const copia = structuredClone(ops);
    await assert.rejects(cliente.publicar({ ops, obterFoto: obterFotoFalsa() }), erroDoTipo('chave-invalida', 'Chave do GitHub inválida ou expirada.'));
    assert.deepEqual(ops, copia);
    assert.equal(escritas(github).length, 0);
  });

  test('401 no meio (depois das fotos) → ops intactas e a branch não muda', async () => {
    const github = criarGitHubFalso({ forcar: { 'POST trees': [{ status: 401 }] } });
    const { cliente } = montar(github);
    const ops = opsDeExemplo();
    const copia = structuredClone(ops);
    await assert.rejects(cliente.publicar({ ops, obterFoto: obterFotoFalsa() }), erroDoTipo('chave-invalida'));
    assert.deepEqual(ops, copia);
    assert.equal(github.estado.head, 'head-inicial');
  });

  test('sem internet (TypeError do fetch) → "Sem conexão…"; ops intactas', async () => {
    const github = criarGitHubFalso({ forcar: { 'GET ref': [new TypeError('Failed to fetch')] } });
    const { cliente } = montar(github);
    const ops = opsDeExemplo();
    const copia = structuredClone(ops);
    await assert.rejects(cliente.publicar({ ops, obterFoto: obterFotoFalsa() }), (e) => {
      erroDoTipo('rede', 'Sem conexão ou GitHub instável.')(e);
      assert.ok(e.cause instanceof TypeError);
      return true;
    });
    assert.deepEqual(ops, copia);
    assert.equal(github.estado.head, 'head-inicial');
  });

  test('internet cai no PATCH → erro de rede, sem nova tentativa automática', async () => {
    const github = criarGitHubFalso({ forcar: { 'PATCH refs': [new TypeError('Failed to fetch')] } });
    const { cliente } = montar(github);
    const ops = opsDeExemplo();
    const copia = structuredClone(ops);
    await assert.rejects(cliente.publicar({ ops, obterFoto: obterFotoFalsa() }), erroDoTipo('rede'));
    assert.deepEqual(ops, copia);
    assert.equal(contar(github, 'PATCH refs'), 1);
  });

  test('"Tentar novamente" depois de erro de rede reaproveita as fotos já enviadas', async () => {
    const github = criarGitHubFalso({ forcar: { 'POST trees': [new TypeError('Failed to fetch')] } });
    const { cliente } = montar(github);
    const pedidas = [];
    const ops = opsDeExemplo();
    await assert.rejects(cliente.publicar({ ops, obterFoto: obterFotoFalsa(pedidas) }), erroDoTipo('rede'));
    assert.equal(contar(github, 'POST blobs'), 2);

    const r = await cliente.publicar({ ops, obterFoto: obterFotoFalsa(pedidas) });
    assert.equal(contar(github, 'POST blobs'), 2, 'nenhum blob reenviado');
    assert.equal(pedidas.length, 2);
    const caneca = r.produtos.produtos.find((p) => p.id === 'caneca-nova-b1');
    assert.equal(caneca.imagem, `img/produtos/caneca-nova-b1-${CARIMBO}.webp`);
    assert.equal(github.arvoreDoHead().get(caneca.imagem).sha, 'blob-1');
  });

  test('5xx → "Sem conexão ou GitHub instável."', async () => {
    const github = criarGitHubFalso({ forcar: { 'GET ref': [{ status: 502 }] } });
    const { cliente } = montar(github);
    await assert.rejects(cliente.publicar({ ops: [opPreco()] }), (e) => {
      erroDoTipo('rede', 'Sem conexão ou GitHub instável.')(e);
      assert.equal(e.status, 502);
      return true;
    });
  });

  test('410 → versão da API desativada', async () => {
    const github = criarGitHubFalso({ forcar: { 'GET ref': [{ status: 410, corpo: { message: 'Gone' } }] } });
    const { cliente } = montar(github);
    await assert.rejects(
      cliente.publicar({ ops: [opPreco()] }),
      erroDoTipo('api-desativada', 'A versão da API do GitHub usada pelo painel foi desativada. Atualize API_VERSION em js/github.js.'),
    );
  });

  test('400 citando a versão da API também é "versão desativada"', async () => {
    const github = criarGitHubFalso({ forcar: { 'GET ref': [{ status: 400, corpo: { message: 'Invalid API version provided.' } }] } });
    const { cliente } = montar(github);
    await assert.rejects(cliente.lerDados(), erroDoTipo('api-desativada'));
  });

  test('espera longa até o x-ratelimit-reset aparece em minutos', async () => {
    const reset = AGORA / 1000 + 3540;
    const github = criarGitHubFalso({
      forcar: { 'GET ref': [{ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } }] },
    });
    const { cliente } = montar(github);
    await assert.rejects(cliente.lerDados(), (e) => {
      erroDoTipo('limite', 'Muitas alterações seguidas, aguarde 59 minutos.')(e);
      assert.equal(e.esperarSegundos, 3540);
      return true;
    });
  });

  test('429 com retry-after → "aguarde X segundos", sem insistir', async () => {
    const github = criarGitHubFalso({ forcar: { 'POST trees': [{ status: 429, headers: { 'retry-after': '30' } }] } });
    const { cliente } = montar(github);
    await assert.rejects(cliente.publicar({ ops: [opPreco()] }), (e) => {
      erroDoTipo('limite', 'Muitas alterações seguidas, aguarde 30 segundos.')(e);
      assert.equal(e.esperarSegundos, 30);
      assert.equal(e.status, 429);
      return true;
    });
    assert.equal(contar(github, 'POST trees'), 1);
  });

  test('403 com retry-after também é limite (não é falta de permissão)', async () => {
    const github = criarGitHubFalso({ forcar: { 'POST commits': [{ status: 403, headers: { 'retry-after': '5' }, corpo: { message: 'You have exceeded a secondary rate limit' } }] } });
    const { cliente } = montar(github);
    await assert.rejects(cliente.publicar({ ops: [opPreco()] }), erroDoTipo('limite', 'Muitas alterações seguidas, aguarde 5 segundos.'));
  });

  test('x-ratelimit-remaining = 0 → espera até x-ratelimit-reset', async () => {
    const reset = AGORA / 1000 + 90;
    const github = criarGitHubFalso({
      forcar: { 'GET ref': [{ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }, corpo: { message: 'API rate limit exceeded' } }] },
    });
    const { cliente } = montar(github);
    await assert.rejects(cliente.lerDados(), (e) => {
      erroDoTipo('limite', 'Muitas alterações seguidas, aguarde 90 segundos.')(e);
      assert.equal(e.esperarSegundos, 90);
      return true;
    });
  });

  test('outro 403/404 em escrita → sem permissão de escrita', async () => {
    for (const status of [403, 404]) {
      const github = criarGitHubFalso({ forcar: { 'POST trees': [{ status, corpo: { message: 'Resource not accessible by personal access token' } }] } });
      const { cliente } = montar(github);
      await assert.rejects(
        cliente.publicar({ ops: [opPreco()] }),
        erroDoTipo('sem-permissao', 'Esta chave não tem permissão de escrita no repositório PRACIMA (Contents: Read and write).'),
      );
    }
  });

  test('422 fora do PATCH → mostra a mensagem do GitHub e não tenta de novo', async () => {
    const github = criarGitHubFalso({
      forcar: { 'POST trees': [{ status: 422, corpo: { message: 'tree.path contains a malformed path component', errors: [] } }] },
    });
    const { cliente } = montar(github);
    await assert.rejects(cliente.publicar({ ops: [opPreco()] }), (e) => {
      erroDoTipo('validacao')(e);
      assert.match(e.message, /tree\.path contains a malformed path component/);
      return true;
    });
    assert.equal(contar(github, 'GET ref'), 1);
  });

  test('catálogo inválido → erro de validação com detalhes, antes de qualquer escrita', async () => {
    const github = criarGitHubFalso();
    const { cliente } = montar(github);
    const op = {
      tipo: 'produto', acao: 'criar', id: 'bone-x', rotulo: 'Boné',
      dados: { id: 'bone-x', categoria: 'nao-existe', nome: 'Boné', precoCentavos: 0, visivel: true, ordem: 10 },
    };
    await assert.rejects(cliente.publicar({ ops: [op] }), (e) => {
      erroDoTipo('validacao')(e);
      assert.ok(e.detalhes.some((d) => /Boné.*categoria não existe/.test(d)));
      assert.ok(e.detalhes.some((d) => /Boné.*preço inválido/.test(d)));
      return true;
    });
    assert.equal(escritas(github).length, 0);
  });

  test('github.js não mexe em localStorage, sessionStorage nem IndexedDB (o rascunho é do painel)', () => {
    const codigo = readFileSync(new URL('../js/github.js', import.meta.url), 'utf8');
    assert.ok(!/localStorage|sessionStorage|indexedDB|removerArmazenado|gravarArmazenado/.test(codigo));
  });
});

describe('aguardarNoAr', () => {
  function sitePublico(respostas) {
    const pedidos = [];
    const fila = [...respostas];
    return {
      pedidos,
      fetch: async (url, init) => {
        pedidos.push({ url, init });
        const proxima = fila.length > 1 ? fila.shift() : fila[0];
        if (proxima instanceof Error) throw proxima;
        return resposta(200, { atualizadoEm: proxima });
      },
    };
  }

  function relogioFalso() {
    const r = { agora: AGORA, esperas: [] };
    r.esperar = (ms) => {
      r.esperas.push(ms);
      r.agora += ms;
      return Promise.resolve();
    };
    return r;
  }

  test('para quando o atualizadoEm público bate', async () => {
    const site = sitePublico(['antigo', 'antigo', 'novo']);
    const relogio = relogioFalso();
    const tentativas = [];
    const ok = await aguardarNoAr({
      atualizadoEm: 'novo', fetch: site.fetch, esperar: relogio.esperar, agora: () => relogio.agora,
      aoTentar: (n) => tentativas.push(n),
    });
    assert.equal(ok, true);
    assert.deepEqual(tentativas, [1, 2, 3]);
    assert.deepEqual(relogio.esperas, [15000, 15000, 15000]);
    for (const p of site.pedidos) {
      assert.match(p.url, /^data\/produtos\.json\?v=\d+$/);
      assert.equal(p.init.cache, 'no-store');
      assert.ok(!p.url.includes('api.github.com'));
    }
    assert.equal(site.pedidos[0].url, `data/produtos.json?v=${AGORA + 15000}`);
  });

  test('desiste depois de 12 minutos (48 tentativas de 15 s)', async () => {
    const site = sitePublico(['antigo']);
    const relogio = relogioFalso();
    const ok = await aguardarNoAr({ atualizadoEm: 'novo', fetch: site.fetch, esperar: relogio.esperar, agora: () => relogio.agora });
    assert.equal(ok, false);
    assert.equal(site.pedidos.length, 48);
    assert.equal(relogio.agora - AGORA, 720000);
  });

  test('falha de rede no meio não interrompe', async () => {
    const site = sitePublico([new TypeError('Failed to fetch'), 'novo']);
    const relogio = relogioFalso();
    const ok = await aguardarNoAr({ atualizadoEm: 'novo', fetch: site.fetch, esperar: relogio.esperar, agora: () => relogio.agora });
    assert.equal(ok, true);
    assert.equal(site.pedidos.length, 2);
  });

  test('termina mesmo com relógio parado e respeita url com "?"', async () => {
    const site = sitePublico(['antigo']);
    const ok = await aguardarNoAr({
      atualizadoEm: 'novo', fetch: site.fetch, esperar: () => Promise.resolve(), agora: () => AGORA,
      intervaloMs: 1000, limiteMs: 5000, url: 'data/produtos.json?x=1',
    });
    assert.equal(ok, false);
    assert.equal(site.pedidos.length, 5);
    assert.equal(site.pedidos[0].url, `data/produtos.json?x=1&v=${AGORA}`);
  });
});
