// Integração com a API REST do GitHub: leitura do catálogo e o fluxo "Publicar".
// Cada publicação vira UM único commit (Git Data API), com as requisições em série.
// O fetch, a espera e o relógio são recebidos por parâmetro para dar para testar sem rede.

import {
  PREFIXO_PENDENTE,
  agoraISOLocal,
  aplicarAlteracoes,
  base64ParaTexto,
  ehPendente,
  validarCatalogo,
} from './comum.js?v=1';

export const OWNER = 'leonardo681';
export const REPO = 'PRACIMA';
export const BRANCH = 'main';
export const API = 'https://api.github.com';
export const API_VERSION = '2026-03-10';
export const CAMINHO_PRODUTOS = 'data/produtos.json';
export const CAMINHO_IGREJA = 'data/igreja.json';
export const URL_SITE = 'https://leonardo681.github.io/PRACIMA/';
export const URL_CRIAR_CHAVE = 'https://github.com/settings/personal-access-tokens/new?name=Painel%20Sara%20Store&description=Catalogo%20PRACIMA&target_name=leonardo681&expires_in=366&contents=write';
export const URL_CHAVES = 'https://github.com/settings/personal-access-tokens';
export const URL_ACTIONS = 'https://github.com/leonardo681/PRACIMA/actions';

const REPO_API = `/repos/${OWNER}/${REPO}`;
const TENTATIVAS_PUBLICAR = 3;
const ESPERA_CONFLITO_MS = 2000;
const ESPERA_LIMITE_PADRAO_S = 60; // GitHub: sem cabeçalho de espera, aguarde pelo menos 1 minuto
const MODO_ARQUIVO = '100644';

const MENSAGENS = {
  rede: 'Sem conexão ou GitHub instável.',
  chaveInvalida: 'Chave do GitHub inválida ou expirada.',
  semPermissao: 'Esta chave não tem permissão de escrita no repositório PRACIMA (Contents: Read and write).',
  apiDesativada: 'A versão da API do GitHub usada pelo painel foi desativada. Atualize API_VERSION em js/github.js.',
  conflito: 'Outra pessoa alterou o catálogo agora. Recarregue e tente de novo.',
  respostaEstranha: 'O GitHub devolveu uma resposta inesperada. Tente de novo em instantes.',
  produtosQuebrado: 'O arquivo data/produtos.json no GitHub está com erro de formato. Abra o arquivo no GitHub e volte a versão anterior pelo "History".',
  catalogoComErro: 'O catálogo tem itens para corrigir antes de publicar.',
  igrejaInvalida: 'As informações da igreja estão em formato inválido.',
};

export class ErroGitHub extends Error {
  // tipo: 'rede' | 'chave-invalida' | 'limite' | 'sem-permissao' | 'nao-encontrado'
  //     | 'api-desativada' | 'conflito' | 'validacao' | 'desconhecido'
  constructor(tipo, mensagem, { status = null, esperarSegundos = null, detalhes = [], cause } = {}) {
    super(mensagem, cause === undefined ? undefined : { cause });
    this.name = 'ErroGitHub';
    this.tipo = tipo;
    this.status = status;
    this.esperarSegundos = esperarSegundos;
    this.detalhes = detalhes;
  }
}

/* ---------- Ajudantes ---------- */

const ehObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);

const paraJSON = (dados) => JSON.stringify(dados, null, 2) + '\n';

function exigirTexto(valor) {
  if (typeof valor === 'string' && valor) return valor;
  throw new ErroGitHub('desconhecido', MENSAGENS.respostaEstranha);
}

// Base64 da API → texto UTF-8 (base64ParaTexto já tira as quebras de linha).
function decodificar(base64) {
  try {
    return base64ParaTexto(base64);
  } catch (erro) {
    throw new ErroGitHub('desconhecido', MENSAGENS.respostaEstranha, { cause: erro });
  }
}

async function lerCorpo(resposta) {
  let texto;
  try {
    texto = await resposta.text();
  } catch {
    return null;
  }
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

// Junta a "message" e a lista "errors" que o GitHub manda nas respostas de erro.
function mensagemDoGitHub(corpo) {
  if (!ehObjeto(corpo)) return { mensagem: '', detalhes: [] };
  const detalhes = Array.isArray(corpo.errors)
    ? corpo.errors.map((e) => (typeof e === 'string' ? e : e?.message || e?.code || '')).filter(Boolean)
    : [];
  return { mensagem: typeof corpo.message === 'string' ? corpo.message : '', detalhes };
}

function textoDeEspera(segundos) {
  if (segundos < 120) return `${segundos} ${segundos === 1 ? 'segundo' : 'segundos'}`;
  return `${Math.ceil(segundos / 60)} minutos`;
}

function erroDeLimite(segundos, status) {
  return new ErroGitHub('limite', `Muitas alterações seguidas, aguarde ${textoDeEspera(segundos)}.`, {
    status,
    esperarSegundos: segundos,
  });
}

// "retry-after" vem em segundos (o HTTP também permite uma data).
function segundosDoRetryAfter(valor, agoraMs) {
  const numero = Number(valor);
  if (String(valor).trim() !== '' && Number.isFinite(numero)) return Math.max(1, Math.ceil(numero));
  const data = Date.parse(valor);
  if (!Number.isNaN(data)) return Math.max(1, Math.ceil((data - agoraMs) / 1000));
  return ESPERA_LIMITE_PADRAO_S;
}

// Converte uma resposta de erro na mensagem certa da tabela da seção 11.
function erroDaResposta(resposta, corpo, { escrita, oQue, agoraMs }) {
  const status = resposta.status;
  const cabecalho = (nome) => resposta.headers?.get?.(nome) ?? null;
  const { mensagem, detalhes } = mensagemDoGitHub(corpo);

  if (status === 401) return new ErroGitHub('chave-invalida', MENSAGENS.chaveInvalida, { status });
  if (status === 410 || (status === 400 && /api.?version/i.test(mensagem))) {
    return new ErroGitHub('api-desativada', MENSAGENS.apiDesativada, { status });
  }
  if (status === 403 || status === 429) {
    const retryAfter = cabecalho('retry-after');
    if (retryAfter !== null) return erroDeLimite(segundosDoRetryAfter(retryAfter, agoraMs), status);
    if (cabecalho('x-ratelimit-remaining') === '0') {
      const reset = Number(cabecalho('x-ratelimit-reset'));
      const segundos = Number.isFinite(reset) && reset > 0
        ? Math.max(1, Math.ceil(reset - agoraMs / 1000))
        : ESPERA_LIMITE_PADRAO_S;
      return erroDeLimite(segundos, status);
    }
    if (status === 429 || /rate limit/i.test(mensagem)) return erroDeLimite(ESPERA_LIMITE_PADRAO_S, status);
    return new ErroGitHub('sem-permissao', MENSAGENS.semPermissao, { status });
  }
  if (status === 404) {
    if (escrita) return new ErroGitHub('sem-permissao', MENSAGENS.semPermissao, { status });
    return new ErroGitHub('nao-encontrado', `Não encontrei ${oQue} no GitHub (${OWNER}/${REPO}, branch ${BRANCH}).`, { status });
  }
  if (status === 422) {
    const texto = [mensagem, ...detalhes].filter(Boolean).join(' — ') || 'dados recusados';
    return new ErroGitHub('validacao', `O GitHub recusou o envio: ${texto}`, { status, detalhes });
  }
  if (status >= 500) return new ErroGitHub('rede', MENSAGENS.rede, { status });
  return new ErroGitHub(
    'desconhecido',
    `Erro inesperado do GitHub (código ${status})${mensagem ? `: ${mensagem}` : ''}.`,
    { status, detalhes },
  );
}

function exigirCatalogoValido(erros) {
  if (erros.length) throw new ErroGitHub('validacao', MENSAGENS.catalogoComErro, { detalhes: erros });
}

function montarMensagemCommit(resumo, ops, comIgreja) {
  let texto = String(resumo ?? '').replace(/\s+/g, ' ').trim().replace(/^cat[aá]logo:\s*/i, '');
  if (!texto) {
    const partes = [];
    if (ops.length) partes.push(ops.length === 1 ? '1 alteração' : `${ops.length} alterações`);
    if (comIgreja) partes.push('informações da igreja');
    texto = partes.join(' e ') || 'atualização';
  }
  const letras = Array.from(texto); // não corta emoji no meio
  if (letras.length > 120) texto = letras.slice(0, 119).join('') + '…';
  return `Catálogo: ${texto}`;
}

// Aceita "webp", ".jpg", "jpeg" e também o tipo do Blob ("image/webp", "image/jpeg").
function normalizarExtensao(extensao) {
  const ext = String(extensao ?? '').trim().toLowerCase().replace(/^image\//, '').replace(/^\./, '');
  if (ext === 'jpeg') return 'jpg';
  return ext === 'webp' || ext === 'jpg' ? ext : null;
}

const ehMiniatura = (chave) => chave.endsWith('-mini');

/* ---------- Cliente ---------- */

export function criarClienteGitHub({
  token,
  fetch = globalThis.fetch.bind(globalThis),
  esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
  agora = () => Date.now(),
  intervaloEscritaMs = 500,
} = {}) {
  const chave = String(token ?? '').trim();
  let ultimaEscrita = null;

  // Fotos já enviadas como blob: { chave → { caminho, sha, carimbo } }.
  // Fica em memória para que uma nova tentativa (409/422 ou "Tentar novamente") reaproveite o envio.
  const fotosEnviadas = new Map();
  const caminhosGerados = new Set();

  async function respeitarIntervalo() {
    if (ultimaEscrita === null || intervaloEscritaMs <= 0) return;
    const falta = intervaloEscritaMs - (agora() - ultimaEscrita);
    if (falta > 0) await esperar(falta);
  }

  async function requisitar(metodo, caminho, { corpo, oQue = 'o recurso pedido' } = {}) {
    // Chave colada com caractere invisível ou acento faria o fetch lançar TypeError,
    // que apareceria como "Sem conexão". As chaves do GitHub só têm ASCII visível.
    if (!chave || !/^[\x21-\x7E]+$/.test(chave)) throw new ErroGitHub('chave-invalida', MENSAGENS.chaveInvalida);
    const escrita = metodo !== 'GET';
    if (escrita) await respeitarIntervalo();

    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${chave}`,
      'X-GitHub-Api-Version': API_VERSION,
    };
    const opcoes = { method: metodo, headers, cache: 'no-store' };
    if (metodo === 'POST' || metodo === 'PATCH') {
      headers['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo ?? {});
    }

    let resposta;
    try {
      resposta = await fetch(API + caminho, opcoes);
    } catch (erro) {
      throw new ErroGitHub('rede', MENSAGENS.rede, { cause: erro });
    } finally {
      if (escrita) ultimaEscrita = agora();
    }

    const dados = await lerCorpo(resposta);
    if (resposta.ok) return dados;
    throw erroDaResposta(resposta, dados, { escrita, oQue, agoraMs: agora() });
  }

  // Lê um arquivo do repositório na versão "ref" e devolve o texto em UTF-8.
  async function lerArquivo(caminhoArquivo, ref) {
    const oQue = `o arquivo ${caminhoArquivo}`;
    const arquivo = await requisitar(
      'GET',
      `${REPO_API}/contents/${caminhoArquivo}?ref=${encodeURIComponent(ref)}`,
      { oQue },
    );
    if (!ehObjeto(arquivo)) throw new ErroGitHub('desconhecido', MENSAGENS.respostaEstranha);
    if (arquivo.encoding === 'base64' && typeof arquivo.content === 'string') return decodificar(arquivo.content);
    // Acima de 1 MB a API de conteúdo não manda o texto; o blob manda.
    const blob = await requisitar('GET', `${REPO_API}/git/blobs/${exigirTexto(arquivo.sha)}`, { oQue });
    if (!ehObjeto(blob) || typeof blob.content !== 'string') throw new ErroGitHub('desconhecido', MENSAGENS.respostaEstranha);
    return decodificar(blob.content);
  }

  async function lerProdutos(ref) {
    const texto = await lerArquivo(CAMINHO_PRODUTOS, ref);
    let dados;
    try {
      dados = JSON.parse(texto);
    } catch (erro) {
      throw new ErroGitHub('validacao', MENSAGENS.produtosQuebrado, { detalhes: [erro.message] });
    }
    if (!ehObjeto(dados) || !Array.isArray(dados.categorias) || !Array.isArray(dados.produtos)) {
      throw new ErroGitHub('validacao', MENSAGENS.produtosQuebrado, {
        detalhes: ['Faltam as listas "categorias" e "produtos".'],
      });
    }
    return dados;
  }

  // igreja.json faltando ou com erro de digitação não impede nada: vira null.
  async function lerIgreja(ref) {
    try {
      const dados = JSON.parse(await lerArquivo(CAMINHO_IGREJA, ref));
      return ehObjeto(dados) ? dados : null;
    } catch (erro) {
      if (erro instanceof ErroGitHub && erro.tipo !== 'nao-encontrado') throw erro;
      return null;
    }
  }

  // Passos 1 a 3 da seção 11: ref → commit → conteúdo, sempre da versão mais nova.
  async function lerVersaoAtual() {
    const ref = await requisitar('GET', `${REPO_API}/git/ref/heads/${BRANCH}`, { oQue: `a branch ${BRANCH}` });
    const headSha = exigirTexto(ref?.object?.sha);
    const commit = await requisitar('GET', `${REPO_API}/git/commits/${headSha}`, { oQue: 'a última versão publicada' });
    const baseTree = exigirTexto(commit?.tree?.sha);
    const produtos = await lerProdutos(headSha);
    const igreja = await lerIgreja(headSha);
    return { headSha, baseTree, produtos, igreja };
  }

  // Carimbo do nome da foto: agora em base 36, com "-2", "-3"… se o caminho já existir.
  function carimboLivre(produtoId, ocupados) {
    const base = agora().toString(36);
    for (let n = 1; ; n++) {
      const carimbo = n === 1 ? base : `${base}-${n}`;
      const candidatos = ['webp', 'jpg'].flatMap((ext) => [
        `img/produtos/${produtoId}-${carimbo}.${ext}`,
        `img/produtos/${produtoId}-${carimbo}-mini.${ext}`,
      ]);
      if (!candidatos.some((c) => ocupados.has(c) || caminhosGerados.has(c))) return carimbo;
    }
  }

  async function lerFotoPendente(obterFoto, chaveFoto, produto) {
    let foto = null;
    let causa;
    try {
      foto = await obterFoto(chaveFoto);
    } catch (erro) {
      causa = erro;
    }
    const extensao = normalizarExtensao(foto?.extensao);
    let base64 = typeof foto?.base64 === 'string' ? foto.base64 : '';
    if (base64.startsWith('data:')) base64 = base64.slice(base64.indexOf(',') + 1);
    if (!base64 || !extensao) {
      throw new ErroGitHub(
        'validacao',
        `A foto nova de "${produto.nome || produto.id}" não foi encontrada neste aparelho. Escolha a foto de novo e publique.`,
        { detalhes: [`Foto pendente: ${chaveFoto}`], cause: causa },
      );
    }
    return { base64, extensao };
  }

  // Passo 4: envia as fotos "pendente:" como blobs e troca pelo caminho definitivo em "dados".
  // "base" é o catálogo do repositório antes do rascunho (as fotos atuais dele também contam como ocupadas).
  async function enviarFotos(dados, base, obterFoto, avisar) {
    const usos = [];
    for (const produto of dados.produtos) {
      for (const campo of ['imagem', 'miniatura']) {
        if (ehPendente(produto?.[campo])) {
          usos.push({ produto, campo, chave: produto[campo].slice(PREFIXO_PENDENTE.length) });
        }
      }
    }
    if (!usos.length) return [];

    // A foto e a miniatura do mesmo envio ficam juntas e dividem o carimbo.
    const grupos = new Map();
    for (const uso of usos) {
      const raiz = uso.chave.replace(/-mini$/, '');
      if (!grupos.has(raiz)) grupos.set(raiz, { produto: uso.produto, chaves: [] });
      const grupo = grupos.get(raiz);
      if (!grupo.chaves.includes(uso.chave)) grupo.chaves.push(uso.chave);
    }

    const faltaEnviar = (grupo) => grupo.chaves.some((c) => !fotosEnviadas.has(c));
    const total = [...grupos.values()].filter(faltaEnviar).length;
    if (total && typeof obterFoto !== 'function') {
      throw new ErroGitHub('validacao', 'Não foi possível ler as fotos novas deste aparelho.');
    }

    // Nunca reaproveitar um caminho existente: o CDN do GitHub ignora "?v=" e mostraria a foto antiga.
    const ocupados = new Set();
    for (const p of [...base.produtos, ...dados.produtos]) {
      for (const valor of [p?.imagem, p?.miniatura]) {
        if (typeof valor === 'string' && valor && !ehPendente(valor)) ocupados.add(valor);
      }
    }

    const enviadas = new Map();
    let numero = 0;
    for (const grupo of grupos.values()) {
      if (faltaEnviar(grupo)) {
        numero++;
        avisar(`Enviando foto ${numero} de ${total}…`);
      }
      let carimbo = grupo.chaves.map((c) => fotosEnviadas.get(c)?.carimbo).find(Boolean) ?? null;
      for (const chaveFoto of grupo.chaves) {
        let envio = fotosEnviadas.get(chaveFoto);
        if (!envio) {
          const foto = await lerFotoPendente(obterFoto, chaveFoto, grupo.produto);
          if (carimbo === null) carimbo = carimboLivre(grupo.produto.id, ocupados); // sem "??=": Safari antigo do iPhone
          const caminho = `img/produtos/${grupo.produto.id}-${carimbo}${ehMiniatura(chaveFoto) ? '-mini' : ''}.${foto.extensao}`;
          const blob = await requisitar('POST', `${REPO_API}/git/blobs`, {
            corpo: { content: foto.base64, encoding: 'base64' },
          });
          envio = { caminho, sha: exigirTexto(blob?.sha), carimbo };
          fotosEnviadas.set(chaveFoto, envio);
          caminhosGerados.add(caminho);
        }
        enviadas.set(chaveFoto, envio);
      }
    }

    for (const uso of usos) uso.produto[uso.campo] = enviadas.get(uso.chave).caminho;
    return [...enviadas].map(([chaveFoto, envio]) => ({ chave: chaveFoto, caminho: envio.caminho, sha: envio.sha }));
  }

  return {
    // Valida com ESCRITA (o repositório é público, qualquer chave consegue ler).
    // O blob de teste não entra em commit nenhum.
    async validarChave() {
      await requisitar('POST', `${REPO_API}/git/blobs`, { corpo: { content: 'teste', encoding: 'utf-8' } });
      return true;
    },

    async usuario() {
      const dados = await requisitar('GET', '/user', { oQue: 'o dono desta chave' });
      return exigirTexto(dados?.login);
    },

    async lerDados() {
      const { produtos, igreja, headSha } = await lerVersaoAtual();
      return { produtos, igreja, headSha };
    },

    async publicar({ ops, igreja = null, obterFoto, resumo = '', aoProgresso = () => {} } = {}) {
      const operacoes = Array.isArray(ops) ? ops : [];
      if (igreja !== null && !ehObjeto(igreja)) throw new ErroGitHub('validacao', MENSAGENS.igrejaInvalida);
      const conteudoIgreja = igreja === null ? null : paraJSON(igreja);
      const mensagem = montarMensagemCommit(resumo, operacoes, igreja !== null);
      const avisar = (texto) => {
        try {
          aoProgresso(texto);
        } catch {
          /* um erro na tela não pode interromper a publicação */
        }
      };

      for (let tentativa = 1; ; tentativa++) {
        avisar(tentativa === 1
          ? 'Lendo a versão mais nova do catálogo…'
          : `Outra pessoa publicou ao mesmo tempo. Tentando de novo (${tentativa} de ${TENTATIVAS_PUBLICAR})…`);

        // 1 a 3: versão mais nova + rascunho reaplicado por cima (não apaga o que outro aparelho mudou).
        const atual = await lerVersaoAtual();
        const { dados, avisos } = aplicarAlteracoes(atual.produtos, operacoes);
        dados.atualizadoEm = agoraISOLocal(new Date(agora()));
        exigirCatalogoValido(validarCatalogo(dados, { permitirPendentes: true }));

        // 4: fotos novas.
        const fotos = await enviarFotos(dados, atual.produtos, obterFoto, avisar);
        exigirCatalogoValido(validarCatalogo(dados));

        // 5: tree nova sobre a atual (fotos antigas continuam lá; nada é apagado).
        avisar('Gravando as alterações…');
        const conteudoProdutos = paraJSON(dados);
        const entradas = fotos.map((f) => ({ path: f.caminho, mode: MODO_ARQUIVO, type: 'blob', sha: f.sha }));
        entradas.push({ path: CAMINHO_PRODUTOS, mode: MODO_ARQUIVO, type: 'blob', content: conteudoProdutos });
        if (conteudoIgreja !== null) {
          entradas.push({ path: CAMINHO_IGREJA, mode: MODO_ARQUIVO, type: 'blob', content: conteudoIgreja });
        }
        const tree = await requisitar('POST', `${REPO_API}/git/trees`, {
          corpo: { base_tree: atual.baseTree, tree: entradas },
        });

        // 6: um único commit.
        const commit = await requisitar('POST', `${REPO_API}/git/commits`, {
          corpo: { message: mensagem, tree: exigirTexto(tree?.sha), parents: [atual.headSha] },
        });
        const commitSha = exigirTexto(commit?.sha);

        // 7: move a branch, sempre sem forçar.
        avisar('Publicando…');
        try {
          await requisitar('PATCH', `${REPO_API}/git/refs/heads/${BRANCH}`, {
            corpo: { sha: commitSha, force: false },
          });
        } catch (erro) {
          const alguemPublicou = erro instanceof ErroGitHub && (erro.status === 409 || erro.status === 422);
          if (!alguemPublicou) throw erro;
          if (tentativa >= TENTATIVAS_PUBLICAR) {
            throw new ErroGitHub('conflito', MENSAGENS.conflito, { status: erro.status, cause: erro });
          }
          await esperar(ESPERA_CONFLITO_MS);
          continue;
        }

        for (const f of fotos) fotosEnviadas.delete(f.chave);
        return {
          produtos: JSON.parse(conteudoProdutos),
          igreja: conteudoIgreja !== null ? JSON.parse(conteudoIgreja) : atual.igreja,
          commitSha,
          avisos,
        };
      }
    },
  };
}

/* ---------- Depois de publicar ---------- */

// Busca o produtos.json público até o "atualizadoEm" bater (o GitHub Pages leva de 1 a 10 minutos).
// Nunca chama api.github.com. Devolve true quando apareceu, false se o tempo acabou.
export async function aguardarNoAr({
  atualizadoEm,
  fetch = globalThis.fetch.bind(globalThis),
  esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
  agora = () => Date.now(),
  intervaloMs = 15000,
  limiteMs = 720000,
  url = 'data/produtos.json',
  aoTentar = () => {},
} = {}) {
  const inicio = agora();
  const maximo = Math.max(1, Math.ceil(limiteMs / intervaloMs));
  const separador = url.includes('?') ? '&' : '?';

  for (let tentativa = 1; tentativa <= maximo && agora() - inicio < limiteMs; tentativa++) {
    await esperar(intervaloMs);
    try {
      aoTentar(tentativa);
    } catch {
      /* só informativo */
    }
    try {
      const resposta = await fetch(`${url}${separador}v=${agora()}`, { cache: 'no-store' });
      if (resposta.ok) {
        const dados = await resposta.json();
        if (dados?.atualizadoEm === atualizadoEm) return true;
      }
    } catch {
      /* sem internet ou arquivo no meio da troca: tenta de novo na próxima volta */
    }
  }
  return false;
}
