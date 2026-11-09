// ============================================================
// Testes do Markdown do chat do Fred (chatMarkdown.ts).
// Sem rede, sem IA.  Roda com:  node test-chat.mjs
// ============================================================

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);

execSync('npx esbuild chatMarkdown.ts --bundle --format=cjs --platform=node --outfile=/tmp/chat-md.cjs --log-level=error');
const { parseChatMarkdown, parseInline, chatPlainText } = require('/tmp/chat-md.cjs');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};
const J = (x) => JSON.stringify(x);
// Todo o texto visível de uma resposta, juntando os blocos.
const visible = (raw) => parseChatMarkdown(raw).map(b =>
  b.type === 'hr' ? '' : b.type === 'table'
    ? [b.header, ...b.rows].flat().map(c => c.map(p => p.text).join('')).join('|')
    : b.pieces.map(p => p.text).join('')).join('\n');

console.log('\n── Trechos (negrito, itálico, código) ──');
check('**negrito**', J(parseInline('a **b** c')) === J([{ text: 'a ' }, { text: 'b', bold: true }, { text: ' c' }]));
check('*itálico*', J(parseInline('*Example:* hi')) === J([{ text: 'Example:', italic: true }, { text: ' hi' }]));
check('***os dois***', J(parseInline('***x***')) === J([{ text: 'x', bold: true, italic: true }]));
check('_itálico_', parseInline('an _idiom_ here')[1]?.italic === true);
check('`código`', parseInline('use `did`')[1]?.code === true);
check('Lacuna "___" NÃO vira itálico', J(parseInline('She ___ to school')) === J([{ text: 'She ___ to school' }]));
check('Lacuna "_____" com ponto final', visible('I ___ (go) yesterday.') === 'I ___ (go) yesterday.');
check('snake_case_word não vira itálico', visible('my_var_name') === 'my_var_name');
check('"2 * 3 * 4" não vira itálico', visible('2 * 3 * 4 = 24') === '2 * 3 * 4 = 24');
check('** sem par é removido', visible('Note:** text') === 'Note: text');

console.log('\n── O caso do print (lista numerada + sub-itens com *Example:*) ──');
const printCase = `15. Safety /sêi-fti/ – Segurança
    * *Example:* "Safety first in the factory." (Segurança em primeiro lugar na fábrica.)
16. Blueprint /blu-print/ – Desenho técnico / Projeto
    * *Example:* "Look at the blueprint." (Olhe para o desenho técnico.)`;
const b = parseChatMarkdown(printCase);
check('4 itens de lista', b.length === 4 && b.every(x => x.type === 'li'), J(b.map(x => x.type)));
check('Número preservado (15. e 16.)', b[0].marker === '15.' && b[2].marker === '16.');
check('Sub-item recuado tem profundidade 1', b[1].depth === 1 && b[1].marker === '•');
check('"Example:" em itálico', b[1].pieces[0].italic === true && b[1].pieces[0].text === 'Example:');
check('Nenhum asterisco sobra na tela', !visible(printCase).includes('*'), visible(printCase));

console.log('\n── Blocos ──');
const mix = `## Present Perfect

Usamos para:
* experiências
- ações recentes

---
**Dica:** pratique!`;
const m = parseChatMarkdown(mix);
check('Título vira bloco h sem "#"', m[0].type === 'h' && visible('## Título') === 'Título');
check('Parágrafo', m[1].type === 'p');
check('"*" e "-" viram marcador •', m[2].marker === '•' && m[3].marker === '•');
check('"---" vira divisor', m[4].type === 'hr');
check('Nenhum # ou * sobra', !/[#*]/.test(visible(mix)), visible(mix));
check('Quebra "\\n" literal vira linha real', parseChatMarkdown('a\\n\\nb').length === 2);
check('Linha de continuação junta no item', (() => {
  const r = parseChatMarkdown('1. Primeira parte\n   continua aqui');
  return r.length === 1 && visible('1. Primeira parte\n   continua aqui') === 'Primeira parte continua aqui';
})());

console.log('\n── Tabela ──');
const t = parseChatMarkdown('| Pronome | Verbo |\n|---|---|\n| I | am |\n| **He** | is |');
check('Vira bloco table', t.length === 1 && t[0].type === 'table');
check('Cabeçalho e 2 linhas', t[0].header.length === 2 && t[0].rows.length === 2);
check('Negrito dentro da célula', t[0].rows[1][0][0].bold === true);
check('Linha com "|" sem separador NÃO vira tabela', parseChatMarkdown('| a | b |')[0].type === 'p');

console.log('\n── Segurança e texto puro ──');
check('HTML não é interpretado (vira texto)', visible('<script>x</script>') === '<script>x</script>');
check('Texto vazio não quebra', J(parseChatMarkdown('')) === '[]' && J(parseChatMarkdown(undefined)) === '[]');
check('chatPlainText tira todos os símbolos', chatPlainText('## Oi\n* **a** e *b*') === 'Oi • a e b', chatPlainText('## Oi\n* **a** e *b*'));

console.log(`\n${pass} ok, ${fail} falha(s)\n`);
process.exit(fail ? 1 : 0);
