// ============================================================
// Testes das contas do Painel Admin, do rascunho de exercício e do
// sinal de vida (sem rede, sem Firebase, sem navegador).
// Roda com:  node test-analytics.mjs
// ============================================================

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const out = (n) => path.join(os.tmpdir(), n);
const build = (entry, file) => execSync(`npx esbuild ${entry} --bundle --format=cjs --platform=node --outfile=${out(file)} --log-level=error`, { stdio: 'inherit' });
build('services/analytics.ts', 'fa-analytics.cjs');
build('services/activityDraft.ts', 'fa-draft.cjs');
build('services/activity.ts', 'fa-activity.cjs');
const require = createRequire(import.meta.url);
const A = require(out('fa-analytics.cjs'));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

const DAY = 86400000;
// "Agora" fixo: quarta 16/09/2026, 15h de Brasília (18h UTC).
const NOW = Date.UTC(2026, 8, 16, 18, 0, 0);

console.log('\n── Fuso de São Paulo ──');
check('22h de Brasília ainda é o mesmo dia (era o bug do UTC)', A.spParts(Date.UTC(2026, 8, 17, 1, 0)).day === '2026-09-16');
check('hora local correta', A.spParts(Date.UTC(2026, 8, 17, 1, 0)).hour === 22);
check('dia da semana (quarta = 3)', A.spParts(NOW).weekday === 3);
check('meia-noite de SP = 03h UTC', A.spStartOfDay(NOW) === Date.UTC(2026, 8, 16, 3, 0, 0));

console.log('\n── Períodos ──');
const r7 = A.periodRange('7d', NOW);
check('7 dias têm 7 rótulos', r7.days.length === 7);
check('o último dia é hoje', r7.days[6] === '2026-09-16');
check('o primeiro é 6 dias atrás', r7.days[0] === '2026-09-10');
check('período anterior cola no atual', r7.prevTo === r7.from && r7.from - r7.prevFrom === 7 * DAY);
check('"hoje" tem 1 dia', A.periodRange('today', NOW).days.length === 1);

// ── Cenário ─────────────────────────────────────────────────
const sess = (userId, daysAgo, min, extra = {}) => {
  const startedAt = NOW - daysAgo * DAY;
  const p = A.spParts(startedAt);
  return { userId, startedAt, lastSeenAt: startedAt + min * 60000, day: p.day, hour: p.hour, weekday: p.weekday,
    activeMs: min * 60000, screens: { selection: min * 30000, quiz: min * 30000 }, visits: { selection: 2, quiz: 1 },
    events: { ex_start: 2, ex_finish: 1, ex_abandon: 1 }, device: 'mobile', ...extra };
};
const hist = (userId, daysAgo, score, theme = 'Gramática') => ({ userId, date: NOW - daysAgo * DAY, theme, level: 'A1', score, total: 10 });
const user = (id, extra = {}, g = {}) => ({ userId: id, username: '@' + id, fullName: id.toUpperCase(), email: id + '@x.com',
  gamification: { xp: 100, streak: 1, lastLoginDate: null, totalActivities: 0, ...g }, ...extra });

const users = [
  user('ana', {}, { totalActivities: 40 }),
  user('bia', {}, { totalActivities: 12 }),
  user('caio', {}, { totalActivities: 5 }),
  user('duda', {}, { totalActivities: 2 }),
  user('edu', { createdAt: NOW - 3 * DAY, accessStatus: 'pending' }),
  user('chefe', { isAdmin: true }, { totalActivities: 99 }),
];
const sessions = [sess('ana', 0, 20), sess('ana', 1, 10), sess('ana', 9, 10), sess('bia', 10, 6, { device: 'desktop', visits: { selection: 1, journey: 3 }, screens: { journey: 360000 } })];
const history = [hist('ana', 0, 9), hist('ana', 1, 7), hist('ana', 9, 5), hist('ana', 40, 5), hist('bia', 10, 8, 'Listening'), hist('caio', 20, 6), hist('duda', 50, 4)];

console.log('\n── Visão geral (7 dias) ──');
const ov = A.buildOverview(sessions, history, 5, r7);
check('acessos no período', ov.accesses.value === 2, `(${ov.accesses.value})`);
check('acessos no período anterior', ov.accesses.prev === 2, `(${ov.accesses.prev})`);
check('variação 0%', ov.accesses.delta === 0);
check('alunos ativos = 1 (Ana)', ov.activeStudents.value === 1);
check('exercícios = 2', ov.exercises.value === 2);
check('tempo médio por acesso = 15 min', ov.avgSessionMin.value === 15, `(${ov.avgSessionMin.value})`);
check('taxa de conclusão = 50%', ov.completionRate === 50);
check('nota média = 80%', ov.avgScore === 80);
check('série diária tem 7 pontos', ov.daily.length === 7);
check('hoje: 1 acesso, 1 exercício, 20 min', ov.daily[6].acessos === 1 && ov.daily[6].exercicios === 1 && ov.daily[6].minutos === 20);
check('abas: início com 4 visitas', ov.screens.find(s => s.key === 'selection')?.visits === 4);
check('quiz não entra como "aba"', ov.screens.find(s => s.key === 'quiz')?.feature === false);
check('Journey aparece como NÃO acessada', ov.unused.some(u => u.key === 'journey' && u.students === 0));
check('mapa de calor soma os acessos', ov.heatmap.flat().reduce((a, b) => a + b, 0) === 2);
check('aparelho: celular', ov.devices[0].device === 'mobile' && ov.devices[0].count === 2);
check('sem sessões → trackingSince nulo', A.buildOverview([], history, 5, r7).trackingSince === null);
check('sem sessões → exercícios continuam contando', A.buildOverview([], history, 5, r7).exercises.value === 2);
check('sem dados nenhum não quebra', A.buildOverview([], [], 0, r7).completionRate === null);

console.log('\n── Alunos ──');
const rows = A.buildStudentRows(users, sessions, history, NOW);
const row = (id) => rows.find(r => r.userId === id);
check('admin fica fora da lista', !row('chefe') && rows.length === 5);
check('Ana: ativa', row('ana').status === 'ativo');
check('Bia: esfriando (10 dias)', row('bia').status === 'esfriando', `(${row('bia').status})`);
check('Caio: em risco (20 dias)', row('caio').status === 'em_risco');
check('Duda: inativa (50 dias)', row('duda').status === 'inativo');
check('Edu: nunca praticou', row('edu').status === 'nunca_praticou');
check('Edu: acesso pendente', row('edu').accessStatus === 'pending');
check('conta antiga sem o campo = liberada', row('ana').accessStatus === 'approved');
check('Ana: 3 acessos e 40 min em 30 dias', row('ana').sessions30 === 3 && row('ana').minutes30 === 40);
check('Ana: 3 exercícios em 30d, 1 nos 30 anteriores, +200%', row('ana').exercises30 === 3 && row('ana').exercisesPrev30 === 1 && row('ana').trend === 200);
check('Ana: nota média 70%', row('ana').avgPct30 === 70);
check('total usa o maior entre contador e histórico', row('ana').totalExercises === 40);
check('lastLoginDate antigo conta como último sinal', A.buildStudentRows([user('z', {}, { totalActivities: 3, lastLoginDate: '2026-09-15' })], [], [], NOW)[0].status === 'ativo');

console.log('\n── Engajamento ──');
const en = A.buildEngagement(users, rows, sessions, history, NOW);
check('funil começa com 5 contas', en.funnel[0].count === 5);
check('funil: 4 fizeram o 1º exercício', en.funnel[1].count === 4);
check('funil: 2 chegaram a 10 exercícios', en.funnel[2].count === 2);
check('funil: 1 ativo em 7 dias', en.funnel[4].count === 1);
check('12 semanas', en.weekly.length === 12);
check('última semana: 1 aluno, 2 exercícios', en.weekly[11].alunos === 1 && en.weekly[11].exercicios === 2, JSON.stringify(en.weekly[11]));
check('contagem por situação fecha com o total', Object.values(en.statusCounts).reduce((a, b) => a + b, 0) === 5);
check('retorno: semana passada {Ana, Bia} → voltou só a Ana = 50%', en.returnRate === 50, `(${en.returnRate})`);
check('"fez 1–2 e sumiu": Duda', en.oneAndDone === 1);
check('contas novas em 30 dias: Edu', en.newAccounts30 === 1);

console.log('\n── Ficha do aluno ──');
const det = A.buildStudentDetail(sessions.filter(s => s.userId === 'ana'), history.filter(h => h.userId === 'ana'), NOW);
check('30 pontos diários', det.daily.length === 30);
check('tempo total 40 min, média 13,3', det.totalMinutes === 40 && det.avgSessionMin === 13.3);
check('nunca abriu a Journey', det.neverOpened.includes('Journey to Fluency'));
check('evolução em ordem cronológica', det.scoreTrend[0].pct === 50 && det.scoreTrend.at(-1).pct === 90);
check('abandonos somados', det.abandoned === 3 && det.started === 6);

console.log('\n── Exibição ──');
check('minutos', A.fmtMinutes(0.4) === '< 1 min' && A.fmtMinutes(45) === '45 min' && A.fmtMinutes(125) === '2h 5min');
check('"há 3 dias"', A.fmtAgo(NOW - 3 * DAY, NOW) === 'há 3 dias');
check('"ontem"', A.fmtAgo(NOW - DAY, NOW) === 'ontem');
check('"nunca"', A.fmtAgo(null, NOW) === 'nunca');
check('CSV escapa aspas e usa ;', A.toCsv([['a"b', 1]]).includes('"a""b";"1"'));

// ── Rascunho (localStorage falso) ───────────────────────────
console.log('\n── Rascunho do exercício ──');
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const D = require(out('fa-draft.cjs'));
const content = { questions: [{ q: 1 }, { q: 2 }], audioData: 'x'.repeat(5000), imageData: 'y'.repeat(5000), audioUrl: 'https://a/b.wav' };
D.saveDraft('u1', { screen: 'quiz', level: 'A1', theme: 'Listening', subTopic: 'Travel', content, journeyContext: null });
const d1 = D.loadDraft('u1');
check('salva e carrega', d1 && d1.screen === 'quiz' && d1.content.questions.length === 2);
check('não guarda audioData/imageData (megabytes)', !d1.content.audioData && !d1.content.imageData && d1.content.audioUrl);
check('isolado por aluno', D.loadDraft('u2') === null);
D.updateDraftProgress('u1', { index: 1, score: 1 });
check('progresso atualizado', D.loadDraft('u1').progress.index === 1 && D.loadDraft('u1').progress.score === 1);
D.updateDraftProgress('u1', { text: 'My essay' });
check('texto da redação soma ao progresso', D.loadDraft('u1').progress.text === 'My essay' && D.loadDraft('u1').progress.index === 1);
const raw = JSON.parse(store.get('freedom_activity_draft_u1')); raw.savedAt = Date.now() - 25 * 3600000; store.set('freedom_activity_draft_u1', JSON.stringify(raw));
check('expira em 24h', D.loadDraft('u1') === null && !store.has('freedom_activity_draft_u1'));
store.set('freedom_activity_draft_u1', '{quebrado');
check('JSON corrompido não derruba o app', D.loadDraft('u1') === null);
D.saveDraft('u1', { screen: 'writing', level: 'B1', theme: 'Escrita', subTopic: 'x', content });
D.clearDraft('u1');
check('limpeza', D.loadDraft('u1') === null);
globalThis.localStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('cheio'); }, removeItem() {} };
let threw = false; try { D.saveDraft('u1', { screen: 'quiz', level: 'A1', theme: 't', subTopic: 's', content }); D.loadDraft('u1'); } catch { threw = true; }
check('localStorage bloqueado/cheio não lança erro', !threw);

console.log('\n── Sinal de vida ──');
const Act = require(out('fa-activity.cjs'));
Act.pingActivity();
check('logo após o sinal, ~0 ms', Act.msSinceLastActivity() < 50);
await new Promise(r => setTimeout(r, 120));
check('o tempo parado cresce', Act.msSinceLastActivity() >= 100);
Act.pingActivity();
check('novo sinal zera', Act.msSinceLastActivity() < 50);

console.log(`\n${pass} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
