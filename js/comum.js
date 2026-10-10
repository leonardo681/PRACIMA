// Funções puras compartilhadas pelo catálogo (app.js), pelo painel (painel.js)
// e pela integração com o GitHub (github.js). Nada aqui mexe no DOM.

export const PREFIXO = 'saraStore:';
export const PREFIXO_PENDENTE = 'pendente:';
export const PRECO_MAXIMO = 10000000; // R$ 100.000,00

/* ---------- Texto ---------- */

export function slug(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function gerarIdProduto(nome, agora = Date.now()) {
  return `${slug(nome) || 'produto'}-${agora.toString(36)}`;
}

export function gerarIdCategoria(nome, idsExistentes = []) {
  const base = slug(nome) || 'categoria';
  const usados = new Set(idsExistentes);
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function normalizarBusca(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- Preço ---------- */

const formatadorBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatadorDecimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 7450 → "R$ 74,50" (com espaço não separável U+00A0 depois de "R$": não trocar).
export function formatarPreco(centavos) {
  return formatadorBRL.format(centavos / 100);
}

// 123450 → "1.234,50" (para preencher o campo de preço do painel).
export function centavosParaTexto(centavos) {
  return formatadorDecimal.format(centavos / 100);
}

// Lê o que a pessoa digitou e devolve centavos inteiros, ou null se for inválido.
// Sem ponto flutuante: "0,29" precisa virar 29, não 28.
export function lerPreco(texto) {
  if (texto == null) return null;
  const s = String(texto).replace(/R\$/gi, '').replace(/[\s ]/g, '');
  if (!s) return null;

  let reais;
  let centavos = '';
  const comVirgula = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/.exec(s);
  const pontoDecimal = /^(\d+)\.(\d{1,2})$/.exec(s); // teclados de Android que só têm ponto
  const inteiro = /^(\d{1,3}(?:\.\d{3})+|\d+)$/.exec(s); // ponto + 3 dígitos = milhar

  if (comVirgula) {
    reais = comVirgula[1].replace(/\./g, '');
    centavos = comVirgula[2];
  } else if (pontoDecimal) {
    reais = pontoDecimal[1];
    centavos = pontoDecimal[2];
  } else if (inteiro) {
    reais = inteiro[1].replace(/\./g, '');
  } else {
    return null;
  }

  const valor = Number(reais) * 100 + Number(centavos.padEnd(2, '0'));
  if (!Number.isSafeInteger(valor) || valor <= 0 || valor > PRECO_MAXIMO) return null;
  return valor;
}

export function precoValido(centavos) {
  return Number.isSafeInteger(centavos) && centavos > 0 && centavos <= PRECO_MAXIMO;
}

export function temVariacoes(produto) {
  return Array.isArray(produto?.variacoes) && produto.variacoes.length > 0;
}

// Menor preço entre o preço principal e as variações (para o "a partir de").
export function precoMinimo(produto) {
  const precos = [produto.precoCentavos];
  if (temVariacoes(produto)) {
    for (const v of produto.variacoes) precos.push(v.precoCentavos);
  }
  return Math.min(...precos.filter(precoValido));
}

/* ---------- Datas (sempre locais) ---------- */

const dois = (n) => String(n).padStart(2, '0');

// "AAAA-MM-DD" no horário local. Nunca usar toISOString().slice(0, 10).
export function hojeLocal(data = new Date()) {
  return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`;
}

// Soma dias a uma data "AAAA-MM-DD" sem passar por UTC.
export function somarDias(aaaammdd, dias) {
  const [a, m, d] = aaaammdd.split('-').map(Number);
  return hojeLocal(new Date(a, m - 1, d + dias, 12));
}

export function dataValida(aaaammdd) {
  return typeof aaaammdd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(aaaammdd);
}

// Comparação como texto: "2026-10-09" <= "2026-11-09".
export function ehNovidade(produto, hoje = hojeLocal()) {
  return dataValida(produto?.novidadeAte) && hoje <= produto.novidadeAte;
}

// "2026-10-09T20:00:00-03:00", com o deslocamento local.
export function agoraISOLocal(data = new Date()) {
  const deslocamento = -data.getTimezoneOffset();
  const sinal = deslocamento >= 0 ? '+' : '-';
  const abs = Math.abs(deslocamento);
  return `${hojeLocal(data)}T${dois(data.getHours())}:${dois(data.getMinutes())}:${dois(data.getSeconds())}` +
    `${sinal}${dois(Math.floor(abs / 60))}:${dois(abs % 60)}`;
}

// "2026-10-09T20:00:00-03:00" → "09/10/2026"
export function formatarDataBR(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// "2026-11-09" → "09/11"
export function formatarDiaMes(aaaammdd) {
  if (!dataValida(aaaammdd)) return '';
  const [, m, d] = aaaammdd.split('-');
  return `${d}/${m}`;
}

// → "09/10 às 20:00"
export function formatarDataHoraBR(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(data);
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}

/* ---------- Base64 com UTF-8 ---------- */
// Nunca btoa(texto) direto: com acento ele grava "B�blia" sem dar erro.

export function bytesParaBase64(bytes) {
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

export function base64ParaBytes(base64) {
  const binario = atob(String(base64).replace(/\s/g, ''));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

export function textoParaBase64(texto) {
  return bytesParaBase64(new TextEncoder().encode(texto));
}

export function base64ParaTexto(base64) {
  return new TextDecoder().decode(base64ParaBytes(base64));
}

/* ---------- Catálogo ---------- */

const colador = new Intl.Collator('pt-BR');

const porOrdemENome = (a, b) =>
  (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || colador.compare(a.nome ?? '', b.nome ?? '');

export function ordenarCategorias(categorias) {
  return [...categorias].sort(porOrdemENome);
}

export function ordenarProdutos(produtos) {
  return [...produtos].sort(porOrdemENome);
}

export function proximaOrdemProduto(produtos, categoriaId) {
  const ordens = produtos.filter((p) => p.categoria === categoriaId).map((p) => Number(p.ordem) || 0);
  return (ordens.length ? Math.max(...ordens) : 0) + 10;
}

export function proximaOrdemCategoria(categorias) {
  const ordens = categorias.map((c) => Number(c.ordem) || 0);
  return (ordens.length ? Math.max(...ordens) : 0) + 1;
}

// Usado pelo site público: aceita o JSON e descarta o que estiver quebrado,
// para um produto com erro não derrubar o catálogo inteiro.
export function normalizarCatalogo(dados) {
  if (!dados || typeof dados !== 'object' || !Array.isArray(dados.produtos) || !Array.isArray(dados.categorias)) {
    throw new Error('Catálogo em formato inválido');
  }
  const categorias = dados.categorias.filter(
    (c) => c && typeof c.id === 'string' && c.id && typeof c.nome === 'string' && c.nome.trim(),
  );
  const produtos = dados.produtos.filter(
    (p) => p && typeof p.id === 'string' && p.id && typeof p.nome === 'string' && p.nome.trim() && precoValido(p.precoCentavos),
  ).map((p) => ({
    ...p,
    variacoes: temVariacoes(p) ? p.variacoes.filter((v) => v && typeof v.nome === 'string' && precoValido(v.precoCentavos)) : [],
  }));
  return { ...dados, categorias, produtos };
}

// Imagem só pode ser um caminho dentro de img/produtos/ (nunca URL externa).
export function imagemPermitida(caminho) {
  return typeof caminho === 'string' && /^img\/produtos\/[a-z0-9._-]+$/i.test(caminho);
}

export function ehPendente(valor) {
  return typeof valor === 'string' && valor.startsWith(PREFIXO_PENDENTE);
}

/* ---------- Rascunho do painel (ops) ---------- */
// Formato das operações:
//   { tipo: 'produto' | 'categoria', acao: 'criar', id, dados, rotulo? }
//   { tipo: 'produto' | 'categoria', acao: 'alterar', id, campos, rotulo? }   (campo null = remover o campo)
//   { tipo: 'produto' | 'categoria', acao: 'excluir', id, rotulo? }
// "rotulo" é só o nome para mostrar nas mensagens.

const clonar = (valor) => (valor === undefined ? undefined : JSON.parse(JSON.stringify(valor)));

function iguais(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function aplicarCampos(alvo, campos) {
  for (const [chave, valor] of Object.entries(campos || {})) {
    if (chave === 'id') continue; // o id nunca muda
    if (valor === null) delete alvo[chave];
    else alvo[chave] = clonar(valor);
  }
}

function listaDoTipo(dados, tipo) {
  if (tipo === 'produto') return dados.produtos;
  if (tipo === 'categoria') return dados.categorias;
  return null;
}

function rotuloDaOp(op, dados) {
  if (op.rotulo) return op.rotulo;
  const lista = listaDoTipo(dados, op.tipo) || [];
  return lista.find((x) => x.id === op.id)?.nome || op.campos?.nome || op.dados?.nome || op.id;
}

// Reaplica o rascunho sobre uma versão (de preferência a mais nova) do catálogo.
export function aplicarAlteracoes(base, ops = []) {
  const dados = clonar(base) || {};
  dados.categorias = Array.isArray(dados.categorias) ? dados.categorias : [];
  dados.produtos = Array.isArray(dados.produtos) ? dados.produtos : [];
  const avisos = [];
  const exclusoesDeCategoria = [];

  for (const op of ops) {
    const lista = listaDoTipo(dados, op?.tipo);
    if (!lista || !op.id) continue;
    const i = lista.findIndex((x) => x.id === op.id);

    if (op.acao === 'criar') {
      if (i === -1) lista.push({ ...clonar(op.dados), id: op.id });
    } else if (op.acao === 'alterar') {
      if (i === -1) {
        const oQue = op.tipo === 'categoria' ? 'A categoria' : 'O produto';
        const excluido = op.tipo === 'categoria' ? 'excluída' : 'excluído';
        avisos.push(`${oQue} "${rotuloDaOp(op, dados)}" foi ${excluido} em outro aparelho; sua alteração foi descartada.`);
        continue;
      }
      aplicarCampos(lista[i], op.campos);
    } else if (op.acao === 'excluir') {
      if (op.tipo === 'categoria') exclusoesDeCategoria.push(op);
      else if (i !== -1) lista.splice(i, 1);
    }
  }

  // Categoria só sai se nenhum produto (visível ou oculto) ainda usar ela.
  for (const op of exclusoesDeCategoria) {
    const i = dados.categorias.findIndex((c) => c.id === op.id);
    if (i === -1) continue;
    if (dados.produtos.some((p) => p.categoria === op.id)) {
      avisos.push(`A categoria "${rotuloDaOp(op, dados)}" ainda tem produtos (inclusive ocultos) e não foi excluída.`);
      continue;
    }
    dados.categorias.splice(i, 1);
  }

  return { dados, avisos };
}

// Junta a nova operação ao rascunho, compactando por id.
// "base" é o catálogo sem o rascunho (para descobrir quando um campo voltou ao valor original).
export function compactarOps(ops, novaOp, base) {
  const resultado = ops.map(clonar);
  const i = resultado.findIndex((op) => op.tipo === novaOp.tipo && op.id === novaOp.id);
  const original = (listaDoTipo(base || { produtos: [], categorias: [] }, novaOp.tipo) || []).find((x) => x.id === novaOp.id);

  const limparCamposIguais = (campos) => {
    const limpos = {};
    for (const [chave, valor] of Object.entries(campos || {})) {
      if (chave === 'id') continue;
      const valorOriginal = original ? original[chave] : undefined;
      if (!iguais(valor, valorOriginal)) limpos[chave] = clonar(valor);
    }
    return limpos;
  };

  const nova = clonar(novaOp);

  if (i === -1) {
    if (nova.acao === 'alterar') {
      nova.campos = limparCamposIguais(nova.campos);
      if (!Object.keys(nova.campos).length) return resultado;
    }
    if (nova.acao === 'excluir' && !original) return resultado;
    resultado.push(nova);
    return resultado;
  }

  const atual = resultado[i];

  if (atual.acao === 'criar') {
    if (nova.acao === 'alterar') {
      aplicarCampos(atual.dados, nova.campos);
      if (nova.rotulo) atual.rotulo = nova.rotulo;
    } else if (nova.acao === 'excluir') {
      resultado.splice(i, 1);
    } else {
      resultado[i] = nova;
    }
    return resultado;
  }

  if (atual.acao === 'alterar') {
    if (nova.acao === 'alterar') {
      const mesclados = { ...atual.campos, ...nova.campos };
      atual.campos = limparCamposIguais(mesclados);
      if (nova.rotulo) atual.rotulo = nova.rotulo;
      if (!Object.keys(atual.campos).length) resultado.splice(i, 1);
    } else {
      resultado[i] = nova; // alterar + excluir = excluir
    }
    return resultado;
  }

  // atual é "excluir": a nova operação substitui (não deveria acontecer pela interface).
  resultado[i] = nova;
  return resultado;
}

// Chaves de fotos pendentes ainda usadas pelo rascunho (o resto pode ser apagado do IndexedDB).
export function fotosPendentesUsadas(ops) {
  const chaves = new Set();
  const olhar = (obj) => {
    for (const campo of ['imagem', 'miniatura']) {
      if (ehPendente(obj?.[campo])) chaves.add(obj[campo].slice(PREFIXO_PENDENTE.length));
    }
  };
  for (const op of ops) {
    if (op.tipo !== 'produto') continue;
    if (op.acao === 'criar') olhar(op.dados);
    if (op.acao === 'alterar') olhar(op.campos);
  }
  return chaves;
}

// Confere o catálogo antes de publicar. Devolve a lista de erros (vazia = ok).
export function validarCatalogo(dados, { permitirPendentes = false } = {}) {
  const erros = [];
  const categorias = Array.isArray(dados?.categorias) ? dados.categorias : [];
  const produtos = Array.isArray(dados?.produtos) ? dados.produtos : [];

  const idsCategoria = new Set();
  for (const c of categorias) {
    if (!c?.id || !/^[a-z0-9-]+$/.test(c.id)) erros.push(`Categoria com id inválido: "${c?.id ?? ''}".`);
    if (idsCategoria.has(c?.id)) erros.push(`Categoria repetida: "${c.id}".`);
    idsCategoria.add(c?.id);
    if (!String(c?.nome ?? '').trim()) erros.push(`A categoria "${c?.id}" está sem nome.`);
  }

  const idsProduto = new Set();
  for (const p of produtos) {
    const nome = String(p?.nome ?? '').trim();
    const quem = nome ? `Produto "${nome}"` : `Produto sem nome (${p?.id ?? 'sem id'})`;
    if (!p?.id || !/^[a-z0-9-]+$/.test(p.id)) erros.push(`${quem}: id inválido.`);
    if (idsProduto.has(p?.id)) erros.push(`${quem}: id repetido.`);
    idsProduto.add(p?.id);
    if (!nome) erros.push(`${quem}: falta o nome.`);
    if (!idsCategoria.has(p?.categoria)) erros.push(`${quem}: a categoria não existe.`);
    if (!precoValido(p?.precoCentavos)) erros.push(`${quem}: preço inválido.`);
    if (p?.variacoes !== undefined) {
      if (!Array.isArray(p.variacoes)) erros.push(`${quem}: variações em formato inválido.`);
      else p.variacoes.forEach((v, n) => {
        if (!String(v?.nome ?? '').trim()) erros.push(`${quem}: a variação ${n + 1} está sem nome.`);
        if (!precoValido(v?.precoCentavos)) erros.push(`${quem}: a variação ${n + 1} tem preço inválido.`);
      });
    }
    for (const campo of ['imagem', 'miniatura']) {
      const valor = p?.[campo];
      if (valor === undefined || valor === '') continue;
      if (ehPendente(valor)) {
        if (!permitirPendentes) erros.push(`${quem}: a foto ainda não foi enviada.`);
      } else if (!imagemPermitida(valor)) {
        erros.push(`${quem}: caminho de foto inválido.`);
      }
    }
    if (p?.novidadeAte !== undefined && !dataValida(p.novidadeAte)) erros.push(`${quem}: data de novidade inválida.`);
  }
  return erros;
}

/* ---------- Armazenamento local (sempre com try/catch e prefixo) ---------- */
// Nunca usar localStorage.clear(): o endereço leonardo681.github.io é compartilhado com outros sites.

function armazenamento(sessao) {
  try {
    return sessao ? globalThis.sessionStorage : globalThis.localStorage;
  } catch {
    return null;
  }
}

export function lerArmazenado(chave, { sessao = false } = {}) {
  try {
    const bruto = armazenamento(sessao)?.getItem(PREFIXO + chave);
    return bruto == null ? null : JSON.parse(bruto);
  } catch {
    return null;
  }
}

export function gravarArmazenado(chave, valor, { sessao = false } = {}) {
  try {
    armazenamento(sessao)?.setItem(PREFIXO + chave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function removerArmazenado(chave, { sessao = false } = {}) {
  try {
    armazenamento(sessao)?.removeItem(PREFIXO + chave);
  } catch {
    /* sem armazenamento disponível */
  }
}

/* ---------- Ícones das categorias (placeholder quando não há foto) ---------- */
// Caminhos SVG 24×24 para desenhar com stroke="currentColor" e fill="none".

export const ICONES_CATEGORIA = {
  camisetas: 'M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0Z',
  livros: 'M4 5a2 2 0 0 1 2-2h6v16H6a2 2 0 0 0-2 2Zm8-2h6a2 2 0 0 1 2 2v16a2 2 0 0 0-2-2h-6',
  biblias: 'M6 3h12v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm6 4v8m-3-5h6',
  outros: 'M6 8h12l-1 12H7L6 8Zm3 0a3 3 0 0 1 6 0',
};

export function iconeDaCategoria(categoriaId) {
  // hasOwnProperty evita herdar coisas como "constructor" se alguém criar uma categoria com esse nome.
  return Object.prototype.hasOwnProperty.call(ICONES_CATEGORIA, categoriaId)
    ? ICONES_CATEGORIA[categoriaId]
    : ICONES_CATEGORIA.outros;
}
