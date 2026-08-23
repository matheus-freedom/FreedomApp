// ============================================================
// Testes da lógica da Journey to Fluency (sem rede, sem IA).
// Roda com:  node test-journey.mjs
// O arquivo journeys.ts é compilado na hora pelo esbuild.
// ============================================================

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

execSync('npx esbuild journeys.ts --bundle --format=cjs --platform=node --outfile=/tmp/journeys-test.cjs --log-level=error', { stdio: 'inherit' });
const require = createRequire(import.meta.url);
const J = require('/tmp/journeys-test.cjs');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

// Progresso falso: marca exercícios de um nó com uma nota.
const withNode = (journeyId, season, node, kinds, pct) => {
  const doc = { journeys: { [journeyId]: { startedAt: 1, nodes: {} } } };
  doc.journeys[journeyId].nodes[J.nodeKeyOf(season, node)] = {
    exercises: Object.fromEntries(kinds.map(k => [k, { bestPct: pct, attempts: 1, stars: J.starsFor(pct), completedAt: 1 }])),
  };
  return doc;
};

console.log('\n── Currículo ──');
const s1 = J.buildSeasonNodes('freedom', 0);
check('Season 1 tem 15 steps', s1.filter(n => n.type === 'step').length === 15);
check('Season 1 tem 4 reviews (após steps 3, 6, 9 e 12)', s1.filter(n => n.type === 'review').length === 4);
check('Review nunca é o último nó da Season', s1[s1.length - 1].type === 'step');
check('Review cobre exatamente 3 tópicos', s1.filter(n => n.type === 'review').every(n => n.grammarTopics.length === 3));
check('Step tem 5 exercícios; Review tem 1', s1[0].kinds.length === 5 && s1[3].kinds.length === 1);
check('Step 1 = verbo to be + Family', s1[0].grammarTopic.includes('to be') && s1[0].vocabTheme === 'Family');
check('Jornadas mudam o vocabulário, não a gramática',
  J.buildSeasonNodes('business', 0)[0].grammarTopic === s1[0].grammarTopic &&
  J.buildSeasonNodes('business', 0)[0].vocabTheme !== s1[0].vocabTheme);
check('Nenhum tema de vocabulário fica indefinido',
  ['freedom', 'business', 'young', 'traveler'].every(j =>
    [0, 1, 2, 3, 4].every(s => J.buildSeasonNodes(j, s).every(n => !!n.vocabTheme))));
check('Ids do banco são únicos por exercício', (() => {
  const ids = new Set(); let total = 0;
  for (const j of ['freedom', 'business', 'young', 'traveler'])
    for (let s = 0; s < 5; s++)
      for (const n of J.buildSeasonNodes(j, s))
        for (const k of n.kinds) { ids.add(J.bankIdOf(j, s, n.index, k)); total++; }
  return ids.size === total;
})());

console.log('\n── Desbloqueio por nivelamento (menor nível entre as 4 habilidades) ──');
const all = (g, r, l, w) => ({ grammar: { level: g }, reading: { level: r }, listening: { level: l }, writing: { level: w } });
check('Sem nivelamento = nenhuma Season pulada', J.seasonsSkippedByPlacement({}, undefined) === 0);
check('Todas em B1 → pula 2 (Seasons A1 e A2)', J.seasonsSkippedByPlacement(all('B1', 'B1', 'B1', 'B1')) === 2);
check('O MENOR nível manda (B2/B1/A2/B1 → pula 1)', J.seasonsSkippedByPlacement(all('B2', 'B1', 'A2', 'B1')) === 1);
check('Uma habilidade em A1 zera o pulo', J.seasonsSkippedByPlacement(all('C1', 'C1', 'C1', 'A1')) === 0);
check('Todas em C1 → pula 4', J.seasonsSkippedByPlacement(all('C1', 'C1', 'C1', 'C1')) === 4);
check('Nivelamento INCOMPLETO não pula nada (só Reading em C1)',
  J.seasonsSkippedByPlacement({ reading: { level: 'C1' } }) === 0);
check('Três de quatro habilidades ainda não basta',
  J.seasonsSkippedByPlacement({ grammar: { level: 'B1' }, reading: { level: 'B1' }, listening: { level: 'B1' } }) === 0);
check('Nivelamento antigo (lastPlacementLevel) ainda vale', J.seasonsSkippedByPlacement({}, 'B2') === 3);
check('Quantas habilidades faltam nivelar', J.placementSkillsMissing({ grammar: { level: 'B1' } }) === 3 && J.placementSkillsMissing(all('B1', 'B1', 'B1', 'B1')) === 0);

console.log('\n── Progressão dentro da Season ──');
let ov = J.journeyOverview('freedom', null, 0);
check('Aluno novo: primeiro nó é o atual', ov.seasons[0].nodes[0].state === 'current');
check('Aluno novo: segundo nó está bloqueado', ov.seasons[0].nodes[1].state === 'locked');
check('Aluno novo: próximo exercício é gramática do Step 1',
  ov.next && ov.next.season === 0 && ov.next.node.index === 0 && ov.next.kind === 'grammar');
check('Aluno novo: progresso geral 0%', ov.overall === 0);

const KINDS = J.JOURNEY_KINDS;
ov = J.journeyOverview('freedom', withNode('freedom', 0, 0, KINDS, 80), 0);
check('Step com média 80% é aprovado', ov.seasons[0].nodes[0].state === 'done');
check('Aprovar o Step 1 libera o Step 2', ov.seasons[0].nodes[1].state === 'current');
check('Próximo exercício passa a ser o Step 2', ov.next.node.index === 1 && ov.next.kind === 'grammar');

ov = J.journeyOverview('freedom', withNode('freedom', 0, 0, KINDS, 50), 0);
check('Step com média 50% NÃO é aprovado', ov.seasons[0].nodes[0].state === 'current');
check('Step reprovado mantém o próximo bloqueado', ov.seasons[0].nodes[1].state === 'locked');

// Média 76% (4 notas de 90 e uma de 20): passa mesmo com um exercício ruim.
const mixedPass = withNode('freedom', 0, 0, KINDS, 90);
mixedPass.journeys.freedom.nodes['s0_n0'].exercises.listening = { bestPct: 20, attempts: 1, stars: 1, completedAt: 1 };
ov = J.journeyOverview('freedom', mixedPass, 0);
check('Média do Step considera todas as notas', ov.seasons[0].nodes[0].pct === Math.round((90 * 4 + 20) / 5));
check('Uma nota baixa não reprova se a média se sustenta', ov.seasons[0].nodes[0].passed === true);

// Média 48%: reprovado, e o caminho mais curto é refazer o pior.
const mixedFail = withNode('freedom', 0, 0, KINDS, 55);
mixedFail.journeys.freedom.nodes['s0_n0'].exercises.listening = { bestPct: 20, attempts: 1, stars: 1, completedAt: 1 };
ov = J.journeyOverview('freedom', mixedFail, 0);
check('Step reprovado continua sendo o atual', ov.seasons[0].nodes[0].state === 'current');
check('Step reprovado aponta para o exercício de PIOR nota', ov.next.kind === 'listening', `(apontou ${ov.next?.kind})`);

const partial = withNode('freedom', 0, 0, ['grammar', 'vocabulary'], 100);
ov = J.journeyOverview('freedom', partial, 0);
check('Step incompleto aponta para o próximo exercício não feito', ov.next.kind === 'reading');
check('Exercícios não feitos contam 0 na média', ov.seasons[0].nodes[0].pct === 40);

console.log('\n── Seasons puladas pelo nivelamento ──');
ov = J.journeyOverview('freedom', null, 2);
check('Season 1 (pulada) fica desbloqueada para revisão', ov.seasons[0].unlocked === true);
check('Season 3 abre direto quando o nivelamento pulou 2', ov.seasons[2].unlocked === true);
check('Season 4 continua bloqueada', ov.seasons[3].unlocked === false);
check('Próximo exercício começa na Season 3', ov.next.season === 2);
check('Seasons puladas contam como 100% no progresso geral', ov.overall === 40, `(deu ${ov.overall})`);
check('Em Season pulada NENHUM Step fica cadeado (revisão livre)',
  ov.seasons[0].nodes.every(n => n.state !== 'locked'), `(cadeados: ${ov.seasons[0].nodes.filter(n => n.state === 'locked').length})`);
check('Season pulada é marcada como zona livre', ov.seasons[0].nodes.every(n => n.freeRoam === true));
check('Season normal NÃO é zona livre', ov.seasons[2].nodes.every(n => n.freeRoam === false));
check('Na Season normal o 2º Step continua cadeado até o 1º passar', ov.seasons[2].nodes[1].state === 'locked');

console.log('\n── Estrelas ──');
check('90%+ = 3 estrelas', J.starsFor(90) === 3 && J.starsFor(100) === 3);
check('75-89% = 2 estrelas', J.starsFor(75) === 2 && J.starsFor(89) === 2);
check('abaixo de 75% = 1 estrela', J.starsFor(74) === 1 && J.starsFor(0) === 1);

console.log('\n── Correção das lacunas (mesma regra do GapFillScreen) ──');
const normalize = (s) => String(s || '').toLowerCase().replace(/[’‘`´]/g, "'").replace(/[.,!?;:]+$/g, '').replace(/\s+/g, ' ').trim();
const isCorrect = (typed, item) => {
  const t = normalize(typed);
  if (!t) return false;
  return [item.answer, ...(item.alternatives || [])].map(normalize).filter(Boolean).includes(t);
};
const item = { answer: "isn't", alternatives: ['is not'] };
check('Aceita a resposta exata', isCorrect("isn't", item));
check('Ignora maiúsculas', isCorrect("ISN'T", item));
check('Ignora espaços em volta', isCorrect("  isn't  ", item));
check('Aceita apóstrofo curvo do celular', isCorrect('isn’t', item));
check('Aceita a alternativa', isCorrect('is not', item));
check('Ignora pontuação final', isCorrect('is not.', item));
check('Recusa resposta errada', !isCorrect('are not', item));
check('Recusa resposta vazia', !isCorrect('   ', item));

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passaram, ${fail} falharam\n`);
process.exit(fail === 0 ? 0 : 1);
