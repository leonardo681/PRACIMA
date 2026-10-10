# SARA STORE

Catálogo de preços da loja da **Igreja Sara Nossa Terra Biguaçu**, no estilo cardápio digital.
É só informativo: as vendas são presenciais, no balcão da loja.

Site: <https://leonardo681.github.io/PRACIMA/>

O acesso ao painel é passado pessoalmente pelo responsável da loja.

## Como funciona

- É um site **100% estático**, publicado pelo **GitHub Pages**. Não tem servidor nem banco de dados.
- Os produtos ficam em `data/produtos.json` e os dados da igreja em `data/igreja.json`.
- O painel grava as alterações direto neste repositório. O GitHub Pages republica sozinho, normalmente em 1 a 2 minutos (pode levar até 10).

## Arquivos

```
index.html            catálogo público
painel.html           uso interno da loja
qr.html               página para imprimir o QR Code (folha A5 ou display de mesa)
css/style.css         estilo do catálogo
css/painel.css        estilo do painel
js/comum.js           funções compartilhadas (preço, datas, busca, rascunho, validação)
js/app.js             catálogo
js/dialogo.js         fechamento confiável das janelas (<dialog>)
js/github.js          integração com a API do GitHub (publicar)
js/painel.js          interface do painel
js/fotos.js           compressão das fotos e rascunho de fotos (IndexedDB)
js/qr.js              geração do QR Code
data/produtos.json    categorias e produtos
data/igreja.json      dados da igreja e da loja
img/logo.png          logo (colocar a foto de perfil do Instagram aqui)
img/icone.svg         ícone usado quando o logo não existe
img/produtos/         fotos dos produtos (enviadas pelo painel)
testes/               testes automáticos
```

Extras:
- **Modo balcão:** `https://leonardo681.github.io/PRACIMA/?balcao=1`. Mostra a busca já focada, sem fotos e com preços maiores, para os atendentes.
- **QR Code:** abra `qr.html`, escolha o modelo e imprima em tamanho real (100%).

## Publicação no GitHub Pages

Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main` e pasta `/ (root)`.

O endereço diferencia maiúsculas: `/PRACIMA/` funciona e `/pracima/` dá erro. Defina o endereço final antes de imprimir QR Codes.

## Testar no computador

1. Na pasta do projeto, rode `python -m http.server 8000` e abra <http://localhost:8000>.
   Abrindo o arquivo direto (`file://`), o `fetch` dos dados não funciona.
2. Para testar no celular, use o próprio GitHub Pages, não o IP da rede local. O painel precisa de HTTPS (ou `localhost`).
3. Testes automáticos: `node --test testes/` (Node 20 ou mais novo, sem npm).

## Editar os dados da igreja pelo site do GitHub

1. Abra `data/igreja.json` no GitHub e clique no lápis (editar).
2. Altere só os textos entre aspas. Uma vírgula ou aspas faltando quebra o arquivo.
3. Clique em **Commit changes**.

Os campos `loja.pagamentos`, `loja.local` e `loja.horario` estão vazios porque ainda precisam ser confirmados. Quando vazios, essas linhas não aparecem no site. Exemplo preenchido:

```json
"loja": {
  "pagamentos": ["Pix", "cartão", "dinheiro"],
  "local": "Balcão da loja, na entrada da igreja",
  "horario": "Antes e depois dos cultos",
  "aviso": "Vendas somente presenciais. Preços podem mudar; confirme no balcão."
}
```

Se a seção da igreja sumir depois de uma edição, o arquivo ficou com erro. Volte a versão anterior pelo **History** do arquivo. O catálogo de preços continua funcionando mesmo assim.

## Aviso para quem mexer no código

- Depois que o painel estiver em uso, `data/produtos.json` e `img/produtos/` são **do painel**.
  - Sempre faça `git pull` antes de alterar algo.
  - Nunca use `force push`.
  - Nunca commite um `produtos.json` antigo por cima do atual.
- A cada mudança de CSS ou JS, aumente o número `?v=` nas tags `<link>`/`<script>` **e** nos `import` entre os módulos. O GitHub Pages guarda arquivos em cache por 10 minutos.
- Nunca use `innerHTML` com dados de produto. Monte o HTML com `createElement` + `textContent`.
- Nenhuma chave, token ou senha pode ser commitada.

### Versão da API do GitHub

O painel usa `API_VERSION = '2026-03-10'` em `js/github.js`. Se o GitHub desativar essa versão, o painel avisa. Nesse caso, troque pelo valor mais novo da lista em <https://docs.github.com/rest/about-the-rest-api/api-versions> e aumente o `?v=` dos arquivos.

## Cores e contraste (WCAG)

| Combinação | Contraste |
|---|---|
| Texto `#111111` sobre o card `#FAF8F3` | 17,79:1 |
| Texto `#111111` sobre o creme `#E4E0D5` | 14,32:1 |
| Texto secundário `#5A5248` sobre o card | 7,23:1 |
| Texto secundário `#5A5248` sobre o creme | 5,82:1 |
| Bronze escuro `#7A5A2B` (preços, títulos) sobre o card | 5,95:1 |
| Bronze escuro `#7A5A2B` sobre o creme | 4,79:1 |
| Branco sobre o bronze escuro `#7A5A2B` (chips, botões) | 6,32:1 |
| Branco sobre o cabeçalho `#6F5227` → `#8A6530` | 7,21:1 a 5,27:1 |
| Vermelho `#C62737` sobre o card | 5,28:1 |
| Creme `#E4E0D5` sobre o rodapé `#111111` | 14,32:1 |

O bronze `#977037` → `#AB9472` é usado só em decoração sem texto. Branco sobre `#977037` dá 4,48:1 e não passa no mínimo de 4,5:1.
