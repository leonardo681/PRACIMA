// Painel administrativo da SARA STORE: login, chave do GitHub, rascunho, fotos e publicação.
// Só funciona em HTTPS (ou localhost). Nada de terceiros; o DOM é montado com createElement/textContent.

import {
  PREFIXO, PREFIXO_PENDENTE, gerarIdProduto, gerarIdCategoria, normalizarBusca, formatarPreco,
  centavosParaTexto, lerPreco, precoValido, temVariacoes, precoMinimo, hojeLocal, somarDias, dataValida,
  ehNovidade, agoraISOLocal, formatarDiaMes, formatarDataHoraBR, ordenarCategorias, ordenarProdutos,
  proximaOrdemProduto, proximaOrdemCategoria, imagemPermitida, ehPendente, aplicarAlteracoes,
  compactarOps, fotosPendentesUsadas, validarCatalogo, lerArmazenado, gravarArmazenado,
  removerArmazenado, iconeDaCategoria,
} from './comum.js?v=1';
import {
  OWNER, REPO, BRANCH, CAMINHO_PRODUTOS, CAMINHO_IGREJA, URL_CRIAR_CHAVE, URL_CHAVES, URL_ACTIONS,
  ErroGitHub, criarClienteGitHub, aguardarNoAr,
} from './github.js?v=1';
import { comprimirFoto, salvarFoto, lerFoto, apagarFoto, listarFotos, blobParaBase64 } from './fotos.js?v=1';
import { FECHADO, prepararDialogo } from './dialogo.js?v=1';

const HASH_ACESSO = '72e17a03b4ebd509d124d943d79910ef280d4b0f24dc7ff4ba845bacfe0816bc';
const DIAS_NOVIDADE = 30;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MSG_PRECO = 'Preço inválido. Digite só números, como 74 ou 74,50 (até R$ 100.000,00).';
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const TELAS = ['contexto', 'login', 'chave', 'painel'];
const ABAS = ['produtos', 'categorias', 'informacoes', 'ajuda'];

const ROTULOS_CAMPOS = {
  nome: 'nome', categoria: 'categoria', precoCentavos: 'preço', descricao: 'descrição',
  info: 'informação curta', variacoes: 'variações', imagem: 'foto', miniatura: 'foto',
  visivel: 'visibilidade', novidadeAte: 'novidade', ordem: 'ordem',
};

// Quando o botão que estava com o foco some (ou fica desativado) depois de redesenhar a lista.
const FOCO_ALTERNATIVO = {
  subir: ['descer', 'editar'],
  descer: ['subir', 'editar'],
  visivel: ['editar'],
  duplicar: ['editar'],
  'cat-subir': ['cat-descer', 'cat-renomear'],
  'cat-descer': ['cat-subir', 'cat-renomear'],
};

const $ = (id) => document.getElementById(id);

const estado = {
  base: null,            // produtos.json sem o rascunho (da API ou do site)
  igrejaBase: null,      // igreja.json publicado (null se faltar ou estiver com erro)
  origem: null,          // 'api' | 'site'
  lidoEm: null,          // Date da última leitura
  vista: null,           // aplicarAlteracoes(base, ops) → { dados, avisos }
  ops: [],               // rascunho já compactado
  rascunhoIgreja: null,  // igreja.json editado (extra), ou null
  cliente: null,         // criarClienteGitHub(...) quando há chave
  usuario: '',
  modoRascunho: false,
  carregando: false,
  erroCarga: null,
  busca: '',
  aba: 'produtos',
  publicando: false,
};

/* ---------- Utilidades ---------- */

function el(tag, props = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [nome, valor] of Object.entries(props)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (nome === 'class') no.className = valor;
    else if (nome === 'text') no.textContent = valor;
    else if (nome === 'value') no.value = String(valor);
    else if (nome === 'on') for (const [evento, funcao] of Object.entries(valor)) no.addEventListener(evento, funcao);
    else no.setAttribute(nome, valor === true ? '' : String(valor));
  }
  for (const filho of filhos.flat()) {
    if (filho === undefined || filho === null || filho === false || filho === '') continue;
    no.append(filho); // texto vira nó de texto (nunca HTML)
  }
  return no;
}

function icone(d, tamanho = 28) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const atributos = {
    viewBox: '0 0 24 24', width: tamanho, height: tamanho, fill: 'none', stroke: 'currentColor',
    'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  };
  for (const [nome, valor] of Object.entries(atributos)) svg.setAttribute(nome, String(valor));
  const caminho = document.createElementNS(SVG_NS, 'path');
  caminho.setAttribute('d', d);
  svg.append(caminho);
  return svg;
}

function botao(texto, { classe = 'botao-secundario', foco, rotulo, desativado = false, aoClicar } = {}) {
  return el('button', {
    type: 'button', class: classe, 'data-foco': foco, 'aria-label': rotulo, disabled: desativado,
    on: aoClicar ? { click: aoClicar } : undefined,
  }, texto);
}

const plural = (n, um, varios) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);
const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const ehObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
const texto = (valor) => (typeof valor === 'string' ? valor : '');
const iguais = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const formatoDecimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
function tamanhoArquivo(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${formatoDecimal.format(bytes / (1024 * 1024))} MB`;
}

function linkHttps(url) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function definirErro(campo, saida, mensagem) {
  if (saida) {
    saida.textContent = mensagem || '';
    saida.hidden = !mensagem;
  }
  if (campo) {
    if (mensagem) campo.setAttribute('aria-invalid', 'true');
    else campo.removeAttribute('aria-invalid');
  }
}

function caixaAviso({ titulo = '', textos = [], itens = [], botoes = [], erro = false }) {
  return el('div', { class: erro ? 'aviso aviso-erro' : 'aviso' },
    titulo && el('h3', { text: titulo }),
    textos.map((t) => el('p', { text: t })),
    itens.length > 0 && el('ul', {}, itens.map((t) => el('li', { text: t }))),
    botoes.length > 0 && el('div', { class: 'botoes-linha' }, botoes));
}

let temporizadorRecado = null;
function mostrarRecado(mensagem, { erro = false } = {}) {
  const caixa = $('recado');
  caixa.classList.toggle('recado-erro', erro);
  caixa.textContent = mensagem;
  clearTimeout(temporizadorRecado);
  temporizadorRecado = setTimeout(() => { caixa.textContent = ''; }, erro ? 9000 : 5000);
}

function fecharDialogos() {
  for (const dialogo of document.querySelectorAll('dialog')) if (dialogo.open) dialogo.close();
}

/* ---------- Telas, login e chave ---------- */

function mostrarTela(nome, { focar = true } = {}) {
  for (const tela of TELAS) $(`tela-${tela}`).hidden = tela !== nome;
  $('sair').hidden = nome !== 'chave' && nome !== 'painel';
  renderBarra();
  const alvo = { login: 'login-usuario', chave: 'chave' }[nome];
  if (focar && alvo) $(alvo).focus();
}

function lerToken() {
  const valor = lerArmazenado('token', { sessao: true }) || lerArmazenado('token');
  return typeof valor === 'string' ? valor : '';
}

// Padrão: só na sessão. "Lembrar neste aparelho": localStorage (dividido com os outros sites do endereço).
function guardarToken(token, lembrar) {
  if (lembrar) {
    gravarArmazenado('token', token);
    removerArmazenado('token', { sessao: true });
  } else {
    gravarArmazenado('token', token, { sessao: true });
    removerArmazenado('token');
  }
}

function esquecerToken() {
  removerArmazenado('token');
  removerArmazenado('token', { sessao: true });
  estado.cliente = null;
  estado.usuario = '';
}

async function resumoDoAcesso(usuario, senha) {
  const bytes = new TextEncoder().encode(`${usuario}:${senha}`);
  const resumo = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function entrar(evento) {
  evento.preventDefault();
  const usuario = $('login-usuario').value.trim();
  const senha = $('login-senha').value;
  const saida = $('login-erro');
  if (!usuario || !senha) {
    definirErro(null, saida, 'Preencha o usuário e a senha.');
    return;
  }
  let certo = false;
  try {
    certo = (await resumoDoAcesso(usuario, senha)) === HASH_ACESSO;
  } catch {
    definirErro(null, saida, 'Este navegador não conseguiu conferir o login.');
    return;
  }
  if (!certo) {
    definirErro(null, saida, 'Usuário ou senha incorretos.');
    $('login-senha').value = '';
    $('login-senha').focus();
    return;
  }
  definirErro(null, saida, '');
  $('login-senha').value = '';
  gravarArmazenado('logado', 1, { sessao: true }); // fica gravado como '1'
  aposLogin();
}

function aposLogin() {
  const token = lerToken();
  if (token) {
    estado.cliente = criarClienteGitHub({ token });
    estado.modoRascunho = false;
    abrirPainel();
  } else if (lerArmazenado('modoRascunho', { sessao: true })) {
    estado.cliente = null;
    estado.modoRascunho = true;
    abrirPainel();
  } else {
    mostrarTelaChave();
  }
}

function mostrarTelaChave(mensagem = '') {
  fecharDialogos();
  $('chave').value = '';
  $('lembrar').checked = false;
  $('chave-status').textContent = '';
  definirErro($('chave'), $('chave-erro'), mensagem);
  mostrarTela('chave');
}

async function conectarChave(evento) {
  evento.preventDefault();
  const campo = $('chave');
  const token = campo.value.trim();
  const status = $('chave-status');
  if (!token) {
    definirErro(campo, $('chave-erro'), 'Cole a chave do GitHub (começa com github_pat_).');
    campo.focus();
    return;
  }
  if (/\s/.test(token)) {
    definirErro(campo, $('chave-erro'), 'A chave não pode ter espaços. Copie de novo no GitHub.');
    campo.focus();
    return;
  }
  definirErro(campo, $('chave-erro'), '');
  status.textContent = 'Conferindo a chave…';
  $('conectar').disabled = true;
  $('sem-chave').disabled = true;

  const cliente = criarClienteGitHub({ token });
  try {
    await cliente.validarChave(); // escrita de teste (blob), não cria commit
    let usuario = '';
    try {
      usuario = await cliente.usuario();
    } catch {
      /* só serve para mostrar o nome */
    }
    guardarToken(token, $('lembrar').checked);
    removerArmazenado('modoRascunho', { sessao: true });
    Object.assign(estado, { cliente, usuario, modoRascunho: false });
    campo.value = '';
    status.textContent = '';
    abrirPainel();
    mostrarRecado(usuario ? `Conectado como ${usuario}` : 'Chave do GitHub conectada.');
  } catch (erro) {
    status.textContent = '';
    let mensagem = erro instanceof ErroGitHub ? erro.message : 'Não foi possível conferir a chave. Tente de novo.';
    if (erro instanceof ErroGitHub && (erro.tipo === 'sem-permissao' || erro.tipo === 'nao-encontrado')) {
      mensagem += ' Confira se a chave foi criada na conta leonardo681, só para o PRACIMA, com Contents: Read and write.';
    }
    definirErro(campo, $('chave-erro'), mensagem);
    campo.focus();
  } finally {
    $('conectar').disabled = false;
    $('sem-chave').disabled = false;
  }
}

function continuarSemChave() {
  gravarArmazenado('modoRascunho', true, { sessao: true });
  Object.assign(estado, { cliente: null, usuario: '', modoRascunho: true });
  abrirPainel();
}

async function esquecerChave() {
  const resposta = await abrirCaixa({
    titulo: 'Esquecer a chave neste aparelho?',
    textos: [
      'A chave sai deste aparelho (das duas memórias do navegador). O rascunho continua guardado.',
      'Para publicar de novo, será preciso colar a chave.',
    ],
    botoes: [
      { valor: null, texto: 'Cancelar', foco: true },
      { valor: 'esquecer', texto: 'Esquecer a chave', classe: 'botao-perigo' },
    ],
  });
  if (resposta !== 'esquecer') return;
  esquecerToken();
  removerArmazenado('modoRascunho', { sessao: true });
  estado.modoRascunho = false;
  mostrarTelaChave();
  $('chave-status').textContent = 'A chave foi esquecida neste aparelho.';
}

// "Sair" apaga só o login da sessão (e a chave, se ela estiver só na sessão). Nunca o rascunho.
function sair() {
  if (estado.publicando) return;
  removerArmazenado('logado', { sessao: true });
  removerArmazenado('token', { sessao: true });
  removerArmazenado('modoRascunho', { sessao: true });
  leituraAtual++;
  cancelarNoAr();
  fecharDialogos();
  Object.assign(estado, {
    base: null, igrejaBase: null, origem: null, lidoEm: null, vista: null, cliente: null, usuario: '',
    modoRascunho: false, carregando: false, erroCarga: null, busca: '',
  });
  $('busca').value = '';
  formIgrejaSujo = false;
  mostrarTela('login');
  mostrarRecado('Você saiu. O rascunho continua guardado neste aparelho.');
}

/* ---------- Dados ---------- */

function carregarOps() {
  const rascunho = lerArmazenado('rascunho');
  const ops = Array.isArray(rascunho?.ops) ? rascunho.ops : [];
  return ops.filter((op) => ehObjeto(op)
    && (op.tipo === 'produto' || op.tipo === 'categoria')
    && ['criar', 'alterar', 'excluir'].includes(op.acao)
    && typeof op.id === 'string' && op.id);
}

function salvarRascunho() {
  if (!estado.ops.length) {
    removerArmazenado('rascunho');
    return;
  }
  if (!gravarArmazenado('rascunho', { ops: estado.ops })) {
    mostrarRecado('Atenção: não consegui guardar o rascunho neste aparelho (memória cheia ou bloqueada). Publique ou baixe o produtos.json antes de fechar.', { erro: true });
  }
}

const contarAlteracoes = () => estado.ops.length + (estado.rascunhoIgreja ? 1 : 0);

function recalcular() {
  estado.vista = estado.base ? aplicarAlteracoes(estado.base, estado.ops) : null;
}

function definirOps(ops) {
  estado.ops = ops;
  salvarRascunho();
  recalcular();
  renderizar();
  agendarLimpezaFotos();
}

function registrarOp(op) {
  definirOps(compactarOps(estado.ops, op, estado.base));
}

function abrirPainel() {
  estado.ops = carregarOps();
  const igreja = lerArmazenado('rascunhoIgreja');
  estado.rascunhoIgreja = ehObjeto(igreja) ? igreja : null;
  recalcular();
  mostrarTela('painel', { focar: false });
  renderizar();
  montarFormIgreja();
  carregarDados();
  if (estado.cliente && !estado.usuario) buscarUsuario();
  agendarLimpezaFotos();
}

function buscarUsuario() {
  const cliente = estado.cliente;
  cliente.usuario()
    .then((login) => {
      if (estado.cliente !== cliente) return;
      estado.usuario = login;
      renderSituacao();
    })
    .catch(() => { /* a leitura dos dados já trata chave inválida */ });
}

async function lerDoSite(caminho) {
  let resposta;
  try {
    resposta = await fetch(`${caminho}?v=${Date.now()}`, { cache: 'no-store' });
  } catch {
    throw new Error('Sem conexão. Verifique sua internet e tente de novo.');
  }
  if (!resposta.ok) throw new Error(`Não foi possível ler o arquivo ${caminho} do site (erro ${resposta.status}).`);
  try {
    return await resposta.json();
  } catch {
    throw new Error(`O arquivo ${caminho} está com erro de formato.`);
  }
}

let leituraAtual = 0;

// Com chave: sempre a versão mais nova pela API. Sem chave (ou se pedir): a cópia do GitHub Pages.
async function carregarDados() {
  const minha = ++leituraAtual;
  const cliente = estado.cliente;
  estado.carregando = true;
  estado.erroCarga = null;
  renderizar();
  try {
    let produtos;
    let igreja;
    let origem;
    if (cliente) {
      ({ produtos, igreja } = await cliente.lerDados());
      origem = 'api';
    } else {
      produtos = await lerDoSite(CAMINHO_PRODUTOS);
      if (!ehObjeto(produtos) || !Array.isArray(produtos.categorias) || !Array.isArray(produtos.produtos)) {
        throw new Error(`O arquivo ${CAMINHO_PRODUTOS} está com erro de formato.`);
      }
      try {
        igreja = await lerDoSite(CAMINHO_IGREJA);
      } catch {
        igreja = null; // sem igreja.json o catálogo continua funcionando
      }
      origem = 'site';
    }
    if (minha !== leituraAtual) return;
    Object.assign(estado, {
      base: produtos, igrejaBase: ehObjeto(igreja) ? igreja : null, origem, lidoEm: new Date(),
    });
    recalcular();
  } catch (erro) {
    if (minha !== leituraAtual) return;
    if (erro instanceof ErroGitHub && erro.tipo === 'chave-invalida') {
      estado.carregando = false;
      chaveRecusada(erro.message);
      return;
    }
    estado.erroCarga = erro;
  } finally {
    if (minha === leituraAtual) {
      estado.carregando = false;
      renderizar();
      if (!formIgrejaSujo) montarFormIgreja();
    }
  }
}

function chaveRecusada(mensagem) {
  esquecerToken();
  removerArmazenado('modoRascunho', { sessao: true });
  estado.modoRascunho = false;
  mostrarTelaChave(`${mensagem} Crie outra chave e cole abaixo. O rascunho continua guardado.`);
}

// Alterações do rascunho que não fazem mais sentido (item apagado em outro aparelho etc.).
function opsObsoletas() {
  if (!estado.base || !estado.vista) return [];
  const existe = (op) => (op.tipo === 'produto' ? estado.base.produtos : estado.base.categorias).some((x) => x.id === op.id);
  const categoriasUsadas = new Set(estado.vista.dados.produtos.map((p) => p.categoria));
  return estado.ops.filter((op) => (op.acao !== 'criar' && !existe(op))
    || (op.tipo === 'categoria' && op.acao === 'excluir' && categoriasUsadas.has(op.id)));
}

/* ---------- Desenho da tela ---------- */

function renderizar() {
  const foco = document.activeElement?.dataset?.foco;
  renderSituacao();
  renderAvisos();
  renderProdutos();
  renderCategorias();
  renderBarra();
  if (foco) restaurarFoco(foco);
}

function restaurarFoco(chave) {
  if (!chave) return false;
  const [tipo, ...resto] = chave.split(':');
  const id = resto.join(':');
  for (const candidato of [tipo, ...(FOCO_ALTERNATIVO[tipo] || [])]) {
    const alvo = document.querySelector(`[data-foco="${CSS.escape(`${candidato}:${id}`)}"]`);
    if (alvo && !alvo.disabled) {
      if (document.activeElement !== alvo) alvo.focus();
      return true;
    }
  }
  return false;
}

function renderSituacao() {
  const conectado = Boolean(estado.cliente);
  const conexao = $('conexao');
  conexao.textContent = conectado
    ? (estado.usuario ? `Conectado como ${estado.usuario}` : 'Chave do GitHub conectada')
    : 'Modo rascunho (sem chave)';
  conexao.classList.toggle('sem-chave', !conectado);
  $('conectar-chave').hidden = conectado;
  $('esquecer-chave').hidden = !lerToken();
  $('esquecer-chave').disabled = estado.publicando;
  $('dados-de').textContent = estado.carregando
    ? 'Carregando os dados…'
    : estado.lidoEm ? `Dados de ${formatarDataHoraBR(estado.lidoEm.toISOString())}` : 'Dados não carregados';
  $('atualizar').disabled = estado.carregando || estado.publicando;
  $('sair').disabled = estado.publicando;
}

function renderAvisos() {
  const blocos = [];
  if (estado.erroCarga) {
    const mensagem = estado.erroCarga instanceof Error && estado.erroCarga.message
      ? estado.erroCarga.message : 'Não foi possível carregar os dados.';
    const botoes = [botao('Tentar novamente', { classe: 'botao', aoClicar: () => carregarDados() })];
    blocos.push(caixaAviso({
      titulo: estado.base ? 'Não foi possível atualizar os dados' : 'Não foi possível carregar os dados',
      textos: [mensagem, estado.base ? 'Continuo mostrando a última versão lida.' : ''].filter(Boolean),
      botoes, erro: true,
    }));
  }
  if (estado.base && estado.origem === 'site') {
    const textos = ['Pode estar desatualizado em até 10 minutos'];
    if (estado.cliente) textos.push('Estes dados vieram da cópia do site. O Publicar sempre usa a versão mais nova do GitHub.');
    else textos.push('Modo rascunho: dá para preparar tudo e baixar o produtos.json. Para publicar direto e enviar fotos, conecte a chave do GitHub.');
    blocos.push(caixaAviso({ textos }));
  }
  if (estado.vista?.avisos.length) {
    const tirarObsoletas = async () => {
      const resposta = await abrirCaixa({
        titulo: 'Tirar essas partes do rascunho?',
        textos: ['Elas não valem mais e serão apagadas deste aparelho.'],
        botoes: [
          { valor: null, texto: 'Cancelar', foco: true },
          { valor: 'tirar', texto: 'Tirar do rascunho', classe: 'botao-perigo' },
        ],
      });
      if (resposta !== 'tirar') return;
      const obsoletas = opsObsoletas();
      definirOps(estado.ops.filter((op) => !obsoletas.includes(op)));
    };
    blocos.push(caixaAviso({
      titulo: 'Partes do rascunho que não valem mais',
      itens: estado.vista.avisos,
      botoes: opsObsoletas().length ? [botao('Tirar essas partes do rascunho', { aoClicar: tirarObsoletas })] : [],
    }));
  }
  $('avisos').replaceChildren(...blocos);
}

function renderBarra() {
  const n = contarAlteracoes();
  const mostrar = n > 0 && !$('tela-painel').hidden;
  $('barra').hidden = !mostrar;
  document.body.classList.toggle('com-barra', mostrar);
  $('barra-texto').replaceChildren(
    n === 1 ? '1 alteração não publicada' : `${n} alterações não publicadas`,
    el('span', { class: 'ponto', 'aria-hidden': 'true', text: ' •' }),
  );
  $('publicar').disabled = estado.publicando || !estado.base;
  $('descartar').disabled = estado.publicando;
}

function mapaDeOps(tipo) {
  return new Map(estado.ops.filter((op) => op.tipo === tipo).map((op) => [op.id, op.acao]));
}

function seloMudanca(acao) {
  if (acao === 'criar') return el('span', { class: 'selo selo-rascunho', text: 'Novo, não publicado' });
  if (acao === 'alterar') return el('span', { class: 'selo selo-rascunho', text: 'Alterado, não publicado' });
  return null;
}

function textoPreco(produto) {
  if (!precoValido(produto.precoCentavos)) return '';
  return temVariacoes(produto) ? `a partir de ${formatarPreco(precoMinimo(produto))}` : formatarPreco(produto.precoCentavos);
}

// Miniatura: foto publicada, foto pendente (IndexedDB) ou o ícone da categoria.
function miniatura(produto) {
  const caixa = el('span', { class: 'mini', 'aria-hidden': 'true' });
  const mostrarIcone = () => caixa.replaceChildren(icone(iconeDaCategoria(produto.categoria), 28));
  const caminho = [produto.miniatura, produto.imagem].find((v) => ehPendente(v) || imagemPermitida(v));
  if (!caminho) {
    mostrarIcone();
    return caixa;
  }
  const img = el('img', { alt: '', width: 56, height: 56, decoding: 'async' });
  img.addEventListener('error', mostrarIcone, { once: true });
  if (ehPendente(caminho)) {
    mostrarIcone();
    urlDaFoto(caminho.slice(PREFIXO_PENDENTE.length)).then((url) => {
      if (!url) return;
      img.src = url;
      caixa.replaceChildren(img);
    });
  } else {
    img.loading = 'lazy';
    img.src = caminho;
    caixa.append(img);
  }
  return caixa;
}

function interruptorVisivel(produto) {
  const visivel = produto.visivel !== false;
  return el('button', {
    type: 'button', class: 'interruptor', role: 'switch', 'aria-checked': String(visivel),
    'aria-label': `Visível no site: ${produto.nome}`, 'data-foco': `visivel:${produto.id}`,
    on: { click: () => alternarVisivel(produto) },
  },
  el('span', { class: 'trilho', 'aria-hidden': 'true' }, el('span', { class: 'bolinha' })),
  el('span', { class: 'interruptor-texto', 'aria-hidden': 'true', text: visivel ? 'Visível' : 'Oculto' }));
}

function linhaProduto(produto, { indice, total, setas, acaoNoRascunho }) {
  const preco = textoPreco(produto);
  const selos = [
    produto.visivel === false && el('span', { class: 'selo', text: 'Oculto' }),
    ehNovidade(produto) && el('span', { class: 'selo selo-novidade', text: `Novidade até ${formatarDiaMes(produto.novidadeAte)}` }),
    seloMudanca(acaoNoRascunho),
  ].filter(Boolean);

  const acoes = [
    botao('Editar', { foco: `editar:${produto.id}`, rotulo: `Editar ${produto.nome}`, aoClicar: () => abrirFormProduto(produto.id) }),
    botao('Duplicar', { foco: `duplicar:${produto.id}`, rotulo: `Duplicar ${produto.nome}`, aoClicar: () => duplicarProduto(produto) }),
    botao('Excluir', { classe: 'botao-secundario perigo', foco: `excluir:${produto.id}`, rotulo: `Excluir ${produto.nome}`, aoClicar: () => excluirProduto(produto) }),
  ];
  if (setas) {
    acoes.push(
      botao('↑', { classe: 'botao-secundario seta', foco: `subir:${produto.id}`, rotulo: `Subir ${produto.nome}`, desativado: indice === 0, aoClicar: () => moverProduto(produto, -1) }),
      botao('↓', { classe: 'botao-secundario seta', foco: `descer:${produto.id}`, rotulo: `Descer ${produto.nome}`, desativado: indice === total - 1, aoClicar: () => moverProduto(produto, 1) }),
    );
  }

  return el('li', { class: produto.visivel === false ? 'produto oculto' : 'produto' },
    el('div', { class: 'produto-linha' },
      miniatura(produto),
      el('div', { class: 'produto-info' },
        el('p', { class: 'produto-nome', text: produto.nome || '(sem nome)' }),
        preco ? el('p', { class: 'produto-preco', text: preco }) : el('p', { class: 'erro', text: 'Preço inválido: edite para corrigir' }),
        selos.length > 0 && el('p', { class: 'selos' }, selos)),
      interruptorVisivel(produto)),
    el('div', { class: 'acoes' }, acoes));
}

function combinaBusca(produto, nomeCategoria, termos) {
  const variacoes = temVariacoes(produto) ? produto.variacoes.map((v) => v?.nome) : [];
  const alvo = normalizarBusca([produto.nome, produto.descricao, produto.info, nomeCategoria, ...variacoes].filter(Boolean).join(' '));
  return termos.every((termo) => alvo.includes(termo));
}

function renderProdutos() {
  const lista = $('lista-produtos');
  const contagem = $('contagem');
  const pronto = Boolean(estado.vista);
  $('novo-produto').disabled = !pronto;
  $('baixar').disabled = !pronto;
  lista.setAttribute('aria-busy', String(estado.carregando && !pronto));
  if (!pronto) {
    lista.replaceChildren(el('p', {
      class: 'cartao vazio',
      text: estado.carregando ? 'Carregando os produtos…' : 'Os produtos ainda não foram carregados.',
    }));
    contagem.textContent = '';
    return;
  }

  const { dados } = estado.vista;
  const categorias = ordenarCategorias(dados.categorias);
  const idsCategorias = new Set(categorias.map((c) => c.id));
  const termos = normalizarBusca(estado.busca).split(' ').filter(Boolean);
  const buscando = termos.length > 0;
  const noRascunho = mapaDeOps('produto');

  const grupos = categorias.map((c) => ({
    categoria: c, nome: c.nome, produtos: ordenarProdutos(dados.produtos.filter((p) => p.categoria === c.id)),
  }));
  const semCategoria = ordenarProdutos(dados.produtos.filter((p) => !idsCategorias.has(p.categoria)));
  if (semCategoria.length) grupos.push({ categoria: null, nome: 'Sem categoria', produtos: semCategoria });

  let encontrados = 0;
  const secoes = [];
  grupos.forEach((grupo, n) => {
    const produtos = buscando ? grupo.produtos.filter((p) => combinaBusca(p, grupo.nome, termos)) : grupo.produtos;
    if (buscando && !produtos.length) return;
    encontrados += produtos.length;
    const ocultos = grupo.produtos.filter((p) => p.visivel === false).length;
    const idTitulo = `grupo-${n}`;
    // Setas só fora da busca (a ordem é da categoria inteira) e nunca em "Sem categoria".
    const setas = !buscando && grupo.categoria !== null;
    secoes.push(el('section', { class: 'grupo-produtos', 'aria-labelledby': idTitulo },
      el('h2', { id: idTitulo },
        grupo.nome,
        el('span', { class: 'grupo-contagem', text: ` ${plural(grupo.produtos.length, 'produto', 'produtos')}${ocultos ? `, ${plural(ocultos, 'oculto', 'ocultos')}` : ''}` })),
      grupo.categoria === null && caixaAviso({
        textos: ['Estes produtos estão numa categoria que não existe mais e não aparecem no site. Toque em Editar e escolha outra categoria.'],
        erro: true,
      }),
      produtos.length
        ? el('ul', { class: 'lista' }, produtos.map((p, indice) => linhaProduto(p, {
          indice, total: produtos.length, setas, acaoNoRascunho: noRascunho.get(p.id),
        })))
        : el('p', { class: 'cartao vazio', text: 'Nenhum produto nesta categoria.' })));
  });

  if (!secoes.length) {
    let mensagem = 'Nenhum produto ainda. Toque em “+ Novo produto”.';
    if (buscando) mensagem = `Nenhum produto encontrado para “${estado.busca.trim()}”.`;
    else if (!categorias.length) mensagem = 'Crie uma categoria na aba Categorias e depois adicione os produtos.';
    lista.replaceChildren(el('p', { class: 'cartao vazio', text: mensagem }));
  } else {
    lista.replaceChildren(...secoes);
  }

  const novoTexto = buscando ? plural(encontrados, 'produto encontrado', 'produtos encontrados') : '';
  if (contagem.textContent !== novoTexto) contagem.textContent = novoTexto;
}

function renderCategorias() {
  const lista = $('lista-categorias');
  if (!estado.vista) {
    lista.replaceChildren(el('li', {
      class: 'cartao vazio', text: estado.carregando ? 'Carregando as categorias…' : 'As categorias ainda não foram carregadas.',
    }));
    return;
  }
  const { dados } = estado.vista;
  const categorias = ordenarCategorias(dados.categorias);
  const noRascunho = mapaDeOps('categoria');
  if (!categorias.length) {
    lista.replaceChildren(el('li', { class: 'cartao vazio', text: 'Nenhuma categoria ainda. Crie a primeira acima.' }));
    return;
  }
  lista.replaceChildren(...categorias.map((c, indice) => {
    const produtos = dados.produtos.filter((p) => p.categoria === c.id);
    const ocultos = produtos.filter((p) => p.visivel === false).length;
    const resumo = produtos.length
      ? `${plural(produtos.length, 'produto', 'produtos')}${ocultos ? ` (${plural(ocultos, 'oculto', 'ocultos')})` : ''}`
      : 'Nenhum produto';
    return el('li', { class: 'categoria cartao' },
      el('div', { class: 'categoria-topo' },
        el('h3', { text: c.nome }),
        el('p', { class: 'dica', text: resumo }),
        seloMudanca(noRascunho.get(c.id))),
      el('div', { class: 'acoes' },
        botao('Renomear', { foco: `cat-renomear:${c.id}`, rotulo: `Renomear ${c.nome}`, aoClicar: () => renomearCategoria(c) }),
        botao('↑', { classe: 'botao-secundario seta', foco: `cat-subir:${c.id}`, rotulo: `Subir ${c.nome}`, desativado: indice === 0, aoClicar: () => moverCategoria(c, -1) }),
        botao('↓', { classe: 'botao-secundario seta', foco: `cat-descer:${c.id}`, rotulo: `Descer ${c.nome}`, desativado: indice === categorias.length - 1, aoClicar: () => moverCategoria(c, 1) }),
        botao('Excluir', { classe: 'botao-secundario perigo', foco: `cat-excluir:${c.id}`, rotulo: `Excluir ${c.nome}`, aoClicar: () => excluirCategoria(c) })));
  }));
}

/* ---------- Caixas de diálogo ---------- */

// Caixa genérica. Resolve com o "valor" do botão escolhido, ou null (Esc / Cancelar).
function abrirCaixa({ titulo, textos = [], conteudo = [], botoes, validar = null }) {
  const dialogo = $('dialogo-caixa');
  if (dialogo.open) return Promise.resolve(null);
  return new Promise((resolver) => {
    let resposta = null;
    const principal = botoes.find((b) => b.enviar);
    const responder = (valor) => {
      if (valor !== null && validar && !validar(valor)) return;
      resposta = valor;
      dialogo.close();
    };
    const formulario = el('form', { class: 'caixa-form', novalidate: true, on: { submit: (e) => { e.preventDefault(); responder(principal ? principal.valor : null); } } },
      el('h2', { id: 'caixa-titulo', text: titulo }),
      textos.map((t) => el('p', { text: t })),
      conteudo,
      el('div', { class: 'botoes-linha fim' }, botoes.map((b) => {
        const elemento = el('button', {
          type: b.enviar ? 'submit' : 'button', class: b.classe || 'botao-secundario', text: b.texto,
          on: b.enviar ? undefined : { click: () => responder(b.valor) },
        });
        if (b.foco) elemento.autofocus = true;
        return elemento;
      })));
    dialogo.replaceChildren(formulario);
    dialogo.addEventListener(FECHADO, () => {
      dialogo.replaceChildren();
      resolver(resposta);
    }, { once: true });
    dialogo.showModal();
  });
}

async function pedirTexto({ titulo, rotulo, valor = '', textoBotao = 'Salvar', validar }) {
  const campo = el('input', { id: 'caixa-texto', type: 'text', maxlength: 40, autocomplete: 'off', value: valor, 'aria-describedby': 'caixa-erro' });
  campo.autofocus = true;
  const saida = el('p', { id: 'caixa-erro', class: 'erro', role: 'alert', hidden: true });
  let resultado = null;
  const resposta = await abrirCaixa({
    titulo,
    conteudo: [el('div', { class: 'campo' }, el('label', { for: 'caixa-texto', text: rotulo }), campo, saida)],
    botoes: [
      { valor: null, texto: 'Cancelar' },
      { valor: 'ok', texto: textoBotao, classe: 'botao', enviar: true },
    ],
    validar: () => {
      const limpo = campo.value.trim().replace(/\s+/g, ' ');
      const mensagem = validar(limpo);
      definirErro(campo, saida, mensagem);
      if (mensagem) {
        campo.focus();
        return false;
      }
      resultado = limpo;
      return true;
    },
  });
  return resposta === 'ok' ? resultado : null;
}

// Folha grande (publicar, baixar): título, corpo rolável e botões embaixo.
function montarFolha(dialogo, { titulo, idTitulo, corpo = [], botoes = [], fechavel = true }) {
  const cabecalho = el('h2', { id: idTitulo, tabindex: '-1', text: titulo });
  dialogo.replaceChildren(el('div', { class: 'folha-form' },
    el('div', { class: 'folha-topo' },
      cabecalho,
      fechavel && el('button', { type: 'button', class: 'fechar', 'aria-label': 'Fechar', text: '✕', on: { click: () => dialogo.close() } })),
    el('div', { class: 'folha-corpo' }, corpo),
    botoes.length > 0 && el('div', { class: 'folha-rodape' }, botoes)));
  if (!dialogo.open) dialogo.showModal();
  cabecalho.focus();
}

/* ---------- Ações nos produtos ---------- */

function novoIdProduto(nome) {
  const usados = new Set([...estado.base.produtos, ...estado.vista.dados.produtos].map((p) => p.id));
  for (const op of estado.ops) usados.add(op.id);
  let agora = Date.now();
  let id = gerarIdProduto(nome, agora);
  while (usados.has(id)) id = gerarIdProduto(nome, ++agora);
  return id;
}

function alternarVisivel(produto) {
  const visivel = produto.visivel !== false;
  registrarOp({ tipo: 'produto', acao: 'alterar', id: produto.id, campos: { visivel: !visivel }, rotulo: produto.nome });
  mostrarRecado(visivel ? `“${produto.nome}” ficará oculto no site depois de publicar.` : `“${produto.nome}” voltará a aparecer no site depois de publicar.`);
}

function duplicarProduto(produto) {
  const nome = `${produto.nome} (cópia)`;
  const id = novoIdProduto(nome);
  const dados = { ...clonar(produto), id, nome, imagem: '', miniatura: '' };
  dados.ordem = proximaOrdemProduto(estado.vista.dados.produtos, produto.categoria);
  registrarOp({ tipo: 'produto', acao: 'criar', id, dados, rotulo: nome });
  mostrarRecado(`Cópia criada: “${nome}”.`);
  abrirFormProduto(id);
}

async function excluirProduto(produto) {
  const botoes = [{ valor: null, texto: 'Cancelar', foco: true }];
  if (produto.visivel !== false) botoes.push({ valor: 'ocultar', texto: 'Ocultar', classe: 'botao' });
  botoes.push({ valor: 'excluir', texto: 'Excluir', classe: 'botao-perigo' });
  const resposta = await abrirCaixa({
    titulo: `Excluir “${produto.nome}”?`,
    textos: [
      'Ocultar guarda o produto para você reativar depois.',
      'Excluir apaga o produto de vez quando você publicar.',
    ],
    botoes,
  });
  if (resposta === 'ocultar') {
    alternarVisivel(produto);
  } else if (resposta === 'excluir') {
    registrarOp({ tipo: 'produto', acao: 'excluir', id: produto.id, rotulo: produto.nome });
    focarSeSumiu($('novo-produto'));
    mostrarRecado(`“${produto.nome}” será excluído quando você publicar.`);
  }
}

// O botão que tinha o foco saiu da tela junto com o item excluído: leva o foco para um lugar previsível.
function focarSeSumiu(alvo) {
  const ativo = document.activeElement;
  if (!ativo || ativo === document.body || !ativo.isConnected) alvo.focus();
}

// Renumera a categoria inteira (10, 20, 30…) na ordem mostrada, troca com o vizinho
// e gera "alterar { ordem }" só para quem mudou.
function moverProduto(produto, direcao) {
  const irmaos = ordenarProdutos(estado.vista.dados.produtos.filter((p) => p.categoria === produto.categoria));
  const i = irmaos.findIndex((p) => p.id === produto.id);
  const j = i + direcao;
  if (i === -1 || j < 0 || j >= irmaos.length) return;
  [irmaos[i], irmaos[j]] = [irmaos[j], irmaos[i]];
  let ops = estado.ops;
  irmaos.forEach((p, n) => {
    const ordem = (n + 1) * 10;
    if (p.ordem !== ordem) {
      ops = compactarOps(ops, { tipo: 'produto', acao: 'alterar', id: p.id, campos: { ordem }, rotulo: p.nome }, estado.base);
    }
  });
  definirOps(ops);
}

/* ---------- Formulário de produto ---------- */

const form = {
  id: null,              // null = produto novo
  original: null,        // produto como estava ao abrir
  fotoNova: null,        // { foto, miniatura, extensao, url }
  removerFoto: false,
  novidadeInicial: false,
  vez: 0,                // invalida respostas antigas (foto sendo preparada, prévia)
  preparandoFoto: false,
  salvando: false,
  sujo: false,
  focoAoFechar: null,
  fechadoPeloNavegador: false, // o Voltar repetido do Android fechou sem perguntar
};
let contadorVariacao = 0;
let ultimaCategoria = '';
const fotosReservadas = new Set(); // fotos já gravadas no IndexedDB e ainda não presas a uma op

function preencherCategorias(seletor, valor) {
  const categorias = ordenarCategorias(estado.vista.dados.categorias);
  seletor.replaceChildren(
    el('option', { value: '', text: 'Escolha a categoria' }),
    ...categorias.map((c) => el('option', { value: c.id, text: c.nome })),
  );
  seletor.value = categorias.some((c) => c.id === valor) ? valor : '';
}

function linhaVariacao(variacao = {}) {
  const n = ++contadorVariacao;
  const idNome = `v-nome-${n}`;
  const idPreco = `v-preco-${n}`;
  const idErro = `v-erro-${n}`;
  const linha = el('div', { class: 'variacao' },
    el('div', { class: 'campo v-campo-nome' },
      el('label', { for: idNome, text: 'Opção' }),
      el('input', { id: idNome, class: 'v-nome', type: 'text', maxlength: 60, autocomplete: 'off', placeholder: 'Ex.: Infantil', value: texto(variacao.nome), 'aria-describedby': idErro })),
    el('div', { class: 'campo v-campo-preco' },
      el('label', { for: idPreco, text: 'Preço' }),
      el('div', { class: 'campo-preco' },
        el('span', { 'aria-hidden': 'true', text: 'R$' }),
        el('input', {
          id: idPreco, class: 'v-preco', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'Ex.: 59,90',
          value: precoValido(variacao.precoCentavos) ? centavosParaTexto(variacao.precoCentavos) : '', 'aria-describedby': idErro,
        }))),
    el('button', {
      type: 'button', class: 'botao-secundario perigo v-remover', 'aria-label': 'Remover esta variação', text: 'Remover',
      on: { click: () => { linha.remove(); form.sujo = true; $('p-nova-variacao').focus(); } },
    }),
    el('p', { id: idErro, class: 'erro v-erro', hidden: true }));
  return linha;
}

function abrirFormProduto(id = null) {
  if (!estado.vista) return;
  const dados = estado.vista.dados;
  const produto = id ? dados.produtos.find((p) => p.id === id) : null;
  if (id && !produto) {
    mostrarRecado('Este produto não está mais na lista.', { erro: true });
    return;
  }
  if (!produto && !dados.categorias.length) {
    avisarSemCategoria();
    return;
  }

  Object.assign(form, {
    id: produto ? produto.id : null,
    original: produto ? clonar(produto) : null,
    fotoNova: null,
    removerFoto: false,
    vez: form.vez + 1,
    preparandoFoto: false,
    salvando: false,
    sujo: false,
    fechadoPeloNavegador: false,
    focoAoFechar: document.activeElement?.dataset?.foco || (produto ? `editar:${produto.id}` : null),
  });

  $('produto-titulo').textContent = produto ? 'Editar produto' : 'Novo produto';
  $('p-nome').value = produto?.nome ?? '';
  preencherCategorias($('p-categoria'), produto ? produto.categoria : ultimaCategoria || ordenarCategorias(dados.categorias)[0]?.id);
  $('p-preco').value = precoValido(produto?.precoCentavos) ? centavosParaTexto(produto.precoCentavos) : '';
  $('p-descricao').value = texto(produto?.descricao);
  $('p-info').value = texto(produto?.info);
  $('p-variacoes').replaceChildren(...(temVariacoes(produto) ? produto.variacoes.map((v) => linhaVariacao(v)) : []));
  form.novidadeInicial = Boolean(produto) && ehNovidade(produto, hojeLocal());
  $('p-novidade').checked = form.novidadeInicial;
  atualizarTextoNovidade();
  $('p-visivel').checked = produto ? produto.visivel !== false : true;

  for (const [campo, saida] of [['p-nome', 'p-nome-erro'], ['p-categoria', 'p-categoria-erro'], ['p-preco', 'p-preco-erro']]) {
    definirErro($(campo), $(saida), '');
  }
  definirErro(null, $('p-erro-geral'), '');
  configurarCampoFoto();
  mostrarPrevia();
  $('produto-salvar').disabled = false;

  const dialogo = $('dialogo-produto');
  dialogo.querySelector('.folha-corpo').scrollTop = 0;
  dialogo.showModal();
  $('p-nome').focus();
}

async function avisarSemCategoria() {
  const resposta = await abrirCaixa({
    titulo: 'Crie uma categoria primeiro',
    textos: ['Todo produto precisa de uma categoria (ex.: Camisetas, Livros).'],
    botoes: [
      { valor: null, texto: 'Agora não' },
      { valor: 'ir', texto: 'Ir para Categorias', classe: 'botao', foco: true },
    ],
  });
  if (resposta === 'ir') {
    mostrarAba('categorias');
    $('nova-categoria').focus();
  }
}

function atualizarTextoNovidade() {
  const marcado = $('p-novidade').checked;
  const ate = form.original?.novidadeAte;
  let mensagem = 'Marcando, o produto ganha o selo “Novidade” por 30 dias.';
  if (marcado) {
    mensagem = `Novidade até ${formatarDiaMes(form.novidadeInicial ? ate : somarDias(hojeLocal(), DIAS_NOVIDADE))}`;
  } else if (form.novidadeInicial) {
    mensagem = 'Ao salvar, o selo “Novidade” sai do produto.';
  } else if (dataValida(ate)) {
    mensagem = `A novidade terminou em ${formatarDiaMes(ate)}. Marque para valer por mais 30 dias.`;
  }
  $('p-novidade-info').textContent = mensagem;
}

// Marcar = hoje + 30 dias (data local). Se já era novidade, salvar de novo NÃO renova. Desmarcar remove.
function novidadeEscolhida() {
  const marcado = $('p-novidade').checked;
  const ate = form.original?.novidadeAte;
  if (marcado) return form.novidadeInicial ? ate : somarDias(hojeLocal(), DIAS_NOVIDADE);
  if (form.novidadeInicial) return undefined;
  return dataValida(ate) ? ate : undefined; // vencida fica como está
}

function configurarCampoFoto() {
  const semChave = !estado.cliente;
  $('p-foto').disabled = semChave;
  $('p-foto-botao').classList.toggle('desativado', semChave);
  definirErro(null, $('p-foto-erro'), '');
  let info = '';
  if (semChave) info = 'Para enviar fotos, conecte a chave do GitHub';
  else if (ehPendente(form.original?.imagem)) info = 'Foto nova, ainda não publicada.';
  $('p-foto-info').textContent = info;
}

function fotoDoForm() {
  if (form.fotoNova) return { url: form.fotoNova.url };
  if (form.removerFoto || !form.original) return null;
  const caminho = [form.original.imagem, form.original.miniatura].find((v) => ehPendente(v) || imagemPermitida(v));
  return caminho ? { caminho } : null;
}

function mostrarPrevia() {
  const caixa = $('p-foto-previa');
  const foto = fotoDoForm();
  const semFoto = () => caixa.replaceChildren(
    icone(iconeDaCategoria($('p-categoria').value || form.original?.categoria), 40),
    el('span', { class: 'vh', text: 'Sem foto' }),
  );
  $('p-foto-remover').hidden = !foto;
  $('p-foto-botao').textContent = foto ? 'Trocar foto' : 'Escolher foto';
  if (!foto) {
    semFoto();
    return;
  }
  const img = el('img', { alt: 'Prévia da foto do produto', width: 120, height: 120 });
  img.addEventListener('error', semFoto, { once: true });
  if (foto.url) {
    img.src = foto.url;
    caixa.replaceChildren(img);
  } else if (ehPendente(foto.caminho)) {
    semFoto();
    const vez = form.vez;
    urlDaFoto(foto.caminho.slice(PREFIXO_PENDENTE.length)).then((url) => {
      if (!url || vez !== form.vez) return;
      img.src = url;
      caixa.replaceChildren(img);
    });
  } else {
    img.src = foto.caminho;
    caixa.replaceChildren(img);
  }
}

async function escolherFoto() {
  const entrada = $('p-foto');
  const arquivo = entrada.files?.[0];
  entrada.value = ''; // deixa escolher o mesmo arquivo de novo
  if (!arquivo || !estado.cliente) return;
  const vez = ++form.vez;
  form.preparandoFoto = true;
  $('produto-salvar').disabled = true;
  definirErro(null, $('p-foto-erro'), '');
  $('p-foto-info').textContent = 'Preparando a foto…';
  try {
    const resultado = await comprimirFoto(arquivo);
    if (vez !== form.vez || !$('dialogo-produto').open) return;
    if (form.fotoNova) URL.revokeObjectURL(form.fotoNova.url);
    form.fotoNova = { ...resultado, url: URL.createObjectURL(resultado.foto) };
    form.removerFoto = false;
    form.sujo = true;
    mostrarPrevia();
    $('p-foto-info').textContent = `Foto pronta: ${tamanhoArquivo(resultado.bytesFoto)} (miniatura ${tamanhoArquivo(resultado.bytesMiniatura)}). Ela vai para o site quando você publicar.`;
  } catch (erro) {
    if (vez !== form.vez) return;
    $('p-foto-info').textContent = '';
    definirErro(null, $('p-foto-erro'), erro?.message || 'Não foi possível preparar esta foto.');
  } finally {
    if (vez === form.vez) {
      form.preparandoFoto = false;
      $('produto-salvar').disabled = form.salvando;
    }
  }
}

function removerFotoDoForm() {
  if (form.fotoNova) URL.revokeObjectURL(form.fotoNova.url);
  form.fotoNova = null;
  form.removerFoto = true;
  form.preparandoFoto = false;
  form.sujo = true;
  form.vez++;
  $('produto-salvar').disabled = false;
  definirErro(null, $('p-foto-erro'), '');
  $('p-foto-info').textContent = estado.cliente ? 'O produto fica sem foto quando você salvar.' : 'Para enviar fotos, conecte a chave do GitHub';
  mostrarPrevia();
  ($('p-foto').disabled ? $('p-novidade') : $('p-foto')).focus();
}

// Formata como "74,50" só ao sair do campo (sem máscara enquanto digita).
function formatarCampoPreco(campo) {
  const saida = campo.id === 'p-preco' ? $('p-preco-erro') : campo.closest('.variacao')?.querySelector('.v-erro');
  const valor = campo.value.trim();
  if (!valor) {
    definirErro(campo, saida, '');
    return;
  }
  const centavos = lerPreco(valor);
  if (centavos === null) {
    definirErro(campo, saida, MSG_PRECO);
  } else {
    campo.value = centavosParaTexto(centavos);
    definirErro(campo, saida, '');
  }
}

function lerFormProduto() {
  const invalidos = [];

  const nome = $('p-nome').value.trim().replace(/\s+/g, ' ');
  definirErro($('p-nome'), $('p-nome-erro'), nome ? '' : 'Escreva o nome do produto.');
  if (!nome) invalidos.push($('p-nome'));

  const categoria = $('p-categoria').value;
  const categoriaExiste = estado.vista.dados.categorias.some((c) => c.id === categoria);
  definirErro($('p-categoria'), $('p-categoria-erro'), categoriaExiste ? '' : 'Escolha a categoria.');
  if (!categoriaExiste) invalidos.push($('p-categoria'));

  const precoTexto = $('p-preco').value.trim();
  const precoCentavos = lerPreco(precoTexto);
  definirErro($('p-preco'), $('p-preco-erro'), precoCentavos !== null ? '' : precoTexto ? MSG_PRECO : 'Digite o preço.');
  if (precoCentavos === null) invalidos.push($('p-preco'));
  else $('p-preco').value = centavosParaTexto(precoCentavos);

  const variacoes = [];
  for (const linha of $('p-variacoes').querySelectorAll('.variacao')) {
    const campoNome = linha.querySelector('.v-nome');
    const campoPreco = linha.querySelector('.v-preco');
    const saida = linha.querySelector('.v-erro');
    const vNome = campoNome.value.trim().replace(/\s+/g, ' ');
    const vTexto = campoPreco.value.trim();
    definirErro(campoNome, saida, '');
    definirErro(campoPreco, null, '');
    if (!vNome && !vTexto) continue; // linha vazia é ignorada
    const vPreco = lerPreco(vTexto);
    if (!vNome) {
      definirErro(campoNome, saida, 'Escreva o nome da opção (ex.: Infantil).');
      invalidos.push(campoNome);
    } else if (vPreco === null) {
      definirErro(campoPreco, saida, vTexto ? MSG_PRECO : 'Digite o preço desta opção.');
      invalidos.push(campoPreco);
    } else {
      campoPreco.value = centavosParaTexto(vPreco);
      variacoes.push({ nome: vNome, precoCentavos: vPreco });
    }
  }

  if (invalidos.length) {
    definirErro(null, $('p-erro-geral'), 'Confira os campos marcados.');
    invalidos[0].focus();
    return null;
  }
  definirErro(null, $('p-erro-geral'), '');
  return {
    nome,
    categoria,
    precoCentavos,
    descricao: $('p-descricao').value.trim(),
    info: $('p-info').value.trim(),
    variacoes,
    visivel: $('p-visivel').checked,
    novidadeAte: novidadeEscolhida(),
  };
}

// Monta os campos do produto. "undefined" = campo ausente (vira null no "alterar").
// Campos vazios que o produto original nem tinha continuam ausentes (sem alteração à toa).
function montarProduto(lido, chaveFoto) {
  const original = form.original;
  const tinha = (campo) => Boolean(original) && Object.prototype.hasOwnProperty.call(original, campo);
  const vazioOuAusente = (campo) => (!original || tinha(campo) ? '' : undefined);

  let imagem;
  let miniatura;
  if (chaveFoto) {
    imagem = `${PREFIXO_PENDENTE}${chaveFoto}`;
    miniatura = `${PREFIXO_PENDENTE}${chaveFoto}-mini`;
  } else if (form.removerFoto) {
    imagem = vazioOuAusente('imagem');
    miniatura = vazioOuAusente('miniatura');
  } else {
    imagem = original ? original.imagem : '';
    miniatura = original ? original.miniatura : '';
  }

  // Produto novo ou que mudou de categoria vai para o fim da categoria de destino.
  const outros = estado.vista.dados.produtos.filter((p) => p.id !== original?.id);
  const ordem = original && original.categoria === lido.categoria ? original.ordem : proximaOrdemProduto(outros, lido.categoria);

  return {
    categoria: lido.categoria,
    nome: lido.nome,
    descricao: lido.descricao || vazioOuAusente('descricao'),
    info: lido.info || undefined,
    precoCentavos: lido.precoCentavos,
    variacoes: lido.variacoes.length ? lido.variacoes : undefined,
    imagem,
    miniatura,
    visivel: lido.visivel && original && !tinha('visivel') ? undefined : lido.visivel, // sem o campo = visível
    novidadeAte: lido.novidadeAte,
    ordem,
  };
}

function gravarProduto(lido, chaveFoto) {
  const novo = montarProduto(lido, chaveFoto);
  if (!form.original) {
    const id = novoIdProduto(novo.nome);
    const dados = { id };
    for (const [campo, valor] of Object.entries(novo)) if (valor !== undefined) dados[campo] = valor;
    registrarOp({ tipo: 'produto', acao: 'criar', id, dados, rotulo: novo.nome });
    return 'criado';
  }
  const campos = {};
  for (const [campo, valor] of Object.entries(novo)) {
    const antes = form.original[campo];
    if (valor === undefined) {
      if (antes !== undefined) campos[campo] = null;
    } else if (!iguais(valor, antes)) {
      campos[campo] = valor;
    }
  }
  if (!Object.keys(campos).length) return 'igual';
  registrarOp({ tipo: 'produto', acao: 'alterar', id: form.original.id, campos, rotulo: novo.nome });
  return 'alterado';
}

async function salvarFormProduto(evento) {
  evento.preventDefault();
  if (form.salvando || !estado.vista) return;
  if (form.preparandoFoto) {
    definirErro(null, $('p-erro-geral'), 'Espere a foto terminar de ser preparada.');
    return;
  }
  const lido = lerFormProduto();
  if (!lido) return;

  form.salvando = true;
  $('produto-salvar').disabled = true;
  let chaveFoto = null;
  let resultado;
  try {
    if (form.fotoNova) {
      chaveFoto = `foto-${crypto.randomUUID()}`;
      fotosReservadas.add(chaveFoto);
      fotosReservadas.add(`${chaveFoto}-mini`);
      await salvarFoto(chaveFoto, form.fotoNova.foto);
      await salvarFoto(`${chaveFoto}-mini`, form.fotoNova.miniatura);
    }
    resultado = gravarProduto(lido, chaveFoto);
  } catch (erro) {
    definirErro(null, $('p-erro-geral'), erro?.message || 'Não foi possível salvar. Tente de novo.');
    form.salvando = false;
    $('produto-salvar').disabled = false;
    return;
  } finally {
    if (chaveFoto) {
      fotosReservadas.delete(chaveFoto);
      fotosReservadas.delete(`${chaveFoto}-mini`);
      agendarLimpezaFotos();
    }
  }

  ultimaCategoria = lido.categoria;
  form.salvando = false;
  form.sujo = false;
  $('dialogo-produto').close();
  if (resultado === 'criado') mostrarRecado(`“${lido.nome}” adicionado. Toque em Publicar para enviar ao site.`);
  else if (resultado === 'alterado') mostrarRecado(`Alterações em “${lido.nome}” guardadas. Toque em Publicar para enviar ao site.`);
  else mostrarRecado('Nada mudou neste produto.');
}

async function pedirFecharForm() {
  if (form.salvando) return;
  if (form.sujo || form.fotoNova) {
    const resposta = await abrirCaixa({
      titulo: 'Sair sem salvar?',
      textos: ['As mudanças deste produto serão perdidas.'],
      botoes: [
        { valor: null, texto: 'Continuar editando', foco: true },
        { valor: 'sair', texto: 'Sair sem salvar', classe: 'botao-perigo' },
      ],
    });
    if (resposta !== 'sair') return;
  }
  $('dialogo-produto').close();
}

function aoFecharForm() {
  if (form.fechadoPeloNavegador) {
    form.fechadoPeloNavegador = false;
    if (form.sujo || form.fotoNova) {
      // O navegador fechou o formulário à força: reabre para não perder o que foi digitado.
      $('dialogo-produto').showModal();
      pedirFecharForm();
      return;
    }
  }
  if (form.fotoNova) URL.revokeObjectURL(form.fotoNova.url);
  form.fotoNova = null;
  form.vez++;
  form.preparandoFoto = false;
  form.salvando = false;
  $('p-foto-previa').replaceChildren();
  if (!restaurarFoco(form.focoAoFechar)) $('novo-produto').focus();
}

/* ---------- Categorias ---------- */

function validarNomeCategoria(nome, idAtual) {
  if (!nome) return 'Escreva o nome da categoria.';
  const igual = estado.vista.dados.categorias.find((c) => c.id !== idAtual && normalizarBusca(c.nome) === normalizarBusca(nome));
  return igual ? `Já existe a categoria “${igual.nome}”.` : '';
}

function criarCategoria(evento) {
  evento.preventDefault();
  if (!estado.vista) return;
  const campo = $('nova-categoria');
  const nome = campo.value.trim().replace(/\s+/g, ' ');
  const mensagem = validarNomeCategoria(nome, null);
  definirErro(campo, $('nova-categoria-erro'), mensagem);
  if (mensagem) {
    campo.focus();
    return;
  }
  const ids = new Set([...estado.base.categorias, ...estado.vista.dados.categorias].map((c) => c.id));
  for (const op of estado.ops) if (op.tipo === 'categoria') ids.add(op.id);
  const id = gerarIdCategoria(nome, [...ids]);
  const ordem = proximaOrdemCategoria(estado.vista.dados.categorias);
  registrarOp({ tipo: 'categoria', acao: 'criar', id, dados: { id, nome, ordem }, rotulo: nome });
  campo.value = '';
  mostrarRecado(`Categoria “${nome}” criada. Toque em Publicar para enviar ao site.`);
}

async function renomearCategoria(categoria) {
  const nome = await pedirTexto({
    titulo: 'Renomear categoria',
    rotulo: 'Novo nome',
    valor: categoria.nome,
    validar: (valor) => validarNomeCategoria(valor, categoria.id),
  });
  if (!nome || nome === categoria.nome) return;
  // Só o nome muda; o id continua o mesmo.
  registrarOp({ tipo: 'categoria', acao: 'alterar', id: categoria.id, campos: { nome }, rotulo: nome });
}

function moverCategoria(categoria, direcao) {
  const lista = ordenarCategorias(estado.vista.dados.categorias);
  const i = lista.findIndex((c) => c.id === categoria.id);
  const j = i + direcao;
  if (i === -1 || j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  let ops = estado.ops;
  lista.forEach((c, n) => {
    const ordem = n + 1;
    if (c.ordem !== ordem) {
      ops = compactarOps(ops, { tipo: 'categoria', acao: 'alterar', id: c.id, campos: { ordem }, rotulo: c.nome }, estado.base);
    }
  });
  definirOps(ops);
}

async function excluirCategoria(categoria) {
  const produtos = estado.vista.dados.produtos.filter((p) => p.categoria === categoria.id);
  if (produtos.length) {
    const ocultos = produtos.filter((p) => p.visivel === false).length;
    await abrirCaixa({
      titulo: `Não dá para excluir “${categoria.nome}”`,
      textos: [
        `Ela tem ${plural(produtos.length, 'produto', 'produtos')}${ocultos ? `, contando ${plural(ocultos, 'oculto', 'ocultos')}` : ''}.`,
        'Mova esses produtos para outra categoria antes (Editar → Categoria) ou exclua os produtos.',
      ],
      botoes: [{ valor: 'ok', texto: 'Entendi', classe: 'botao', foco: true }],
    });
    return;
  }
  const resposta = await abrirCaixa({
    titulo: `Excluir a categoria “${categoria.nome}”?`,
    textos: ['Ela está vazia. A exclusão vale quando você publicar.'],
    botoes: [
      { valor: null, texto: 'Cancelar', foco: true },
      { valor: 'excluir', texto: 'Excluir', classe: 'botao-perigo' },
    ],
  });
  if (resposta !== 'excluir') return;
  registrarOp({ tipo: 'categoria', acao: 'excluir', id: categoria.id, rotulo: categoria.nome });
  focarSeSumiu($('nova-categoria'));
  mostrarRecado(`Categoria “${categoria.nome}” será excluída quando você publicar.`);
}

/* ---------- Informações da igreja (igreja.json) ---------- */

let formIgrejaSujo = false;
let contadorCulto = 0;

const igrejaAtual = () => estado.rascunhoIgreja ?? estado.igrejaBase;

function campoIgreja({ id, rotulo, valor = '', dica = '', multilinha = false, tipo = 'text', obrigatorio = false, maxlength = 200 }) {
  const idDica = dica ? `${id}-dica` : undefined;
  const entrada = multilinha
    ? el('textarea', { id, rows: 3, maxlength, 'aria-describedby': idDica })
    : el('input', { id, type: tipo, maxlength, autocomplete: 'off', required: obrigatorio, spellcheck: tipo === 'url' ? 'false' : undefined, 'aria-describedby': idDica });
  entrada.value = valor;
  return el('div', { class: 'campo' },
    el('label', { for: id }, rotulo, obrigatorio && el('span', { class: 'obrigatorio', 'aria-hidden': 'true', text: ' *' })),
    entrada,
    dica && el('p', { id: idDica, class: 'dica', text: dica }));
}

function linhaCulto(culto = {}) {
  const n = ++contadorCulto;
  const diaAtual = texto(culto.dia);
  const dia = el('select', { id: `culto-dia-${n}`, class: 'culto-dia' },
    el('option', { value: '', text: 'Escolha o dia' }),
    DIAS_SEMANA.map((d) => el('option', { value: d, text: d })),
    diaAtual && !DIAS_SEMANA.includes(diaAtual) && el('option', { value: diaAtual, text: diaAtual }));
  dia.value = diaAtual;
  const horario = el('input', { id: `culto-horario-${n}`, class: 'culto-horario', type: 'text', maxlength: 20, autocomplete: 'off', placeholder: 'Ex.: 19h30', value: texto(culto.horario) });
  const nome = el('input', { id: `culto-nome-${n}`, class: 'culto-nome', type: 'text', maxlength: 60, autocomplete: 'off', placeholder: 'Ex.: Culto da Família', value: texto(culto.nome) });
  const linha = el('div', { class: 'culto' },
    el('div', { class: 'campo' }, el('label', { for: dia.id, text: 'Dia' }), dia),
    el('div', { class: 'campo' }, el('label', { for: horario.id, text: 'Horário' }), horario),
    el('div', { class: 'campo culto-campo-nome' }, el('label', { for: nome.id, text: 'Nome do culto' }), nome),
    el('button', {
      type: 'button', class: 'botao-secundario perigo', 'aria-label': 'Remover este culto', text: 'Remover',
      on: { click: () => { linha.remove(); formIgrejaSujo = true; $('ig-novo-culto').focus(); } },
    }));
  return linha;
}

function montarFormIgreja() {
  const caixa = $('igreja-campos');
  $('igreja-erro').hidden = true;
  $('igreja-desfazer').hidden = !estado.rascunhoIgreja;
  $('igreja-salvar').disabled = !estado.base;
  formIgrejaSujo = false;
  if (!estado.base) {
    caixa.replaceChildren(el('p', { class: 'cartao vazio', text: estado.carregando ? 'Carregando as informações…' : 'As informações ainda não foram carregadas.' }));
    return;
  }

  const ig = igrejaAtual() || {};
  const loja = ehObjeto(ig.loja) ? ig.loja : {};
  const endereco = ehObjeto(ig.endereco) ? ig.endereco : {};
  const links = ehObjeto(ig.links) ? ig.links : {};
  const instagram = ehObjeto(links.instagram) ? links.instagram : {};
  const youtube = ehObjeto(links.youtube) ? links.youtube : {};
  const lista = (valor) => (Array.isArray(valor) ? valor.map(texto).filter(Boolean) : []);
  const secao = (titulo, ...filhos) => el('section', { class: 'cartao' }, el('h2', { text: titulo }), filhos);

  const cultos = el('div', { id: 'ig-cultos', class: 'cultos' },
    (Array.isArray(ig.cultos) ? ig.cultos : []).filter(ehObjeto).map((c) => linhaCulto(c)));

  caixa.replaceChildren(...[
    !estado.igrejaBase && !estado.rascunhoIgreja && caixaAviso({
      textos: ['Não consegui ler o arquivo data/igreja.json (faltando ou com erro de digitação). Preencha abaixo e salve: ao publicar, o arquivo é gravado de novo, certinho.'],
      erro: true,
    }),
    secao('Loja',
      campoIgreja({ id: 'ig-pagamentos', rotulo: 'Formas de pagamento', valor: lista(loja.pagamentos).join('\n'), multilinha: true, dica: 'Uma por linha (ex.: Pix, depois Cartão, depois Dinheiro). Vazio = não aparece no site.' }),
      campoIgreja({ id: 'ig-local', rotulo: 'Onde fica a loja', valor: texto(loja.local), dica: 'Ex.: balcão da loja, dentro da igreja. Vazio = não aparece.' }),
      campoIgreja({ id: 'ig-horario', rotulo: 'Horário da loja', valor: texto(loja.horario), dica: 'Ex.: antes e depois dos cultos. Vazio = não aparece.' }),
      campoIgreja({ id: 'ig-aviso', rotulo: 'Aviso da loja', valor: texto(loja.aviso), multilinha: true })),
    secao('Cultos',
      cultos,
      el('button', {
        id: 'ig-novo-culto', type: 'button', class: 'botao-secundario', text: '+ Adicionar culto',
        on: { click: () => { const linha = linhaCulto(); cultos.append(linha); formIgrejaSujo = true; linha.querySelector('select').focus(); } },
      })),
    secao('Igreja',
      campoIgreja({ id: 'ig-nome', rotulo: 'Nome da igreja', valor: texto(ig.nome), obrigatorio: true, maxlength: 120 }),
      campoIgreja({ id: 'ig-nome-curto', rotulo: 'Nome curto', valor: texto(ig.nomeCurto), maxlength: 60 }),
      campoIgreja({ id: 'ig-slogan', rotulo: 'Slogan', valor: texto(ig.slogan), maxlength: 120 }),
      campoIgreja({ id: 'ig-boas-vindas', rotulo: 'Boas-vindas', valor: texto(ig.boasVindas), maxlength: 160 }),
      campoIgreja({ id: 'ig-endereco', rotulo: 'Endereço', valor: texto(endereco.texto), maxlength: 200 }),
      campoIgreja({ id: 'ig-mapa', rotulo: 'Link “Como chegar”', valor: texto(endereco.comoChegarUrl), tipo: 'url', maxlength: 500, dica: 'Link do Google Maps, começando com https://' })),
    secao('Links',
      campoIgreja({ id: 'ig-instagram-url', rotulo: 'Instagram (link)', valor: texto(instagram.url), tipo: 'url', maxlength: 300 }),
      campoIgreja({ id: 'ig-instagram-rotulo', rotulo: 'Instagram (nome mostrado)', valor: texto(instagram.rotulo), maxlength: 60, dica: 'Ex.: @sara.biguacu' }),
      campoIgreja({ id: 'ig-youtube-url', rotulo: 'YouTube (link)', valor: texto(youtube.url), tipo: 'url', maxlength: 300 }),
      campoIgreja({ id: 'ig-youtube-rotulo', rotulo: 'YouTube (texto do botão)', valor: texto(youtube.rotulo), maxlength: 60 })),
    secao('Ministérios',
      campoIgreja({ id: 'ig-ministerios', rotulo: 'Ministérios', valor: lista(ig.ministerios).join('\n'), multilinha: true, maxlength: 2000, dica: 'Um por linha.' })),
  ].filter(Boolean));
}

function lerFormIgreja() {
  const valor = (id) => $(id).value.trim();
  const linhas = (id) => $(id).value.split('\n').map((t) => t.trim()).filter(Boolean);
  const invalidos = [];
  const mensagens = [];
  const marcar = (campo, mensagem) => {
    campo.setAttribute('aria-invalid', 'true');
    invalidos.push(campo);
    if (!mensagens.includes(mensagem)) mensagens.push(mensagem);
  };
  for (const campo of $('form-igreja').querySelectorAll('[aria-invalid]')) campo.removeAttribute('aria-invalid');

  const nome = valor('ig-nome');
  if (!nome) marcar($('ig-nome'), 'Escreva o nome da igreja.');
  for (const [id, quem] of [['ig-mapa', '“Como chegar”'], ['ig-instagram-url', 'Instagram'], ['ig-youtube-url', 'YouTube']]) {
    const url = valor(id);
    if (url && !linkHttps(url)) marcar($(id), `O link do ${quem} precisa ser um endereço completo começando com https://`);
  }

  const cultos = [];
  for (const linha of $('ig-cultos').querySelectorAll('.culto')) {
    const dia = linha.querySelector('.culto-dia');
    const horario = linha.querySelector('.culto-horario');
    const nomeCulto = linha.querySelector('.culto-nome');
    const culto = { dia: dia.value.trim(), horario: horario.value.trim(), nome: nomeCulto.value.trim() };
    if (!culto.dia && !culto.horario && !culto.nome) continue;
    if (!culto.dia) marcar(dia, 'Escolha o dia de cada culto.');
    if (!culto.horario) marcar(horario, 'Escreva o horário de cada culto.');
    cultos.push(culto);
  }

  if (invalidos.length) {
    definirErro(null, $('igreja-erro'), mensagens.join(' '));
    invalidos[0].focus();
    return null;
  }

  // Mantém qualquer campo extra que o arquivo já tenha.
  const atual = igrejaAtual() || {};
  const loja = ehObjeto(atual.loja) ? atual.loja : {};
  const endereco = ehObjeto(atual.endereco) ? atual.endereco : {};
  const links = ehObjeto(atual.links) ? atual.links : {};
  return {
    ...atual,
    nome,
    nomeCurto: valor('ig-nome-curto'),
    slogan: valor('ig-slogan'),
    boasVindas: valor('ig-boas-vindas'),
    endereco: { ...endereco, texto: valor('ig-endereco'), comoChegarUrl: valor('ig-mapa') },
    cultos,
    links: {
      ...links,
      instagram: { ...(ehObjeto(links.instagram) ? links.instagram : {}), url: valor('ig-instagram-url'), rotulo: valor('ig-instagram-rotulo') },
      youtube: { ...(ehObjeto(links.youtube) ? links.youtube : {}), url: valor('ig-youtube-url'), rotulo: valor('ig-youtube-rotulo') },
    },
    ministerios: linhas('ig-ministerios'),
    loja: { ...loja, pagamentos: linhas('ig-pagamentos'), local: valor('ig-local'), horario: valor('ig-horario'), aviso: valor('ig-aviso') },
  };
}

function salvarIgreja(evento) {
  evento.preventDefault();
  if (!estado.base) return;
  const igreja = lerFormIgreja();
  if (!igreja) return;
  definirErro(null, $('igreja-erro'), '');
  if (iguais(igreja, estado.igrejaBase)) {
    estado.rascunhoIgreja = null;
    removerArmazenado('rascunhoIgreja');
    mostrarRecado('As informações estão iguais às publicadas.');
  } else if (!gravarArmazenado('rascunhoIgreja', igreja)) {
    definirErro(null, $('igreja-erro'), 'Não consegui guardar neste aparelho (memória cheia ou bloqueada).');
    return;
  } else {
    estado.rascunhoIgreja = igreja;
    mostrarRecado('Informações salvas. Toque em Publicar para enviar ao site.');
  }
  formIgrejaSujo = false;
  $('igreja-desfazer').hidden = !estado.rascunhoIgreja;
  renderBarra();
}

async function desfazerIgreja() {
  const resposta = await abrirCaixa({
    titulo: 'Desfazer as mudanças nas informações?',
    textos: ['As informações voltam a ser as que estão publicadas no site.'],
    botoes: [
      { valor: null, texto: 'Cancelar', foco: true },
      { valor: 'desfazer', texto: 'Desfazer', classe: 'botao-perigo' },
    ],
  });
  if (resposta !== 'desfazer') return;
  estado.rascunhoIgreja = null;
  removerArmazenado('rascunhoIgreja');
  montarFormIgreja();
  renderBarra();
  mostrarRecado('Mudanças nas informações desfeitas.');
}

/* ---------- Fotos pendentes (IndexedDB) ---------- */

const urlsFotos = new Map(); // chave → Promise<objectURL | null>

function urlDaFoto(chave) {
  if (!urlsFotos.has(chave)) {
    const promessa = lerFoto(chave)
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null)
      .then((url) => {
        if (!url) urlsFotos.delete(chave);
        return url;
      });
    urlsFotos.set(chave, promessa);
  }
  return urlsFotos.get(chave);
}

function esquecerUrlDaFoto(chave) {
  const promessa = urlsFotos.get(chave);
  if (!promessa) return;
  urlsFotos.delete(chave);
  promessa.then((url) => { if (url) URL.revokeObjectURL(url); });
}

// Apaga do IndexedDB as fotos que nenhum rascunho usa mais (foto trocada, produto excluído, publicado…).
async function limparFotosOrfas() {
  const usadas = fotosPendentesUsadas(estado.ops);
  for (const chave of fotosPendentesUsadas(carregarOps())) usadas.add(chave); // outra aba aberta
  const guardadas = await listarFotos();
  for (const chave of guardadas) {
    if (usadas.has(chave) || fotosReservadas.has(chave)) continue;
    await apagarFoto(chave);
    esquecerUrlDaFoto(chave);
  }
}

let filaLimpeza = Promise.resolve();
function agendarLimpezaFotos() {
  filaLimpeza = filaLimpeza.then(limparFotosOrfas).catch(() => { /* sem IndexedDB: nada a limpar */ });
}

async function obterFoto(chave) {
  const blob = await lerFoto(chave);
  if (!blob) throw new Error('Foto não encontrada neste aparelho.');
  return { base64: await blobParaBase64(blob), extensao: blob.type === 'image/webp' ? 'webp' : 'jpg' };
}

async function fotosQueFaltam(dados) {
  const pendentes = [];
  for (const p of dados.produtos) {
    for (const campo of ['imagem', 'miniatura']) {
      if (ehPendente(p[campo])) pendentes.push({ chave: p[campo].slice(PREFIXO_PENDENTE.length), nome: p.nome || p.id });
    }
  }
  if (!pendentes.length) return [];
  let guardadas;
  try {
    guardadas = new Set(await listarFotos());
  } catch {
    guardadas = new Set();
  }
  return [...new Set(pendentes.filter((f) => !guardadas.has(f.chave)).map((f) => f.nome))];
}

/* ---------- Publicar ---------- */

function descreverOp(op) {
  const nome = op.rotulo || op.dados?.nome || op.campos?.nome || op.id;
  const campos = Object.keys(op.campos || {});
  if (op.tipo === 'produto') {
    if (op.acao === 'criar') return `Novo produto: ${nome}`;
    if (op.acao === 'excluir') return `Excluído: ${nome}`;
    if (campos.length === 1 && campos[0] === 'visivel') return op.campos.visivel === false ? `Ocultado: ${nome}` : `Reativado: ${nome}`;
    return `Alterado: ${nome} (${[...new Set(campos.map((c) => ROTULOS_CAMPOS[c] || c))].join(', ')})`;
  }
  if (op.acao === 'criar') return `Nova categoria: ${nome}`;
  if (op.acao === 'excluir') return `Categoria excluída: ${nome}`;
  if (campos.length === 1 && campos[0] === 'nome') return `Categoria renomeada: ${nome}`;
  if (campos.length === 1 && campos[0] === 'ordem') return `Categoria mudou de posição: ${nome}`;
  return `Categoria alterada: ${nome}`;
}

function descreverAlteracoes() {
  const itens = estado.ops.map(descreverOp);
  if (estado.rascunhoIgreja) itens.push('Informações da igreja e da loja');
  return itens;
}

// Resumo para a mensagem do commit ("Catálogo: ..."); o github.js corta se ficar comprido.
function resumoCommit(ops, igreja) {
  const grupos = new Map([
    ['produto:criar', 'novo'], ['produto:alterar', 'alterado'], ['produto:excluir', 'excluído'],
    ['categoria:criar', 'categoria nova'], ['categoria:alterar', 'categoria alterada'], ['categoria:excluir', 'categoria excluída'],
  ].map(([chave, rotulo]) => [chave, { rotulo, nomes: [] }]));
  for (const op of ops) grupos.get(`${op.tipo}:${op.acao}`)?.nomes.push(op.rotulo || op.dados?.nome || op.id);
  const partes = [...grupos.values()].filter((g) => g.nomes.length).map((g) => `${g.rotulo}: ${g.nomes.join(', ')}`);
  if (igreja) partes.push('informações da igreja');
  return partes.join('; ');
}

function iniciarPublicacao() {
  if (!estado.vista || estado.publicando) return;
  if (!contarAlteracoes()) {
    mostrarRecado('Não há alterações para publicar.');
    return;
  }
  if (!estado.cliente) {
    publicarSemChave();
    return;
  }
  mostrarRevisao();
}

async function publicarSemChave() {
  const resposta = await abrirCaixa({
    titulo: 'Publicar precisa da chave do GitHub',
    textos: [
      'Para publicar direto daqui (e enviar fotos), conecte a chave do GitHub.',
      'Sem a chave, baixe o produtos.json e publique à mão no GitHub.',
    ],
    botoes: [
      { valor: null, texto: 'Cancelar' },
      { valor: 'baixar', texto: 'Baixar produtos.json' },
      { valor: 'conectar', texto: 'Conectar chave', classe: 'botao', foco: true },
    ],
  });
  if (resposta === 'conectar') mostrarTelaChave();
  else if (resposta === 'baixar') abrirBaixar();
}

const dialogoPublicar = () => $('dialogo-publicar');
const folhaPublicar = (opcoes) => montarFolha(dialogoPublicar(), { idTitulo: 'publicar-titulo', ...opcoes });
const fecharPublicar = () => botao('Fechar', { aoClicar: () => dialogoPublicar().close() });

async function mostrarRevisao() {
  if (!estado.cliente) {
    dialogoPublicar().close();
    publicarSemChave();
    return;
  }
  recalcular();
  if (!estado.vista) {
    folhaPublicar({ titulo: 'Publicar alterações', corpo: [caixaAviso({ textos: ['Os dados não carregaram. Toque em Atualizar e tente de novo.'], erro: true })], botoes: [fecharPublicar()] });
    return;
  }
  const { dados, avisos } = estado.vista;
  const erros = validarCatalogo(dados, { permitirPendentes: true });
  for (const nome of await fotosQueFaltam(dados)) {
    erros.push(`Produto “${nome}”: a foto nova não está mais neste aparelho. Edite o produto e escolha a foto de novo.`);
  }
  const atencao = [...avisos];
  if (formIgrejaSujo) atencao.push('Você mexeu na aba Informações e não salvou. Essas mudanças não vão nesta publicação.');

  const n = contarAlteracoes();
  const corpo = [
    el('p', { text: 'Estas alterações vão para o site:' }),
    el('ul', { class: 'lista-alteracoes' }, descreverAlteracoes().map((t) => el('li', { text: t }))),
    atencao.length > 0 && caixaAviso({ titulo: 'Atenção', itens: atencao }),
  ];
  if (erros.length) {
    corpo.push(caixaAviso({ titulo: 'Corrija antes de publicar', itens: erros, erro: true }));
    folhaPublicar({ titulo: `Publicar ${plural(n, 'alteração', 'alterações')}`, corpo, botoes: [fecharPublicar()] });
    return;
  }
  corpo.push(el('p', { class: 'dica', text: 'Tudo vai num envio só. O site atualiza para todos normalmente em 1 a 2 minutos (pode levar até 10).' }));
  folhaPublicar({
    titulo: `Publicar ${plural(n, 'alteração', 'alterações')}`,
    corpo,
    botoes: [
      botao('Cancelar', { aoClicar: () => dialogoPublicar().close() }),
      botao('Publicar agora', { classe: 'botao', aoClicar: publicarAgora }),
    ],
  });
}

async function publicarAgora() {
  const cliente = estado.cliente;
  if (!cliente || estado.publicando) return;
  const ops = clonar(estado.ops);
  const igreja = estado.rascunhoIgreja ? clonar(estado.rascunhoIgreja) : null;
  estado.publicando = true;
  // Uma leitura que ainda estava em andamento traria a versão de antes da publicação: descarta.
  leituraAtual++;
  estado.carregando = false;
  cancelarNoAr();
  renderSituacao();
  renderBarra();
  folhaPublicar({
    titulo: 'Publicando…',
    fechavel: false,
    corpo: [
      el('div', { class: 'progresso' },
        el('span', { class: 'girando', 'aria-hidden': 'true' }),
        el('p', { id: 'pub-progresso', role: 'status', 'aria-live': 'polite', text: 'Preparando…' })),
      el('p', { text: 'Não feche o painel até terminar.' }),
    ],
  });
  try {
    const resultado = await cliente.publicar({
      ops,
      igreja,
      obterFoto,
      resumo: resumoCommit(ops, igreja),
      aoProgresso: (mensagem) => {
        const saida = $('pub-progresso');
        if (saida) saida.textContent = mensagem;
      },
    });
    estado.publicando = false;
    concluirPublicacao(resultado, ops, igreja);
  } catch (erro) {
    estado.publicando = false;
    mostrarErroPublicacao(erro); // o rascunho fica intacto
  } finally {
    estado.publicando = false;
    renderizar();
  }
}

function concluirPublicacao(resultado, opsPublicadas, igrejaPublicada) {
  // A nova base é exatamente o que acabou de ser commitado (não relê do Pages).
  estado.base = resultado.produtos;
  if (resultado.igreja !== undefined) estado.igrejaBase = ehObjeto(resultado.igreja) ? resultado.igreja : null;
  Object.assign(estado, { origem: 'api', lidoEm: new Date(), erroCarga: null });

  // Tira do rascunho só o que foi publicado. Relê o que está guardado, porque outra aba
  // pode ter mexido no rascunho durante o envio (o evento "storage" fica parado enquanto publica).
  const guardado = lerArmazenado('rascunho');
  const atuais = Array.isArray(guardado?.ops) ? carregarOps() : estado.ops;
  const publicadas = new Set(opsPublicadas.map((op) => JSON.stringify(op)));
  estado.ops = atuais.filter((op) => !publicadas.has(JSON.stringify(op)));
  salvarRascunho();
  const igrejaGuardada = lerArmazenado('rascunhoIgreja');
  if (ehObjeto(igrejaGuardada)) estado.rascunhoIgreja = igrejaGuardada;
  if (igrejaPublicada && iguais(estado.rascunhoIgreja, igrejaPublicada)) {
    estado.rascunhoIgreja = null;
    removerArmazenado('rascunhoIgreja');
  }
  recalcular();
  if (!formIgrejaSujo) montarFormIgreja();
  agendarLimpezaFotos();

  folhaPublicar({
    titulo: 'Enviado!',
    corpo: [
      el('p', { class: 'sucesso', text: 'Enviado! O site atualiza para todos normalmente em 1 a 2 minutos (pode levar até 10).' }),
      resultado.avisos?.length > 0 && caixaAviso({ titulo: 'Atenção', itens: resultado.avisos }),
      el('p', { id: 'pub-no-ar', class: 'no-ar-texto', role: 'status', 'aria-live': 'polite', text: 'Conferindo se já está no ar…' }),
    ],
    botoes: [botao('Fechar', { classe: 'botao', aoClicar: () => dialogoPublicar().close() })],
  });
  acompanharNoAr(resultado.produtos?.atualizadoEm);
}

function botaoTentarDeNovo(segundos, acao) {
  const elemento = botao('Tentar novamente', { classe: 'botao', aoClicar: acao });
  let resta = Math.ceil(Number(segundos) || 0);
  if (resta > 0) {
    elemento.disabled = true;
    elemento.textContent = `Tentar novamente (${resta}s)`;
    const relogio = setInterval(() => {
      resta--;
      if (!elemento.isConnected || resta <= 0) {
        clearInterval(relogio);
        elemento.disabled = false;
        elemento.textContent = 'Tentar novamente';
      } else {
        elemento.textContent = `Tentar novamente (${resta}s)`;
      }
    }, 1000);
  }
  return elemento;
}

function mostrarErroPublicacao(erro) {
  const doGitHub = erro instanceof ErroGitHub;
  const tipo = doGitHub ? erro.tipo : 'desconhecido';
  const corpo = [el('p', { class: 'erro', text: doGitHub ? erro.message : `Erro inesperado ao publicar: ${erro?.message || erro}` })];
  const detalhes = doGitHub && Array.isArray(erro.detalhes)
    ? erro.detalhes.map(String).filter((d) => d && !erro.message.includes(d)) : [];
  if (detalhes.length) corpo.push(el('ul', { class: 'lista-alteracoes' }, detalhes.map((d) => el('li', { text: d }))));
  const botoes = [fecharPublicar()];

  if (tipo === 'chave-invalida') {
    esquecerToken(); // 401: apaga a chave e pede outra
    removerArmazenado('modoRascunho', { sessao: true });
    corpo.push(el('p', { text: 'A chave foi apagada deste aparelho. Crie outra no GitHub e cole no painel.' }));
    botoes.push(botao('Conectar outra chave', { classe: 'botao', aoClicar: () => mostrarTelaChave('Chave do GitHub inválida ou expirada.') }));
  } else if (tipo === 'sem-permissao') {
    corpo.push(el('p', { text: 'Confira se a chave foi criada na conta leonardo681, só para o PRACIMA, com Contents: Read and write.' }));
    botoes.push(botao('Trocar a chave', { classe: 'botao', aoClicar: () => { esquecerToken(); mostrarTelaChave(); } }));
  } else if (tipo === 'conflito') {
    botoes.push(botao('Recarregar e tentar de novo', {
      classe: 'botao',
      aoClicar: async () => {
        folhaPublicar({ titulo: 'Recarregando…', fechavel: false, corpo: [el('p', { role: 'status', text: 'Lendo a versão mais nova do catálogo…' })] });
        await carregarDados();
        if (dialogoPublicar().open) mostrarRevisao();
      },
    }));
  } else if (['rede', 'limite', 'nao-encontrado', 'desconhecido'].includes(tipo)) {
    botoes.push(botaoTentarDeNovo(tipo === 'limite' ? erro.esperarSegundos : 0, publicarAgora));
  }
  corpo.push(el('p', { class: 'dica', text: 'Suas alterações continuam guardadas neste aparelho.' }));
  folhaPublicar({ titulo: 'Não foi possível publicar', corpo, botoes });
}

/* ---------- "Já está no ar?" ---------- */

let geracaoNoAr = 0;

function cancelarNoAr() {
  geracaoNoAr++;
  $('no-ar').hidden = true;
  $('no-ar').replaceChildren();
}

function textoNoAr(mensagem, comLink) {
  if (!comLink) return [mensagem];
  return [
    'Ainda não apareceu. Veja em ',
    el('a', { href: URL_ACTIONS, target: '_blank', rel: 'noopener noreferrer', class: 'link-forte', text: URL_ACTIONS.replace(/^https:\/\//, '') }),
    ' se a publicação deu erro.',
  ];
}

function definirNoAr(mensagem, { comLink = false, final = false } = {}) {
  const caixa = $('no-ar');
  caixa.replaceChildren(el('p', {}, textoNoAr(mensagem, comLink)));
  if (final) {
    caixa.append(botao('OK', { classe: 'botao-secundario pequeno', aoClicar: () => { caixa.hidden = true; caixa.replaceChildren(); } }));
  }
  caixa.hidden = false;
  const noDialogo = $('pub-no-ar');
  if (noDialogo) noDialogo.replaceChildren(...textoNoAr(mensagem, comLink));
}

async function acompanharNoAr(atualizadoEm) {
  if (!atualizadoEm) return;
  const minha = ++geracaoNoAr;
  const cancelado = () => minha !== geracaoNoAr;
  const esperar = (ms) => new Promise((resolver, rejeitar) => {
    setTimeout(() => (cancelado() ? rejeitar(new Error('cancelado')) : resolver()), ms);
  });
  definirNoAr('Conferindo se já está no ar…');
  try {
    const noAr = await aguardarNoAr({
      atualizadoEm,
      esperar,
      aoTentar: (tentativa) => {
        if (!cancelado() && tentativa > 1) definirNoAr(`Conferindo se já está no ar… (${tentativa}ª verificação)`);
      },
    });
    if (cancelado()) return;
    if (noAr) definirNoAr('✅ Já está no ar para todos', { final: true });
    else definirNoAr('', { comLink: true, final: true });
  } catch {
    /* cancelado por outra publicação ou pelo "Sair" */
  }
}

/* ---------- Baixar produtos.json (publicar à mão) ---------- */

function prepararProdutosParaBaixar() {
  const { dados, avisos } = aplicarAlteracoes(estado.base, estado.ops);
  // Fotos pendentes não vão no arquivo: volta para a foto publicada (ou nenhuma).
  let fotosFora = 0;
  for (const p of dados.produtos) {
    const original = estado.base.produtos.find((b) => b.id === p.id);
    let trocou = false;
    for (const campo of ['imagem', 'miniatura']) {
      if (!ehPendente(p[campo])) continue;
      p[campo] = original && imagemPermitida(original[campo]) ? original[campo] : '';
      trocou = true;
    }
    if (trocou) fotosFora++;
  }
  dados.atualizadoEm = agoraISOLocal();
  return { dados, avisos, fotosFora, erros: validarCatalogo(dados), texto: `${JSON.stringify(dados, null, 2)}\n` };
}

function baixarArquivo(nome, conteudo, onde) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json;charset=utf-8' }));
  const link = el('a', { href: url, download: nome, hidden: true });
  onde.append(link); // dentro do diálogo aberto (o resto da página fica inerte)
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function copiarTexto(conteudo, elemento) {
  let copiou = false;
  try {
    await navigator.clipboard.writeText(conteudo);
    copiou = true;
  } catch {
    const area = el('textarea', { class: 'vh', readonly: true });
    area.value = conteudo;
    elemento.after(area);
    area.select();
    try {
      copiou = document.execCommand('copy');
    } catch {
      copiou = false;
    }
    area.remove();
    elemento.focus();
  }
  const original = elemento.dataset.rotulo || elemento.textContent;
  elemento.dataset.rotulo = original;
  elemento.textContent = copiou ? 'Copiado!' : 'Não consegui copiar';
  setTimeout(() => { elemento.textContent = original; }, 2500);
}

function blocoArquivo({ titulo, nome, caminho, conteudo }) {
  const urlEditar = `https://github.com/${OWNER}/${REPO}/edit/${BRANCH}/${caminho}`;
  const bloco = el('section', { class: 'bloco-arquivo' }, el('h3', { text: titulo }));
  const copiar = botao('Copiar o texto');
  copiar.addEventListener('click', () => copiarTexto(conteudo, copiar));
  bloco.append(
    el('div', { class: 'botoes-linha' },
      botao(`Baixar ${nome}`, { classe: 'botao', aoClicar: () => baixarArquivo(nome, conteudo, bloco) }),
      copiar),
    el('ol', { class: 'passos' },
      el('li', {}, 'Entre no GitHub com a conta leonardo681.'),
      el('li', {}, 'Abra ',
        el('a', { href: urlEditar, target: '_blank', rel: 'noopener noreferrer', class: 'link-forte', text: `${caminho} para editar` }),
        ` (ou: github.com → ${REPO} → ${caminho.split('/').join(' → ')} → lápis).`),
      el('li', {}, 'Apague tudo o que está lá e cole o conteúdo novo (do arquivo baixado ou do texto copiado). Isso substitui o arquivo inteiro.'),
      el('li', {}, 'Toque em “Commit changes” e confirme.'),
      el('li', {}, 'Em 1 a 10 minutos o site mostra a versão nova.')),
  );
  return bloco;
}

function abrirBaixar() {
  if (!estado.base) return;
  const dialogo = $('dialogo-baixar');
  const arquivo = prepararProdutosParaBaixar();
  const fechar = botao('Fechar', { aoClicar: () => dialogo.close() });
  if (arquivo.erros.length) {
    montarFolha(dialogo, {
      titulo: 'Publicar à mão', idTitulo: 'baixar-titulo',
      corpo: [caixaAviso({ titulo: 'Corrija antes de baixar', itens: arquivo.erros, erro: true })],
      botoes: [fechar],
    });
    return;
  }
  montarFolha(dialogo, {
    titulo: 'Publicar à mão',
    idTitulo: 'baixar-titulo',
    corpo: [
      el('p', { text: 'O arquivo tem o catálogo inteiro, já com as alterações deste aparelho.' }),
      arquivo.fotosFora > 0 && caixaAviso({
        textos: [`${plural(arquivo.fotosFora, 'produto tem', 'produtos têm')} foto nova que não vai no arquivo: fotos só podem ser enviadas com a chave do GitHub (botão Publicar).`],
      }),
      arquivo.avisos.length > 0 && caixaAviso({ titulo: 'Atenção', itens: arquivo.avisos }),
      blocoArquivo({ titulo: 'Catálogo de produtos', nome: 'produtos.json', caminho: CAMINHO_PRODUTOS, conteudo: arquivo.texto }),
      estado.rascunhoIgreja && blocoArquivo({
        titulo: 'Informações da igreja', nome: 'igreja.json', caminho: CAMINHO_IGREJA,
        conteudo: `${JSON.stringify(estado.rascunhoIgreja, null, 2)}\n`,
      }),
      el('p', { class: 'dica', text: 'Depois de publicar à mão e conferir no site, toque em “Descartar alterações” para limpar o rascunho deste aparelho.' }),
    ],
    botoes: [fechar],
  });
}

/* ---------- Descartar ---------- */

async function descartarAlteracoes() {
  const n = contarAlteracoes();
  if (!n || estado.publicando) return;
  const resposta = await abrirCaixa({
    titulo: 'Descartar alterações?',
    textos: [`Isso apaga ${plural(n, 'alteração não publicada', 'alterações não publicadas')} deste aparelho, inclusive as fotos novas. Não dá para desfazer.`],
    botoes: [
      { valor: null, texto: 'Cancelar', foco: true },
      { valor: 'descartar', texto: 'Descartar', classe: 'botao-perigo' },
    ],
  });
  if (resposta !== 'descartar') return;
  estado.rascunhoIgreja = null;
  removerArmazenado('rascunhoIgreja');
  definirOps([]);
  montarFormIgreja();
  mostrarRecado('Alterações descartadas.');
}

/* ---------- Abas ---------- */

function mostrarAba(nome, { focar = false } = {}) {
  for (const aba of ABAS) {
    const selecionada = aba === nome;
    const botaoAba = $(`aba-${aba}`);
    botaoAba.setAttribute('aria-selected', String(selecionada));
    botaoAba.tabIndex = selecionada ? 0 : -1;
    $(`painel-${aba}`).hidden = !selecionada;
  }
  estado.aba = nome;
  if (focar) $(`aba-${nome}`).focus();
}

function teclasDasAbas(evento) {
  const i = ABAS.indexOf(estado.aba);
  const destino = {
    ArrowRight: (i + 1) % ABAS.length,
    ArrowLeft: (i - 1 + ABAS.length) % ABAS.length,
    Home: 0,
    End: ABAS.length - 1,
  }[evento.key];
  if (destino === undefined) return;
  evento.preventDefault();
  mostrarAba(ABAS[destino], { focar: true });
}

/* ---------- Início ---------- */

function prepararLogo() {
  const logo = $('logo');
  if (!logo) return;
  if (logo.complete && !logo.naturalWidth) logo.remove();
  else logo.addEventListener('error', () => logo.remove(), { once: true });
}

function ligarEventos() {
  for (const dialogo of document.querySelectorAll('dialog')) prepararDialogo(dialogo);
  $('form-login').addEventListener('submit', entrar);
  $('form-chave').addEventListener('submit', conectarChave);
  $('sem-chave').addEventListener('click', continuarSemChave);
  $('sair').addEventListener('click', sair);
  $('conectar-chave').addEventListener('click', () => mostrarTelaChave());
  $('esquecer-chave').addEventListener('click', esquecerChave);
  $('atualizar').addEventListener('click', () => carregarDados());

  for (const id of ['link-criar-chave', 'link-criar-chave-ajuda']) $(id).href = URL_CRIAR_CHAVE;
  $('link-chaves').href = URL_CHAVES;

  for (const aba of ABAS) $(`aba-${aba}`).addEventListener('click', () => mostrarAba(aba));
  $('aba-produtos').parentElement.addEventListener('keydown', teclasDasAbas);

  $('busca').addEventListener('input', (evento) => {
    estado.busca = evento.target.value;
    renderProdutos();
  });
  $('novo-produto').addEventListener('click', () => abrirFormProduto());
  $('baixar').addEventListener('click', abrirBaixar);

  // Formulário de produto
  const dialogoProduto = $('dialogo-produto');
  const formProduto = $('form-produto');
  formProduto.addEventListener('submit', salvarFormProduto);
  formProduto.addEventListener('input', () => { form.sujo = true; });
  formProduto.addEventListener('focusout', (evento) => {
    if (evento.target.matches('#p-preco, .v-preco')) formatarCampoPreco(evento.target);
  });
  $('p-categoria').addEventListener('change', () => { if (!fotoDoForm()) mostrarPrevia(); });
  $('p-novidade').addEventListener('change', atualizarTextoNovidade);
  $('p-nova-variacao').addEventListener('click', () => {
    const linha = linhaVariacao();
    $('p-variacoes').append(linha);
    form.sujo = true;
    linha.querySelector('.v-nome').focus();
  });
  $('p-foto').addEventListener('change', escolherFoto);
  $('p-foto-remover').addEventListener('click', removerFotoDoForm);
  $('produto-fechar').addEventListener('click', pedirFecharForm);
  $('produto-cancelar').addEventListener('click', pedirFecharForm);
  // Esc tratado no keydown: assim o navegador não gera o pedido de fechamento que,
  // repetido, o Chrome deixa de permitir cancelar.
  dialogoProduto.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    evento.preventDefault();
    pedirFecharForm();
  });
  dialogoProduto.addEventListener('cancel', (evento) => {
    evento.preventDefault();
    if (evento.cancelable) pedirFecharForm();
    else form.fechadoPeloNavegador = true; // Voltar repetido do Android: vai fechar de qualquer jeito
  });
  dialogoProduto.addEventListener(FECHADO, aoFecharForm);

  // Categorias e informações
  $('form-categoria').addEventListener('submit', criarCategoria);
  $('form-igreja').addEventListener('submit', salvarIgreja);
  $('form-igreja').addEventListener('input', () => { formIgrejaSujo = true; });
  $('igreja-desfazer').addEventListener('click', desfazerIgreja);

  // Barra de alterações
  $('publicar').addEventListener('click', iniciarPublicacao);
  $('descartar').addEventListener('click', descartarAlteracoes);
  dialogoPublicar().addEventListener('cancel', (evento) => {
    if (estado.publicando) evento.preventDefault();
  });
  dialogoPublicar().addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && estado.publicando) evento.preventDefault();
  });

  window.addEventListener('beforeunload', (evento) => {
    const noPainel = !$('tela-painel').hidden;
    if (estado.publicando || (noPainel && contarAlteracoes() > 0)) {
      evento.preventDefault();
      evento.returnValue = '';
    }
  });

  // Rascunho mexido em outra aba do painel.
  window.addEventListener('storage', (evento) => {
    if ($('tela-painel').hidden || estado.publicando) return;
    if (evento.key === `${PREFIXO}rascunho`) {
      estado.ops = carregarOps();
      recalcular();
      renderizar();
    } else if (evento.key === `${PREFIXO}rascunhoIgreja`) {
      const igreja = lerArmazenado('rascunhoIgreja');
      estado.rascunhoIgreja = ehObjeto(igreja) ? igreja : null;
      if (!formIgrejaSujo) montarFormIgreja();
      renderBarra();
    }
  });
}

function iniciar() {
  // Dentro de um iframe de outro site o painel não aparece.
  if (window.top !== window.self) {
    document.body.replaceChildren();
    return;
  }
  prepararLogo();
  // crypto.subtle só existe em HTTPS ou localhost.
  if (!window.isSecureContext || !globalThis.crypto?.subtle) {
    mostrarTela('contexto', { focar: false });
    return;
  }
  ligarEventos();
  if (lerArmazenado('logado', { sessao: true })) aposLogin();
  else mostrarTela('login');
}

iniciar();
