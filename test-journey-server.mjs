// ============================================================
// Testes das funções de servidor da Journey (sem rede, sem IA).
// Roda com:  node test-journey-server.mjs
// ============================================================

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const jc = require('./netlify/functions/journey-content.js')._internals;
const aw = require('./netlify/functions/award-activity.js')._internals;
const core = require('./netlify/functions/lib/journey-core.js');
const sign = require('./netlify/functions/lib/journey-sign.js');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

console.log('\n── Paridade currículo: front (journeys.ts) x servidor ──');
{
  const { execSync } = await import('node:child_process');
  execSync('npx esbuild journeys.ts --bundle --format=cjs --platform=node --outfile=/tmp/journeys-parity.cjs --log-level=error');
  const front = require('/tmp/journeys-parity.cjs');
  let comparados = 0, iguais = true;
  for (const j of core.JOURNEY_IDS) for (let s = 0; s < core.LEVELS.length; s++) {
    const a = front.buildSeasonNodes(j, s), b = core.buildSeasonNodes(j, s);
    if (a.length !== b.length) { iguais = false; break; }
    a.forEach((n, i) => {
      comparados++;
      if (n.type !== b[i].type || n.grammarTopic !== b[i].grammarTopics.join(' + ') ||
          n.vocabTheme !== b[i].vocabThemes.join(', ') || n.kinds.join() !== b[i].kinds.join()) iguais = false;
    });
  }
  check(`Front e servidor montam a MESMA trilha (${comparados} nós)`, iguais && comparados === 608, `(${comparados} nós)`);
}

console.log('\n── Prompts gerados pelo servidor ──');
const nodes = jc.buildSeasonNodes('freedom', 0);
const gram = jc.buildRequest({ journeyId: 'freedom', seasonIndex: 0, node: nodes[0], kind: 'grammar' });
check('Gramática pede 10 questões do tópico certo', gram.contents.includes('10 questões') && gram.contents.includes('Verbo to be'));
check('Prompt carrega o nível CEFR da Season', gram.system.includes('A1'));
check('Prompt proíbe os nomes repetitivos', gram.system.includes('PROIBIDO') && gram.system.includes('Sarah'));

const review = jc.buildRequest({ journeyId: 'freedom', seasonIndex: 0, node: nodes[3], kind: 'grammar' });
check('Review pede mistura dos 3 tópicos anteriores',
  review.contents.includes('REVIEW') && nodes[3].grammarTopics.every(t => review.contents.includes(t)));

const biz = jc.buildRequest({ journeyId: 'business', seasonIndex: 2, node: jc.buildSeasonNodes('business', 2)[0], kind: 'reading' });
check('Business injeta o contexto profissional no prompt', biz.system.includes('profissional'));
check('Leitura de B1 pede texto mais longo que o de A1',
  biz.contents.includes('180 a 250') && jc.buildRequest({ journeyId: 'freedom', seasonIndex: 0, node: nodes[0], kind: 'reading' }).contents.includes('90 a 130'));

const young = jc.buildRequest({ journeyId: 'young', seasonIndex: 0, node: jc.buildSeasonNodes('young', 0)[0], kind: 'listening' });
check('Young proíbe conteúdo adulto', young.system.includes('PROIBIDO: álcool'));

console.log('\n── Escrita: lacunas (Seasons 1-2) vs texto livre (3+) ──');
const wA1 = jc.buildRequest({ journeyId: 'freedom', seasonIndex: 0, node: nodes[0], kind: 'writing' });
const wA2 = jc.buildRequest({ journeyId: 'freedom', seasonIndex: 1, node: jc.buildSeasonNodes('freedom', 1)[0], kind: 'writing' });
const wB1 = jc.buildRequest({ journeyId: 'freedom', seasonIndex: 2, node: jc.buildSeasonNodes('freedom', 2)[0], kind: 'writing' });
const wB2 = jc.buildRequest({ journeyId: 'freedom', seasonIndex: 3, node: jc.buildSeasonNodes('freedom', 3)[0], kind: 'writing' });
const wC1 = jc.buildRequest({ journeyId: 'freedom', seasonIndex: 4, node: jc.buildSeasonNodes('freedom', 4)[0], kind: 'writing' });
check('Season 1 pede lacunas', wA1.contents.includes('____'));
check('Season 2 pede lacunas', wA2.contents.includes('____'));
check('Season 3 pede frases curtas', wB1.contents.includes('3 a 5 frases'));
check('Season 4 pede um parágrafo', wB2.contents.includes('parágrafo'));
check('Season 5 pede texto com introdução e conclusão', wC1.contents.includes('150 a 220'));
check('Escrita livre manda a dica de tamanho para a tela', !!wB1.lengthHint && !!wC1.lengthHint);

console.log('\n── Validação do que a IA devolve ──');
const q = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, question: 'Q', questionPT: 'P', options: ['a', 'b', 'c', 'd'], correctAnswerIndex: 1, explanation: 'x' }));
check('Quiz válido é aceito', !!jc.normalizeContent('grammar', 0, { questions: q(10) }, gram));
check('Quiz com 3 opções é recusado',
  jc.normalizeContent('grammar', 0, { questions: q(10).map(x => ({ ...x, options: ['a', 'b', 'c'] })) }, gram) === null);
check('Quiz com resposta fora do intervalo é recusado',
  jc.normalizeContent('grammar', 0, { questions: q(10).map(x => ({ ...x, correctAnswerIndex: 7 })) }, gram) === null);
check('Quiz com 2 questões é recusado', jc.normalizeContent('grammar', 0, { questions: q(2) }, gram) === null);
check('Leitura sem texto é recusada', jc.normalizeContent('reading', 0, { questions: q(10) }, gram) === null);
check('Leitura com texto é aceita', !!jc.normalizeContent('reading', 0, { readingText: 'x'.repeat(120), questions: q(10) }, gram));
check('Listening sem roteiro é recusado', jc.normalizeContent('listening', 0, { questions: q(10) }, gram) === null);
check('Mais de 10 questões são aparadas para 10',
  jc.normalizeContent('grammar', 0, { questions: q(14) }, gram).questions.length === 10);

const goodGaps = { gapItems: Array.from({ length: 8 }, (_, i) => ({ id: i, sentence: `She ____ ok ${i}.`, answer: 'is', alternatives: ["'s"], hintPT: 'dica', translationPT: 'trad' })) };
check('Lacunas válidas são aceitas', jc.normalizeContent('writing', 0, goodGaps, wA1).gapItems.length === 8);
check('Frase sem "____" é descartada', (() => {
  const mix = { gapItems: [...goodGaps.gapItems, { id: 9, sentence: 'sem lacuna', answer: 'x' }] };
  return jc.normalizeContent('writing', 0, mix, wA1).gapItems.length === 8;
})());
check('Menos de 5 lacunas é recusado', jc.normalizeContent('writing', 0, { gapItems: goodGaps.gapItems.slice(0, 3) }, wA1) === null);
check('Escrita livre exige enunciado de verdade',
  jc.normalizeContent('writing', 2, { writingPrompt: 'curto' }, wB1) === null &&
  !!jc.normalizeContent('writing', 2, { writingPrompt: 'x'.repeat(60), writingPromptPT: 'y' }, wB1));
check('Escrita livre repassa a dica de tamanho',
  jc.normalizeContent('writing', 2, { writingPrompt: 'x'.repeat(60) }, wB1).writingLengthHint === wB1.lengthHint);

console.log('\n── JSON com sujeira do modelo ──');
check('Remove cercas de markdown', jc.parseLoose('```json\n{"a":1}\n```').a === 1);
check('Ignora texto em volta', jc.parseLoose('Claro! {"a":2} pronto').a === 2);
check('Conserta vírgula sobrando', jc.parseLoose('{"a":3,}').a === 3);

console.log('\n── Posição conferida contra o currículo de verdade ──');
check('Posição válida é aceita', !!core.resolvePosition({ journeyId: 'freedom', season: 0, node: 3, kind: 'grammar' }));
check('Jornada inexistente é recusada', core.resolvePosition({ journeyId: 'hacker', season: 0, node: 0, kind: 'grammar' }) === null);
check('Tipo de exercício inventado é recusado', core.resolvePosition({ journeyId: 'freedom', season: 0, node: 0, kind: 'speaking' }) === null);
check('Season fora do intervalo é recusada', core.resolvePosition({ journeyId: 'freedom', season: 9, node: 0, kind: 'grammar' }) === null);
check('Season negativa é recusada', core.resolvePosition({ journeyId: 'freedom', season: -1, node: 0, kind: 'grammar' }) === null);
check('Nó que não existe na Season é recusado', core.resolvePosition({ journeyId: 'freedom', season: 0, node: 99, kind: 'grammar' }) === null);
check('Nó fracionário é recusado', core.resolvePosition({ journeyId: 'freedom', season: 0, node: 1.5, kind: 'grammar' }) === null);
check('Review só aceita gramática (nó 3 da Season 1 é review)',
  !!core.resolvePosition({ journeyId: 'freedom', season: 0, node: 3, kind: 'grammar' }) &&
  core.resolvePosition({ journeyId: 'freedom', season: 0, node: 3, kind: 'reading' }) === null);
check('Sem contexto = prática livre', aw.parseJourney(undefined) === null && aw.parseJourney('x') === null);
check('award-activity usa a mesma conferência', !!aw.parseJourney({ journeyId: 'freedom', season: 0, node: 0, kind: 'writing' }) &&
  aw.parseJourney({ journeyId: 'freedom', season: 0, node: 3, kind: 'writing' }) === null);

console.log('\n── Trava de acesso (anti-fraude e anti-gasto de IA) ──');
const KINDS5 = core.KINDS;
const progWith = (entries) => ({ journeys: { freedom: { nodes: Object.fromEntries(entries) } } });
const doneNode = (season, node, kinds, pct) => [
  `s${season}_n${node}`,
  { exercises: Object.fromEntries(kinds.map(k => [k, { bestPct: pct }])) },
];
const P = (season, node, kind = 'grammar') => core.resolvePosition({ journeyId: 'freedom', season, node, kind });
const allSkills = (lvl) => ({ placementResults: { grammar: { level: lvl }, reading: { level: lvl }, listening: { level: lvl }, writing: { level: lvl } } });

check('Aluno novo pode fazer o primeiro Step', core.canAccess(P(0, 0), null, {}).allowed === true);
check('Aluno novo NÃO pode saltar para o Step 10', core.canAccess(P(0, 10), null, {}).allowed === false);
check('Motivo do bloqueio dentro da Season é STEP_LOCKED', core.canAccess(P(0, 10), null, {}).reason === 'STEP_LOCKED');
check('Aluno novo NÃO pode abrir a Season 5', core.canAccess(P(4, 0), null, {}).allowed === false);
check('Motivo do bloqueio de Season é SEASON_LOCKED', core.canAccess(P(4, 0), null, {}).reason === 'SEASON_LOCKED');
check('Concluir o Step 1 libera o Step 2',
  core.canAccess(P(0, 1), progWith([doneNode(0, 0, KINDS5, 80)]), {}).allowed === true);
check('Step 1 com média baixa NÃO libera o Step 2',
  core.canAccess(P(0, 1), progWith([doneNode(0, 0, KINDS5, 40)]), {}).allowed === false);
check('Step 1 incompleto NÃO libera o Step 2',
  core.canAccess(P(0, 1), progWith([doneNode(0, 0, ['grammar', 'reading'], 100)]), {}).allowed === false);
check('Revisar um Step já concluído continua liberado',
  core.canAccess(P(0, 0), progWith([doneNode(0, 0, KINDS5, 80)]), {}).allowed === true);
check('Nivelamento completo em B1 abre a Season 3 direto',
  core.canAccess(P(2, 0), null, allSkills('B1')).allowed === true);
check('Nivelamento em B1 NÃO abre a Season 4', core.canAccess(P(3, 0), null, allSkills('B1')).allowed === false);
check('Em Season pulada o aluno circula livre (Step 10 aberto)',
  core.canAccess(P(1, 10), null, allSkills('B1')).allowed === true);
check('Nivelamento incompleto não abre nada',
  core.canAccess(P(2, 0), null, { placementResults: { reading: { level: 'C1' } } }).allowed === false);
check('Servidor e front concordam sobre quantas Seasons pular',
  core.seasonsSkipped(allSkills('B2')) === 3 && core.seasonsSkipped({}) === 0);

console.log('\n── Assinatura interna das chamadas de áudio ──');
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || 'chave-de-teste';
const bid = 'freedom_s0_n2_listening';
check('Assinatura própria é aceita', sign.verifyBankId(bid, sign.signBankId(bid)) === true);
check('Assinatura de OUTRO exercício é recusada', sign.verifyBankId(bid, sign.signBankId('freedom_s0_n7_listening')) === false);
check('Chamada sem assinatura é recusada', sign.verifyBankId(bid, undefined) === false);
check('Assinatura inventada é recusada', sign.verifyBankId(bid, 'a'.repeat(64)) === false);

console.log('\n── award-activity: assinatura do "XP só na 1ª vez" ──');
const jSig = aw.signatureOf({ type: 'quiz', level: 'A1', theme: 'Gramática', topic: 'Verbo to be', journey: { journeyId: 'freedom', season: 0, node: 0, kind: 'grammar' } });
const freeSig = aw.signatureOf({ type: 'quiz', level: 'A1', theme: 'Gramática', topic: 'Verbo to be' });
check('Trilha e prática livre são atividades distintas', jSig !== freeSig);
check('Assinatura da trilha vem da posição, não do texto',
  jSig === aw.signatureOf({ type: 'quiz', level: 'A1', theme: 'Gramática', topic: 'OUTRO NOME', journey: { journeyId: 'freedom', season: 0, node: 0, kind: 'grammar' } }));
check('Cada exercício do Step tem assinatura própria',
  jSig !== aw.signatureOf({ type: 'quiz', level: 'A1', theme: 'Vocabulário', topic: 'Family', journey: { journeyId: 'freedom', season: 0, node: 0, kind: 'vocabulary' } }));
check('Jornadas diferentes não roubam XP uma da outra',
  jSig !== aw.signatureOf({ type: 'quiz', level: 'A1', theme: 'Gramática', topic: 'Verbo to be', journey: { journeyId: 'business', season: 0, node: 0, kind: 'grammar' } }));
check('Prática livre ignora maiúsculas e espaços no tópico',
  freeSig === aw.signatureOf({ type: 'quiz', level: 'A1', theme: 'Gramática', topic: '  VERBO TO BE  ' }));

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passaram, ${fail} falharam\n`);
process.exit(fail === 0 ? 0 : 1);
