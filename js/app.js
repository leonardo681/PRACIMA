// Catálogo público da SARA STORE.
// Lê data/produtos.json e data/igreja.json de forma independente e monta a página.
// Todo dado vira DOM com createElement + textContent (nunca innerHTML).
import {
  normalizarCatalogo, ordenarCategorias, ordenarProdutos, normalizarBusca, formatarPreco,
  precoMinimo, temVariacoes, hojeLocal, ehNovidade, agoraISOLocal, formatarDataBR,
  imagemPermitida, iconeDaCategoria, lerArmazenado, gravarArmazenado,
} from './comum.js?v=1';
import { FECHADO, prepararDialogo } from './dialogo.js?v=1';

const URL_SITE = 'https://leonardo681.github.io/PRACIMA/';
const AVISO_SUMIU = 'Este produto não está mais no catálogo';

const $ = (id) => document.getElementById(id);
const balcao = new URLSearchParams(location.search).get('balcao') === '1';
const semMovimento = matchMedia('(prefers-reduced-motion: reduce)');
const rolagem = () => (semMovimento.matches ? 'auto' : 'smooth');
// ["Pix", "cartão", "dinheiro"] → "Pix, cartão e dinheiro"
const juntar = (itens) => (itens.length < 2 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`);
const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

const busca = $('busca');
const limpar = $('limpar');
const contagem = $('contagem');
const chips = $('chips');
const lista = $('lista');
const aviso = $('aviso');
const dialogo = prepararDialogo($('detalhe'));
const detalhe = $('detalhe-conteudo');
const voltarTopo = $('voltar-topo');
const modeloCarregando = lista.firstElementChild.cloneNode(true);

const estado = { carregado: false, produtos: new Map(), secoes: [], novidades: null };
let idDoLink = lerIdDoHash(); // produto pedido por link compartilhado (#produto=<id>)
let origem = null;            // linha que abriu o detalhe: recebe o foco de volta
let espiao = null;
let chipAtual = null;
let alvoDoChip = null;        // seção escolhida no chip: fica marcada até a pessoa rolar por conta própria
let chipParou = false;        // a rolagem causada pelo chip já terminou
let tempoChip = 0;
let linhaDoTopo = 72;         // altura do que fica grudado no topo (--topo-fixo)
const visiveis = new Set();   // seções dentro da faixa observada pelo scroll-spy
let fotosNaLista = 0;
let tempoAnuncio = 0;
let tempoToast = 0;

/* ---------- Ajudantes de DOM ---------- */

function el(tag, props, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props || {})) {
    if (valor == null || valor === false) continue;
    if (chave === 'text') elemento.textContent = valor;
    else if (chave === 'class') elemento.className = valor;
    else elemento.setAttribute(chave, valor);
  }
  for (const filho of filhos) if (filho) elemento.append(filho);
  return elemento;
}

// Placeholder quando não há foto: ícone da categoria desenhado num SVG (vira <img>).
const icones = {};
function imagemDoIcone(categoriaId) {
  let d = iconeDaCategoria(categoriaId);
  if (typeof d !== 'string') d = iconeDaCategoria('outros'); // id "constructor" herdaria do Object
  icones[d] ||= 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 48 48">' +
    '<rect x="-12" y="-12" width="48" height="48" fill="#EFE9DD"/>' +
    `<path d="${d}" fill="none" stroke="#977037" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  );
  return icones[d];
}

function imagem(caminho, categoriaId, { classe, tamanho, alt = '', adiada }) {
  const valida = imagemPermitida(caminho);
  const img = el('img', {
    class: classe,
    alt: valida ? alt : '',
    width: tamanho,
    height: tamanho,
    loading: valida && adiada ? 'lazy' : null,
    decoding: valida && adiada ? 'async' : null,
  });
  if (valida) {
    img.addEventListener('error', () => { img.alt = ''; img.src = imagemDoIcone(categoriaId); }, { once: true });
  }
  img.src = valida ? caminho : imagemDoIcone(categoriaId);
  return img;
}

/* ---------- Lista estilo cardápio ---------- */

function linhaProduto(p, hoje) {
  // Dentro do botão só <img> e <span>.
  const botao = el('button', { type: 'button', class: 'produto', 'aria-haspopup': 'dialog' });
  if (!balcao) {
    botao.append(imagem(p.miniatura, p.categoria, { classe: 'mini', tamanho: 88, adiada: fotosNaLista >= 6 }));
    fotosNaLista++;
  }
  botao.append(el('span', { class: 'txt' },
    el('span', { class: 'nome', text: texto(p.nome) }),
    texto(p.descricao) && el('span', { class: 'desc', text: texto(p.descricao) }),
    texto(p.info) && el('span', { class: 'info', text: texto(p.info) }),
    el('span', { class: 'valor' },
      temVariacoes(p) && el('span', { class: 'apartir', text: 'a partir de' }),
      el('span', { class: 'preco', text: formatarPreco(precoMinimo(p)) }),
      ehNovidade(p, hoje) && el('span', { class: 'selo', text: 'Novidade' }),
    ),
  ));
  botao.addEventListener('click', () => abrirPelaLista(p.id, botao));
  return botao;
}

function montarSecao(id, titulo, produtos, hoje) {
  const h2 = el('h2', { id: `${id}-titulo`, tabindex: '-1', text: titulo });
  const itens = produtos.map((produto) => ({ produto, botao: linhaProduto(produto, hoje) }));
  const secao = el('section', { class: 'secao', id, 'aria-labelledby': h2.id },
    h2, el('div', { class: 'grade' }, ...itens.map((item) => item.botao)));
  return { el: secao, h2, itens };
}

const unicos = (itens) => {
  const vistos = new Set();
  return itens.filter((x) => !vistos.has(x.id) && vistos.add(x.id));
};

function montarCatalogo(bruto) {
  const dados = normalizarCatalogo(bruto); // lança erro se o formato geral estiver quebrado
  const hoje = hojeLocal();
  const categorias = unicos(ordenarCategorias(dados.categorias));
  const ids = new Set(categorias.map((c) => c.id));
  // Oculto (visivel: false) ou com categoria inexistente não aparece.
  const produtos = unicos(ordenarProdutos(dados.produtos.filter((p) => p.visivel !== false && ids.has(p.categoria))));
  const daCategoria = (id) => produtos.filter((p) => p.categoria === id);

  fotosNaLista = 0;
  const novos = balcao ? [] : categorias.flatMap((c) => daCategoria(c.id).filter((p) => ehNovidade(p, hoje)));
  const novidades = novos.length ? montarSecao('novidades', 'Novidades', novos, hoje) : null;

  const secoes = [];
  for (const c of categorias) {
    const doGrupo = daCategoria(c.id);
    if (!doGrupo.length) continue;
    const nome = texto(c.nome);
    const secao = montarSecao(`cat-${c.id}`, nome, doGrupo, hoje);
    for (const item of secao.itens) {
      const p = item.produto;
      item.busca = normalizarBusca([p.nome, p.descricao, p.info, nome].map(texto).join(' '));
    }
    secao.chip = el('a', { class: 'chip', href: `#cat-${c.id}`, text: nome });
    secao.chip.addEventListener('click', (evento) => {
      evento.preventDefault(); // atalho na lista contínua: sem mexer no hash nem no histórico
      irPara(secao);
    });
    secoes.push(secao);
  }

  Object.assign(estado, { carregado: true, produtos: new Map(produtos.map((p) => [p.id, p])), secoes, novidades });
  chipAtual = null;
  chips.replaceChildren(el('ul', {}, ...secoes.map((s) => el('li', {}, s.chip))));
  lista.replaceChildren(...[novidades?.el, ...secoes.map((s) => s.el)].filter(Boolean));
  if (!secoes.length) lista.append(el('p', { class: 'vazio', text: 'Nenhum produto no catálogo agora. Pergunte no balcão!' }));
  lista.setAttribute('aria-busy', 'false');

  const data = formatarDataBR(dados.atualizadoEm);
  $('atualizado').textContent = data ? `Preços atualizados em ${data} • ` : '';

  filtrar();
  espiar();
}

/* ---------- Carregamento ---------- */

async function lerJSON(caminho) {
  const resposta = await fetch(`${caminho}?v=${Date.now()}`, { cache: 'no-store' });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return resposta.json();
}

async function carregarCatalogo() {
  lista.setAttribute('aria-busy', 'true');
  aviso.hidden = true;
  try {
    const bruto = await lerJSON('data/produtos.json');
    montarCatalogo(bruto);
    gravarArmazenado('catalogoBom', { dados: bruto, salvoEm: agoraISOLocal() });
  } catch {
    try {
      montarCatalogo(lerArmazenado('catalogoBom')?.dados);
      aviso.replaceChildren(el('span', { text: 'Mostrando a última versão salva.' }), botaoTentarDeNovo());
      aviso.hidden = false;
    } catch {
      mostrarErro();
      return;
    }
  }
  abrirLinkInicial();
}

function botaoTentarDeNovo() {
  const botao = el('button', { type: 'button', class: 'botao' }, 'Tentar novamente');
  botao.addEventListener('click', () => {
    lista.replaceChildren(modeloCarregando.cloneNode(true));
    carregarCatalogo();
  });
  return botao;
}

function mostrarErro() {
  Object.assign(estado, { carregado: false, produtos: new Map(), secoes: [], novidades: null });
  espiao?.disconnect();
  chips.hidden = true;
  contagem.textContent = '';
  lista.replaceChildren(el('div', { class: 'erro', role: 'alert' },
    el('p', { text: 'Não foi possível carregar o catálogo. Verifique sua internet.' }),
    botaoTentarDeNovo()));
  lista.setAttribute('aria-busy', 'false');
}

/* ---------- Busca ---------- */

function filtrar() {
  limpar.hidden = !busca.value;
  if (!estado.carregado) return;
  const termo = busca.value.trim();
  const palavras = normalizarBusca(termo).split(' ').filter(Boolean);
  const buscando = palavras.length > 0;

  // Durante a busca somem Novidades (nada aparece duas vezes), chips e categorias sem resultado.
  chips.hidden = buscando || estado.secoes.length < 2;
  if (estado.novidades) estado.novidades.el.hidden = buscando;
  let total = 0;
  for (const secao of estado.secoes) {
    let achados = 0;
    for (const item of secao.itens) {
      const combina = palavras.every((palavra) => item.busca.includes(palavra));
      item.botao.hidden = !combina;
      if (combina) achados++;
    }
    secao.el.hidden = achados === 0;
    total += achados;
  }

  let mensagem = '';
  if (buscando) {
    mensagem = total === 0
      ? `Nenhum produto encontrado para “${termo}”. Pergunte no balcão!`
      : `${total} ${total === 1 ? 'produto encontrado' : 'produtos encontrados'}`;
  }
  clearTimeout(tempoAnuncio);
  if (!mensagem) contagem.textContent = '';
  else tempoAnuncio = setTimeout(() => { contagem.textContent = mensagem; }, 250);
}

busca.addEventListener('input', filtrar);
busca.addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter') busca.blur(); // fecha o teclado do celular para ver os resultados
});
limpar.addEventListener('click', () => {
  busca.value = '';
  filtrar();
  busca.focus();
});

/* ---------- Chips e scroll-spy ---------- */

function irPara(secao) {
  alvoDoChip = secao;
  esperarRolagemDoChip();
  secao.el.scrollIntoView({ behavior: rolagem(), block: 'start' });
  secao.h2.focus({ preventScroll: true });
  marcarChip(secao);
}

function marcarChip(secao) {
  const chip = secao?.chip || null;
  if (chip === chipAtual) return;
  chipAtual?.removeAttribute('aria-current');
  chipAtual = chip;
  if (!chip) return;
  chip.setAttribute('aria-current', 'true');
  const faixa = chip.closest('ul');
  faixa.scrollTo({ left: chip.offsetLeft - (faixa.clientWidth - chip.offsetWidth) / 2, behavior: rolagem() });
}

// Depois de um clique no chip, a rolagem suave passa por outras seções e, no fim da página,
// a seção escolhida pode nem chegar ao topo. Por isso o chip clicado fica marcado até a pessoa
// mexer na página: tocar, usar roda ou teclado, ou rolar de novo depois que a rolagem do chip parou.
function esperarRolagemDoChip() {
  chipParou = false;
  clearTimeout(tempoChip);
  tempoChip = setTimeout(() => { chipParou = true; }, 200);
}

function soltarChip() {
  if (!alvoDoChip) return;
  alvoDoChip = null;
  atualizarChip();
}

addEventListener('scroll', () => {
  if (!alvoDoChip) return;
  if (chipParou) soltarChip();
  else esperarRolagemDoChip();
}, { passive: true });
for (const tipo of ['wheel', 'pointerdown', 'keydown']) addEventListener(tipo, soltarChip, { passive: true });

function atualizarChip() {
  if (alvoDoChip || !estado.secoes.length) return;
  const atual = estado.secoes.find((s) => visiveis.has(s.el));
  if (atual) marcarChip(atual);
  else if (estado.secoes[0].el.getBoundingClientRect().top > linhaDoTopo) marcarChip(null);
}

function espiar() {
  espiao?.disconnect();
  visiveis.clear();
  alvoDoChip = null;
  if (typeof IntersectionObserver !== 'function' || !estado.secoes.length) return;
  linhaDoTopo = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topo-fixo'), 10) || 72;
  // Faixa de observação: logo abaixo dos chips até 35% da tela.
  espiao = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (entrada.isIntersecting) visiveis.add(entrada.target);
      else visiveis.delete(entrada.target);
    }
    atualizarChip();
  }, { rootMargin: `-${linhaDoTopo}px 0px -65% 0px` });
  for (const secao of estado.secoes) espiao.observe(secao.el);
}

/* ---------- Detalhe do produto ---------- */

function tabelaDePrecos(p) {
  const linhas = [['Padrão', p.precoCentavos], ...p.variacoes.map((v) => [texto(v.nome) || 'Opção', v.precoCentavos])];
  return el('table', { class: 'variacoes' },
    el('caption', { class: 'vh', text: 'Preços' }),
    el('tbody', {}, ...linhas.map(([nome, centavos]) =>
      el('tr', {}, el('th', { scope: 'row', text: nome }), el('td', { text: formatarPreco(centavos) })))));
}

function preencherDetalhe(p) {
  const foto = !balcao && el('div', { class: 'foto' }, imagem(
    imagemPermitida(p.imagem) ? p.imagem : p.miniatura, p.categoria,
    { tamanho: 1000, alt: `Foto de ${texto(p.nome)}`, adiada: false },
  ));
  const compartilhar = el('button', { type: 'button', class: 'botao secundario' }, 'Compartilhar');
  compartilhar.addEventListener('click', () => compartilharProduto(p, compartilhar));

  const corpo = el('div', { class: 'corpo' },
    el('h2', { id: 'detalhe-nome', text: texto(p.nome) }),
    ehNovidade(p) && el('p', { class: 'selo', text: 'Novidade' }),
    temVariacoes(p) ? tabelaDePrecos(p) : el('p', { class: 'preco', text: formatarPreco(p.precoCentavos) }),
    texto(p.descricao) && el('p', { text: texto(p.descricao) }),
    texto(p.info) && el('p', { class: 'info', text: texto(p.info) }),
    el('p', { class: 'so-balcao', text: 'Venda somente no balcão da loja da igreja' }),
    compartilhar,
  );
  detalhe.className = foto ? 'detalhe-in com-foto' : 'detalhe-in';
  detalhe.replaceChildren(...[foto, corpo].filter(Boolean));
  detalhe.scrollTop = 0;
}

function mostrarProduto(id) {
  const p = estado.produtos.get(id);
  if (!p) return false;
  preencherDetalhe(p);
  if (!dialogo.open && typeof dialogo.showModal === 'function') dialogo.showModal();
  return true;
}

function abrirPelaLista(id, botao) {
  origem = botao;
  history.pushState({ produto: id }, '', `#produto=${encodeURIComponent(id)}`);
  mostrarProduto(id);
}

function lerIdDoHash() {
  const achado = /^#produto=(.+)$/.exec(location.hash);
  if (!achado) return null;
  try {
    return decodeURIComponent(achado[1]);
  } catch {
    return '';
  }
}

function limparHash() {
  history.replaceState(null, '', location.pathname + location.search);
}

// Entrada por link compartilhado: limpa o hash, cria a entrada do produto e abre.
// Assim, fechar o detalhe volta para o catálogo em vez de sair do site.
function abrirLinkInicial() {
  if (idDoLink === null) return;
  const id = idDoLink;
  idDoLink = null;
  // Página recarregada com o detalhe aberto: a entrada já é do produto, não duplica.
  if (history.state?.produto === id) {
    origem = null;
    if (!mostrarProduto(id)) {
      limparHash();
      avisar(AVISO_SUMIU);
    }
    return;
  }
  limparHash();
  if (!estado.produtos.has(id)) {
    avisar(AVISO_SUMIU);
    return;
  }
  origem = null;
  history.pushState({ produto: id }, '', `#produto=${encodeURIComponent(id)}`);
  mostrarProduto(id);
}

async function compartilharProduto(p, botao) {
  const url = `${URL_SITE}#produto=${encodeURIComponent(p.id)}`;
  const preco = (temVariacoes(p) ? 'a partir de ' : '') + formatarPreco(precoMinimo(p));
  if (navigator.share) {
    try {
      await navigator.share({ title: `${texto(p.nome)} – SARA STORE`, text: `${texto(p.nome)}: ${preco}`, url });
      return;
    } catch (erro) {
      if (erro?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    botao.textContent = 'Link copiado!';
    setTimeout(() => { botao.textContent = 'Compartilhar'; }, 2500);
  } catch {
    prompt('Copie o link do produto:', url);
  }
}

// Fechar por qualquer meio (Fechar, Esc, toque fora, Voltar do Android) cai aqui.
dialogo.addEventListener(FECHADO, () => {
  if (history.state && history.state.produto) history.back();
  if (origem?.isConnected) origem.focus();
  origem = null;
});

addEventListener('popstate', () => {
  const id = history.state?.produto;
  if (dialogo.open && !id) {
    dialogo.close(); // nunca history.back() aqui
  }
  if (id && !dialogo.open) {
    origem = null; // botão Avançar
    if (!mostrarProduto(id)) {
      limparHash();
      avisar(AVISO_SUMIU);
    }
  } else if (!id && !dialogo.open && estado.produtos.size && lerIdDoHash() !== null) {
    // Link de produto colado na barra com o site já aberto: o navegador já criou a entrada
    // nova, e a anterior é o catálogo. Basta marcar esta entrada como do produto.
    const colado = lerIdDoHash();
    if (estado.produtos.has(colado)) {
      origem = null;
      history.replaceState({ produto: colado }, '', `#produto=${encodeURIComponent(colado)}`);
      mostrarProduto(colado);
    } else {
      limparHash();
      avisar(AVISO_SUMIU);
    }
  }
});

$('fechar').addEventListener('click', () => dialogo.close());

// Toque fora: o clique cai no próprio <dialog> (o fundo escurecido), não no conteúdo.
let tocouFora = false;
dialogo.addEventListener('pointerdown', (evento) => { tocouFora = evento.target === dialogo; });
dialogo.addEventListener('click', (evento) => {
  if (tocouFora && evento.target === dialogo) dialogo.close();
});

/* ---------- Igreja ---------- */

function linkSeguro(url) {
  try {
    return new URL(url).protocol === 'https:' ? url : '';
  } catch {
    return '';
  }
}

const linkBotao = (url, rotulo) => el('a', { class: 'botao', href: url, target: '_blank', rel: 'noopener' }, rotulo);
const bloco = (titulo, ...filhos) => el('div', { class: 'bloco' }, el('h3', { text: titulo }), ...filhos);
const linhaRotulada = (rotulo, valor) => valor && el('p', {}, el('strong', { text: `${rotulo}: ` }), valor);

function montarIgreja(ig) {
  if (!ig || typeof ig !== 'object' || !texto(ig.nome)) throw new Error('igreja.json inválido');
  const loja = ig.loja && typeof ig.loja === 'object' ? ig.loja : {};
  const pagamentos = Array.isArray(loja.pagamentos) ? loja.pagamentos.map(texto).filter(Boolean) : [];
  const blocos = [];

  // Cultos com mesmo dia e nome viram uma linha só: "Domingo 10h e 19h – Culto da Família".
  const grupos = [];
  for (const culto of Array.isArray(ig.cultos) ? ig.cultos : []) {
    const dia = texto(culto?.dia);
    const horario = texto(culto?.horario);
    const nome = texto(culto?.nome);
    if (!dia || !horario) continue;
    const grupo = grupos.find((g) => g.dia === dia && g.nome === nome);
    if (grupo) grupo.horarios.push(horario);
    else grupos.push({ dia, nome, horarios: [horario] });
  }
  if (grupos.length) {
    blocos.push(bloco('Nossos cultos', el('ul', { class: 'cultos' }, ...grupos.map((g) =>
      el('li', {}, el('strong', { text: g.dia }), ` ${juntar(g.horarios)}`, g.nome && ` – ${g.nome}`)))));
  }

  const endereco = texto(ig.endereco?.texto);
  const mapa = linkSeguro(ig.endereco?.comoChegarUrl);
  if (endereco) blocos.push(bloco('Onde estamos', el('p', { text: endereco }), mapa && linkBotao(mapa, 'Como chegar')));

  // Itens da loja vazios (ainda não confirmados) não aparecem.
  const linhasLoja = [
    linhaRotulada('Onde fica', texto(loja.local)),
    linhaRotulada('Horário', texto(loja.horario)),
    linhaRotulada('Pagamento', pagamentos.length ? juntar(pagamentos) : ''),
    texto(loja.aviso) && el('p', { text: texto(loja.aviso) }),
  ].filter(Boolean);
  if (linhasLoja.length) blocos.push(bloco('Loja', ...linhasLoja));

  const links = [];
  const instagram = ig.links?.instagram;
  const youtube = ig.links?.youtube;
  if (linkSeguro(instagram?.url)) links.push(linkBotao(instagram.url, `Siga no Instagram ${texto(instagram.rotulo)}`.trim()));
  if (linkSeguro(youtube?.url)) links.push(linkBotao(youtube.url, texto(youtube.rotulo) || 'Cultos online no YouTube'));

  const ministerios = Array.isArray(ig.ministerios) ? ig.ministerios.map(texto).filter(Boolean) : [];

  $('igreja-conteudo').replaceChildren(...[
    el('h2', { id: 'igreja-titulo', text: [texto(ig.nome), texto(ig.slogan)].filter(Boolean).join(' – ') }),
    texto(ig.boasVindas) && el('p', { class: 'boas-vindas', text: texto(ig.boasVindas) }),
    blocos.length > 0 && el('div', { class: 'blocos' }, ...blocos),
    links.length > 0 && el('div', { class: 'links' }, ...links),
    ministerios.length > 0 && el('div', { class: 'ministerios' }, el('h3', { text: 'Ministérios' }),
      el('ul', { class: 'etiquetas' }, ...ministerios.map((m) => el('li', { text: m })))),
  ].filter(Boolean));
  $('igreja').hidden = false;
  $('faixa-pagamentos').textContent = pagamentos.length ? ` • ${juntar(pagamentos)}` : '';
}

async function carregarIgreja() {
  try {
    montarIgreja(await lerJSON('data/igreja.json'));
  } catch {
    // Sem igreja.json (ou com erro de digitação) o catálogo continua; só somem a seção e os pagamentos.
    $('igreja').hidden = true;
    $('faixa-pagamentos').textContent = '';
  }
}

/* ---------- Detalhes da página ---------- */

function avisar(mensagem) {
  const toast = $('toast');
  toast.textContent = mensagem;
  clearTimeout(tempoToast);
  tempoToast = setTimeout(() => { toast.textContent = ''; }, 5000);
}

function prepararLogo() {
  for (const img of document.querySelectorAll('.logo img')) {
    const falhou = () => img.remove(); // mostra o círculo bronze com "sara"
    if (img.complete && !img.naturalWidth) falhou();
    else img.addEventListener('error', falhou, { once: true });
  }
}

function atualizarVoltarTopo() {
  const mostrar = scrollY > innerHeight * 2;
  if (voltarTopo.hidden === mostrar) voltarTopo.hidden = !mostrar;
}

addEventListener('scroll', atualizarVoltarTopo, { passive: true });
voltarTopo.addEventListener('click', () => {
  scrollTo({ top: 0, behavior: rolagem() });
  $('titulo').focus({ preventScroll: true });
});

$('copyright').addEventListener('click', () => {
  location.href = 'painel.html';
});

/* ---------- Início ---------- */

$('ano').textContent = String(new Date().getFullYear());
if (balcao) {
  document.documentElement.classList.add('balcao');
  busca.focus();
}
prepararLogo();
atualizarVoltarTopo();
carregarCatalogo();
carregarIgreja();
