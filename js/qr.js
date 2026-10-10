// Página de impressão do QR Code (qr.html).
// A biblioteca qrcode-generator (cdnjs, versão fixa) carrega antes deste módulo e cria o global "qrcode".

const URL_SITE = 'https://leonardo681.github.io/PRACIMA/';
const PAGINAS = {
  a5: '@page { size: A5 portrait; margin: 0; }',
  mesa: '@page { size: A4 portrait; margin: 0; }',
};
const SVG = 'http://www.w3.org/2000/svg';

const folha = document.getElementById('folha');
const modelo = document.getElementById('modelo-cartao');
const estiloPagina = document.getElementById('estilo-pagina');
let siga = '';

function elementoSvg(tag, atributos) {
  const elemento = document.createElementNS(SVG, tag);
  for (const [chave, valor] of Object.entries(atributos)) elemento.setAttribute(chave, String(valor));
  return elemento;
}

// Desenha o QR Code como SVG (nítido em qualquer tamanho de impressão).
function gerarQR(texto) {
  if (typeof window.qrcode !== 'function') return null;
  try {
    const codigo = window.qrcode(0, 'Q'); // 0 = tamanho automático; Q = tolera papel amassado ou sujo
    codigo.addData(texto);
    codigo.make();
    const modulos = codigo.getModuleCount();
    const borda = 4; // margem branca exigida pelo padrão do QR Code
    const total = modulos + borda * 2;
    let caminho = '';
    for (let linha = 0; linha < modulos; linha++) {
      for (let coluna = 0; coluna < modulos; coluna++) {
        if (codigo.isDark(linha, coluna)) caminho += `M${coluna + borda} ${linha + borda}h1v1h-1z`;
      }
    }
    const svg = elementoSvg('svg', {
      viewBox: `0 0 ${total} ${total}`,
      'shape-rendering': 'crispEdges',
      role: 'img',
      'aria-label': `QR Code com o endereço ${texto}`,
    });
    svg.append(
      elementoSvg('rect', { width: total, height: total, fill: '#FFFFFF' }),
      elementoSvg('path', { d: caminho, fill: '#000000' }),
    );
    return svg;
  } catch {
    return null;
  }
}

const qr = gerarQR(URL_SITE);
document.getElementById('erro').hidden = Boolean(qr);

function semQR() {
  const aviso = document.createElement('p');
  aviso.className = 'sem-qr';
  aviso.textContent = 'QR Code não gerado';
  return aviso;
}

function prepararLogos() {
  for (const img of folha.querySelectorAll('.logo img')) {
    const falhou = () => img.remove(); // fica o círculo bronze com "sara"
    if (img.complete && !img.naturalWidth) falhou();
    else img.addEventListener('error', falhou, { once: true });
  }
}

function montar(tipo) {
  estiloPagina.textContent = PAGINAS[tipo] || PAGINAS.a5;
  folha.className = `folha ${tipo}`;
  const cartoes = [];
  const quantidade = tipo === 'mesa' ? 2 : 1;
  for (let i = 0; i < quantidade; i++) {
    // importNode cria o cartão já no documento da página (o conteúdo do <template> é inerte).
    const cartao = document.importNode(modelo.content.firstElementChild, true);
    if (tipo === 'mesa' && i === 0) cartao.classList.add('virado');
    cartao.querySelector('.qr').append(qr ? qr.cloneNode(true) : semQR());
    if (siga) cartao.querySelector('.siga').textContent = siga;
    cartoes.push(cartao);
  }
  folha.replaceChildren(...cartoes);
  prepararLogos();
}

// O @ do Instagram vem do igreja.json; se ele falhar, fica o texto padrão da página.
async function carregarInstagram() {
  try {
    const resposta = await fetch(`data/igreja.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!resposta.ok) return;
    const rotulo = (await resposta.json())?.links?.instagram?.rotulo;
    if (typeof rotulo !== 'string' || !rotulo.trim()) return;
    siga = `Siga ${rotulo.trim()}`;
    for (const linha of folha.querySelectorAll('.siga')) linha.textContent = siga;
  } catch {
    /* mantém o texto padrão */
  }
}

for (const opcao of document.querySelectorAll('input[name="modelo"]')) {
  opcao.addEventListener('change', () => montar(opcao.value));
}
document.getElementById('imprimir').addEventListener('click', () => window.print());

montar(document.querySelector('input[name="modelo"]:checked')?.value || 'a5');
carregarInstagram();
