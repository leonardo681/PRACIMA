// Ponto de entrada para "node --test testes/".
// A partir do Node 21 o --test não procura mais arquivos dentro de uma pasta passada como argumento:
// ele carrega "testes/" como módulo, ou seja, este index.js. No Node 20 este arquivo é ignorado
// (o nome não termina em .test.js) e os testes abaixo são encontrados direto.
// "node --test" sem argumentos, na raiz do repositório, também funciona em qualquer versão.
import './comum.test.js';
import './github.test.js';
