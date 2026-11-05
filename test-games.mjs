// Testes da aba Games (Quiz Party e Draw It!).
//   node test-games.mjs
// 1) Regras puras (lib/games-core.js): pontos, palpites, dicas, banco.
// 2) Centenas de partidas simuladas (só regras) sem travar nem quebrar.
// 3) A function games.js INTEIRA contra um Firestore falso em memória,
//    com o relógio controlado pelo teste (Date.now trocado).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const core = require('./netlify/functions/lib/games-core.js');
const WORDS = require('./netlify/functions/lib/games/draw-words.json');
const { makeDb, installFakeAdmin } = require('./preview/fake-firestore.cjs');

let ok = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); ok++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '\n     ', e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e); }
};
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };
const yes = (v, m = 'esperado verdadeiro') => { if (!v) throw new Error(m); };

// Sorteio previsível para as simulações.
const seeded = (s) => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };

console.log('\n1) Regras puras');
await t('Pontos do quiz: instantâneo 1000, no limite 500', () => {
  eq(core.quizPoints(0, 20000, 1), 1000);
  eq(core.quizPoints(20000, 20000, 1), 500);
  eq(core.quizPoints(10000, 20000, 1), 750);
  eq(core.quizPoints(-50, 20000, 1), 1000, 'tempo negativo');
});
await t('Bônus de sequência: +50 por acerto seguido, máximo +250', () => {
  eq(core.quizPoints(0, 20000, 2), 1050);
  eq(core.quizPoints(0, 20000, 6), 1250);
  eq(core.quizPoints(0, 20000, 20), 1250);
});
await t('Palpite aceita maiúscula, artigo, hífen, acento e plural', () => {
  const ice = { w: 'ice cream', alt: ['icecream'] };
  yes(core.matchesWord('The Ice-Cream!', ice));
  yes(core.matchesWord('  ice   cream ', ice));
  yes(core.matchesWord('cats', { w: 'cat' }));
  yes(core.matchesWord('a cat', { w: 'cat' }));
  yes(core.matchesWord('sunglasses', { w: 'glasses', alt: ['sunglasses'] }));
  yes(core.matchesWord('bunny', { w: 'rabbit', alt: ['bunny'] }), 'alternativa');
  yes(core.matchesWord('cafe', { w: 'café' }), 'acento');
});
await t('Palpite não aceita parecidos demais nem vazio', () => {
  yes(!core.matchesWord('bu', { w: 'bus' }));
  yes(!core.matchesWord('dog', { w: 'cat' }));
  yes(!core.matchesWord('', { w: 'cat' }));
  yes(!core.matchesWord('the', { w: 'cat' }));
});
await t('"Quase!" só para um erro de digitação (dois em palavra longa)', () => {
  yes(core.isClose('elefant', { w: 'elephant' }));
  yes(core.isClose('girafe', { w: 'giraffe' }));
  yes(!core.isClose('dog', { w: 'cat' }));
  yes(!core.isClose('ca', { w: 'cat' }));
  yes(core.isClose('lighthous', { w: 'lighthouse' }));
});
await t('Máscara esconde letras e mostra espaço/hífen', () => {
  eq(core.maskOf('ice cream', []), [null, null, null, ' ', null, null, null, null, null]);
  eq(core.maskOf('hot-air', [0]), ['h', null, null, '-', null, null, null]);
});
await t('Dica nunca revela mais da metade das letras', () => {
  const room = { settings: { drawMs: 80000 }, drawStartsAt: 0, drawEndsAt: 80000, hintsGiven: 0 };
  const secret = { word: { w: 'cat' }, revealed: [] };
  for (let i = 0; i < 10; i++) core.giveHint(room, secret, Math.random);
  yes(secret.revealed.length <= 1, 'cat: no máximo 1 letra');
  const s2 = { word: { w: 'elephant' }, revealed: [] };
  for (let i = 0; i < 10; i++) core.giveHint(room, s2, Math.random);
  yes(s2.revealed.length <= 4);
});
await t('Banco de palavras: 5 níveis, sem repetição, com tradução e categoria', () => {
  for (const lv of core.LEVELS) {
    const list = WORDS[lv];
    yes(list && list.length >= 45, `${lv} tem ${list && list.length}`);
    const seen = new Set();
    for (const e of list) {
      yes(e.w && e.pt && e.c, `${lv} incompleto: ${JSON.stringify(e)}`);
      yes(!seen.has(e.w), `${lv} repetido: ${e.w}`);
      seen.add(e.w);
      yes(core.matchesWord(e.w, e), `${e.w} não casa consigo mesmo`);
      for (const a of e.alt || []) yes(core.matchesWord(a, e), `${a} não casa com ${e.w}`);
    }
  }
});
await t('Código da sala: 5 caracteres, sem letras que confundem', () => {
  for (let i = 0; i < 200; i++) {
    const c = core.makeCode();
    yes(c.length === 5 && !/[O0I1]/.test(c), c);
  }
  eq(core.cleanCode(' ab-c d9 '), 'ABCD9');
});
await t('Teto diário: 200 XP e FR$ 1 por dia nos games', () => {
  const now = Date.UTC(2026, 10, 5, 15);
  let c = core.applyDailyCap(null, { xp: 150, fr: 0.6 }, now);
  eq([c.xp, c.fr], [150, 0.6]);
  c = core.applyDailyCap(c.daily, { xp: 150, fr: 0.6 }, now);
  eq([c.xp, c.fr, c.capped], [50, 0.4, true]);
  c = core.applyDailyCap(c.daily, { xp: 10, fr: 0.1 }, now + 86400000);
  eq([c.xp, c.fr], [10, 0.1], 'dia seguinte zera');
});
await t('Prêmio em grupo exige 2 participantes; quem não jogou não ganha', () => {
  const room = core.newRoom({ id: 'r', code: 'X', game: 'quiz', mode: 'party', hostId: 'a', hostInfo: { username: 'a' }, hostPlays: true, level: 'A1', now: 1 });
  core.addPlayer(room, 'b', { username: 'b' }, 2);
  room.players.a.acts = 3; room.players.a.score = 2000; room.players.a.correct = 2;
  let r = core.rewardsFor(room);
  eq(Object.keys(r), ['a']);
  eq(r.a.place, null, 'sozinho não tem colocação');
  room.players.b.acts = 1; room.players.b.score = 500; room.players.b.correct = 1;
  room.standings = core.standings(room);
  r = core.rewardsFor(room);
  eq([r.a.place, r.a.xp, r.a.fr], [1, 44, 0.3]);
  eq([r.b.place, r.b.xp], [2, 32]);
});

console.log('\n2) Partidas simuladas (só regras)');
await t('300 partidas de Draw It! com saídas e palpites aleatórios terminam bem', () => {
  for (let g = 0; g < 300; g++) {
    const rand = seeded(g + 1);
    let now = 1e12;
    const n = 2 + Math.floor(rand() * 6);
    const room = core.newRoom({ id: 'r' + g, code: 'C', game: 'draw', mode: 'party', hostId: 'p0', hostInfo: { username: 'p0' }, level: core.LEVELS[g % 5], settings: { rounds: 1 + (g % 3) }, now });
    for (let i = 1; i < n; i++) core.addPlayer(room, 'p' + i, { username: 'p' + i }, now);
    const secret = {};
    core.drawStart(room, secret, now, rand);
    let steps = 0;
    while (room.status === 'playing' && steps++ < 5000) {
      now += 500 + Math.floor(rand() * 4000);
      const online = new Set(core.activeUids(room));
      if (room.phase === 'choose' && rand() < 0.7) core.drawPick(room, secret, room.drawer, Math.floor(rand() * 3), now);
      if (room.phase === 'draw') {
        for (const u of core.drawGuessers(room, online)) {
          if (rand() < 0.15) core.drawGuess(room, secret, u, rand() < 0.5 ? secret.word.w : 'zzz', now, online);
        }
        if (rand() < 0.01) core.drawReport(room, secret, core.drawGuessers(room, online)[0] || 'p0', now, online);
      }
      if (rand() < 0.01 && core.activeUids(room).length) core.removePlayer(room, core.activeUids(room)[Math.floor(rand() * core.activeUids(room).length)], now);
      core.tick(room, secret, now, { online: new Set(core.activeUids(room)), rand });
    }
    yes(room.status === 'finished', `partida ${g} não terminou (${room.phase})`);
    for (const u of core.playerUids(room)) yes(room.players[u].score >= 0, 'pontos negativos');
    for (const r of Object.values(room.rewards)) yes(r.xp >= 0 && r.xp <= 200 && r.fr >= 0, 'prêmio estranho');
  }
});
await t('300 partidas de Quiz Party terminam com placar coerente', () => {
  for (let g = 0; g < 300; g++) {
    const rand = seeded(g + 7);
    let now = 1e12;
    const n = 1 + Math.floor(rand() * 12);
    const room = core.newRoom({ id: 'q' + g, code: 'C', game: 'quiz', mode: g % 4 === 0 ? 'solo' : 'party', hostId: 'p0', hostInfo: { username: 'p0' }, hostPlays: g % 3 !== 0, level: 'B1', settings: { count: [5, 10, 15][g % 3] }, now });
    if (room.mode === 'party') for (let i = 1; i < n; i++) core.addPlayer(room, 'p' + i, { username: 'p' + i }, now);
    const secret = { questions: Array.from({ length: room.settings.count }, (_, i) => ({ pub: { q: 'q' + i, options: ['a', 'b', 'c', 'd'] }, answer: i % 4, cat: core.QUIZ_CATS[i % 6] })) };
    if (!core.activeUids(room).length) continue;
    core.quizStart(room, secret, now);
    let steps = 0, sumPts = 0;
    while (room.status === 'playing' && steps++ < 1000) {
      const answers = {};
      for (const u of core.activeUids(room)) if (rand() < 0.85) answers[u] = { choice: Math.floor(rand() * 4), at: room.q.startsAt + Math.floor(rand() * room.q.ms) };
      now = room.nextAt;
      yes(core.tick(room, secret, now).includes('reveal_due'));
      core.quizReveal(room, secret, answers, now);
      sumPts += Object.values(room.reveal.results).reduce((a, r) => a + r.pts, 0);
      now = room.nextAt;
      core.tick(room, secret, now);
    }
    yes(room.status === 'finished', 'quiz não terminou');
    eq(core.playerUids(room).reduce((a, u) => a + room.players[u].score, 0), sumPts, 'soma de pontos');
    const st = room.standings;
    for (let i = 1; i < st.length; i++) yes(st[i - 1].score >= st[i].score, 'pódio fora de ordem');
  }
});

console.log('\n3) Function games.js contra Firestore falso');
const { db, store } = makeDb();
installFakeAdmin(db, '.');
let clock = Date.UTC(2026, 10, 5, 15);
Date.now = () => clock;
const { handler } = require('./netlify/functions/games.js');
const call = async (uid, body) => {
  const r = await handler({ httpMethod: 'POST', headers: { authorization: `Bearer ${uid}`, origin: 'https://freedom.app.br' }, body: JSON.stringify(body) });
  const j = JSON.parse(r.body);
  j._status = r.statusCode;
  return j;
};
const mustOk = async (uid, body) => { const r = await call(uid, body); if (r._status !== 200) throw new Error(`${body.action} falhou: ${r.error}`); return r; };
const user = (uid, username, g = {}, extra = {}) => store.set(`users/${uid}`, { userId: uid, username, fullName: username.replace('@', ''), gamification: { xp: 100, frBalance: 5, placementResults: { grammar: { level: 'A2' } }, ...g }, ...extra });
user('ana', '@ana'); user('bia', '@bia'); user('caio', '@caio'); user('duda', '@duda');
user('prof', '@prof', {}, { isAdmin: true });
user('novo', '@novo', { placementResults: {} });
user('bloq', '@bloq', {}, { accessStatus: 'blocked' });
const room = (id) => store.get(`game_rooms/${id}`);
const secret = (id) => store.get(`game_secrets/${id}`);
const beat = (id, ...uids) => { for (const u of uids) store.set(`game_rooms/${id}/presence/${u}`, { at: clock }); };

await t('Conta bloqueada não joga', async () => {
  const r = await call('bloq', { action: 'hub' });
  eq(r._status, 403);
});
await t('Sem nível: pede o "Qual seu nível?"', async () => {
  const r = await call('novo', { action: 'create', game: 'quiz', mode: 'solo' });
  eq([r._status, r.code], [400, 'NEED_LEVEL']);
  const h = await mustOk('novo', { action: 'hub' });
  eq(h.me.needLevel, true);
});

let soloId;
await t('Quiz solo: começa na hora e a sala NÃO mostra o gabarito', async () => {
  const r = await mustOk('ana', { action: 'create', game: 'quiz', mode: 'solo', settings: { count: 5 } });
  soloId = r.room.id;
  eq([r.room.status, r.room.phase, r.room.q.n, r.room.q.total], ['playing', 'question', 0, 5]);
  yes(!('answer' in r.room.q), 'gabarito vazou');
  yes(!JSON.stringify(room(soloId)).includes('"answer"'), 'gabarito na sala');
  eq(secret(soloId).questions.length, 5);
  eq(r.room.level, 'A2', 'nível do nivelamento');
});
await t('Quiz solo: responder antes das alternativas aparecerem é recusado', async () => {
  const r = await call('ana', { action: 'answer', roomId: soloId, n: 0, choice: 0 });
  eq(r._status, 400);
});
await t('Quiz solo: responder certo revela na hora e dá pontos pela rapidez', async () => {
  clock = room(soloId).q.startsAt + 2000;
  const right = secret(soloId).questions[0].answer;
  const r = await mustOk('ana', { action: 'answer', roomId: soloId, n: 0, choice: right });
  eq(r.room.phase, 'reveal');
  eq(r.room.reveal.results.ana.ok, true);
  eq(r.room.reveal.results.ana.pts, core.quizPoints(2000, room(soloId).q.ms, 1), 'pontos pela rapidez');
  const dup = await call('ana', { action: 'answer', roomId: soloId, n: 0, choice: right });
  eq(dup._status, 400, 'responder duas vezes');
});
await t('Quiz solo: tempo esgotado sem resposta = 0 e a partida segue sozinha', async () => {
  clock = room(soloId).nextAt;
  await mustOk('ana', { action: 'tick', roomId: soloId });
  eq([room(soloId).phase, room(soloId).q.n], ['question', 1]);
  clock = room(soloId).nextAt;
  const late = await call('ana', { action: 'answer', roomId: soloId, n: 1, choice: 0 });
  eq(late._status, 400, 'resposta atrasada');
  await mustOk('ana', { action: 'tick', roomId: soloId });
  eq(room(soloId).reveal.results.ana.ok, false);
});
await t('Quiz solo: termina, paga XP (sem FR$) e grava no histórico', async () => {
  const xp0 = store.get('users/ana').gamification.xp;
  for (let n = 2; n < 5; n++) {
    clock = room(soloId).nextAt; await mustOk('ana', { action: 'tick', roomId: soloId });
    clock = room(soloId).q.startsAt + 100;
    await mustOk('ana', { action: 'answer', roomId: soloId, n, choice: secret(soloId).questions[n].answer });
  }
  clock = room(soloId).nextAt; await mustOk('ana', { action: 'tick', roomId: soloId });
  const r = room(soloId);
  eq([r.status, r.paid, r.afterDone], ['finished', true, true]);
  eq(r.rewards.ana.xp, 4 * 2 + 10);
  eq(store.get('users/ana').gamification.xp, xp0 + 18);
  eq(store.get('users/ana').gamification.frBalance, 5, 'solo não dá FR$');
  const h = store.get(`history/game_${soloId}_ana`);
  eq([h.type, h.theme, h.xpGained], ['game', 'Games', 18]);
  eq(store.get('game_players/ana').quiz.played, 1);
  eq(store.get('game_players/ana').currentRoom, null);
});
await t('Tick repetido depois do fim não paga duas vezes', async () => {
  const xp = store.get('users/ana').gamification.xp;
  await mustOk('ana', { action: 'tick', roomId: soloId });
  await mustOk('ana', { action: 'tick', roomId: soloId });
  eq(store.get('users/ana').gamification.xp, xp);
});

let partyId, partyCode;
await t('Modo professor: cria sala sem jogar, com código', async () => {
  const r = await mustOk('prof', { action: 'create', game: 'quiz', mode: 'party', hostPlays: false, level: 'B1', settings: { count: 5, cats: ['grammar', 'vocabulary'] } });
  partyId = r.room.id; partyCode = r.room.code;
  eq(Object.keys(r.room.players), [], 'professor não é jogador');
  eq(r.room.code.length, 5);
  eq(r.room.settings.cats, ['grammar', 'vocabulary']);
});
await t('Entrar com código (minúsculo e com espaço também funciona)', async () => {
  await mustOk('bia', { action: 'join', code: partyCode.toLowerCase().split('').join(' ') });
  await mustOk('caio', { action: 'join', code: partyCode });
  eq(Object.keys(room(partyId).players).sort(), ['bia', 'caio']);
  const bad = await call('duda', { action: 'join', code: 'ZZZZZ' });
  eq(bad._status, 404);
});
await t('Só o host começa e muda ajustes', async () => {
  const r = await call('bia', { action: 'start', roomId: partyId });
  eq(r._status, 400);
  const s = await call('bia', { action: 'settings', roomId: partyId, settings: { count: 15 } });
  eq(s._status, 400);
});
await t('Host pode tirar alguém da sala, e essa pessoa não volta', async () => {
  await mustOk('duda', { action: 'join', code: partyCode });
  await mustOk('prof', { action: 'kick', roomId: partyId, uid: 'duda' });
  yes(!room(partyId).players.duda);
  const back = await call('duda', { action: 'join', code: partyCode });
  eq(back._status, 400);
});
await t('Partida em grupo: perguntas do nível da sala, revela quando todos respondem', async () => {
  await mustOk('prof', { action: 'start', roomId: partyId });
  const r = room(partyId);
  eq([r.status, r.q.total], ['playing', 5]);
  yes(secret(partyId).questions.every((q) => ['grammar', 'vocabulary'].includes(q.cat)), 'categoria errada');
  clock = r.q.startsAt + 1000; beat(partyId, 'bia', 'caio', 'prof');
  const ans = secret(partyId).questions[0].answer;
  const a1 = await mustOk('bia', { action: 'answer', roomId: partyId, n: 0, choice: ans });
  yes(!a1.room, 'ainda falta o Caio');
  eq(room(partyId).answered, { bia: true });
  clock += 3000;
  const a2 = await mustOk('caio', { action: 'answer', roomId: partyId, n: 0, choice: (ans + 1) % 4 });
  eq(a2.room.phase, 'reveal');
  eq(a2.room.reveal.dist.reduce((a, b) => a + b, 0), 2);
  yes(room(partyId).players.bia.score > 0 && room(partyId).players.caio.score === 0);
});
await t('Partida em grupo: pódio paga por colocação, professor não ganha', async () => {
  const prof0 = store.get('users/prof').gamification.xp;
  for (let n = 1; n < 5; n++) {
    clock = room(partyId).nextAt; beat(partyId, 'bia', 'caio', 'prof'); await mustOk('caio', { action: 'tick', roomId: partyId });
    clock = room(partyId).q.startsAt + 500;
    await mustOk('bia', { action: 'answer', roomId: partyId, n, choice: secret(partyId).questions[n].answer });
    await mustOk('caio', { action: 'answer', roomId: partyId, n, choice: secret(partyId).questions[n].answer });
  }
  clock = room(partyId).nextAt; await mustOk('bia', { action: 'tick', roomId: partyId });
  const r = room(partyId);
  eq(r.status, 'finished');
  eq(r.standings[0].uid, 'bia');
  eq([r.rewards.bia.place, r.rewards.caio.place], [1, 2]);
  eq(r.rewards.bia.xp, 40 + 5 * 2);
  eq(store.get('users/prof').gamification.xp, prof0);
  yes(!r.rewards.prof);
});
await t('Jogar de novo: a revanche é uma sala só para todos', async () => {
  const a = await mustOk('bia', { action: 'again', roomId: partyId });
  const b = await mustOk('caio', { action: 'again', roomId: partyId });
  eq(a.room.id, b.room.id);
  eq(Object.keys(room(a.room.id).players).sort(), ['bia', 'caio']);
});

let quickId;
await t('Partida rápida: o 1º cria sala pública, o 2º entra nela', async () => {
  const a = await mustOk('ana', { action: 'quick', game: 'draw' });
  eq(a.matched, false);
  quickId = a.room.id;
  const b = await mustOk('duda', { action: 'quick', game: 'draw' });
  eq([b.matched, b.room.id], [true, quickId]);
  yes(room(quickId).autoStart, 'contagem para começar');
});
await t('Partida rápida: começa sozinha 20s depois', async () => {
  clock = room(quickId).nextAt - 1000;
  await mustOk('ana', { action: 'tick', roomId: quickId });
  eq(room(quickId).status, 'lobby', 'cedo demais');
  clock += 1000;
  await mustOk('ana', { action: 'tick', roomId: quickId });
  eq([room(quickId).status, room(quickId).phase], ['playing', 'choose']);
});

let drawId, drawCode;
await t('Draw It!: sala com 3, só quem desenha vê as opções', async () => {
  const a = await mustOk('ana', { action: 'create', game: 'draw', mode: 'party', settings: { rounds: 1, drawMs: 60000 } });
  drawId = a.room.id; drawCode = a.room.code;
  await mustOk('bia', { action: 'join', code: drawCode });
  await mustOk('caio', { action: 'join', code: drawCode });
  const st = await call('bia', { action: 'start', roomId: drawId });
  eq(st._status, 400, 'só host começa');
  await mustOk('ana', { action: 'start', roomId: drawId });
  const r = room(drawId);
  eq(r.phase, 'choose');
  const drawer = r.drawer;
  const other = ['ana', 'bia', 'caio'].find((u) => u !== drawer);
  const p = await mustOk(drawer, { action: 'peek', roomId: drawId });
  eq(p.choices.length, 3);
  yes(p.choices.every((c) => c.pt), 'tradução para quem desenha');
  const no = await call(other, { action: 'peek', roomId: drawId });
  eq(no._status, 400);
});
await t('Draw It!: a palavra não aparece na sala, só a máscara', async () => {
  const r0 = room(drawId);
  const res = await mustOk(r0.drawer, { action: 'pick', roomId: drawId, idx: 1, turn: r0.turn });
  const r = room(drawId);
  eq(r.phase, 'draw');
  yes(!JSON.stringify(r).toLowerCase().includes(`"${res.word.w}"`), 'palavra vazou na sala');
  eq(r.mask.filter((x) => x === null).length, res.word.w.replace(/[^a-z]/gi, '').length);
});
await t('Draw It!: palpite errado fica só com quem digitou ("quase" também)', async () => {
  const r = room(drawId);
  const word = secret(drawId).word.w;
  const g = ['ana', 'bia', 'caio'].filter((u) => u !== r.drawer);
  beat(drawId, 'ana', 'bia', 'caio');
  const wrong = await mustOk(g[0], { action: 'guess', roomId: drawId, text: 'zzzz' });
  eq(wrong.result.ok, false);
  yes(!JSON.stringify(room(drawId)).includes('zzzz'), 'palpite errado foi para a sala');
  clock += 1000;
  const typo = word.length >= 4 ? word.slice(0, -1) + (word.endsWith('x') ? 'y' : 'x') : null;
  if (typo) { const c = await mustOk(g[0], { action: 'guess', roomId: drawId, text: typo }); yes(c.result.close || c.result.ok, 'quase'); }
  clock += 1000;
  const fast = await mustOk(g[0], { action: 'guess', roomId: drawId, text: 'aaaa' });
  const faster = await mustOk(g[0], { action: 'guess', roomId: drawId, text: 'bbbb' });
  yes(faster.result.slow, 'limite de palpites por segundo');
});
await t('Draw It!: acertar dá pontos (1º mais), quem desenha ganha por acerto', async () => {
  const r = room(drawId);
  const word = secret(drawId).word.w;
  const g = ['ana', 'bia', 'caio'].filter((u) => u !== r.drawer);
  clock += 2000;
  const a = await mustOk(g[0], { action: 'guess', roomId: drawId, text: word.toUpperCase() });
  eq([a.result.ok, a.result.pts], [true, 100]);
  eq(room(drawId).feed.slice(-1)[0].k, 'guess');
  clock += 1000;
  const again = await mustOk(g[0], { action: 'guess', roomId: drawId, text: word });
  yes(again.result.already);
  clock += 1000;
  const b = await mustOk(g[1], { action: 'guess', roomId: drawId, text: word });
  eq(b.result.pts, 90);
  const after = room(drawId);
  eq(after.phase, 'turnEnd', 'todos acertaram: vez acaba');
  eq(after.players[r.drawer].score, 60);
  eq(after.turnResult.word, word);
});
await t('Draw It!: denúncia da maioria apaga a vez e quem desenhou não pontua', async () => {
  clock = room(drawId).nextAt; beat(drawId, 'ana', 'bia', 'caio');
  await mustOk('ana', { action: 'tick', roomId: drawId });
  const r = room(drawId);
  eq(r.phase, 'choose');
  await mustOk(r.drawer, { action: 'pick', roomId: drawId, idx: 0, turn: r.turn });
  const g = ['ana', 'bia', 'caio'].filter((u) => u !== r.drawer);
  const rep = await mustOk(g[0], { action: 'report', roomId: drawId });
  eq(rep.result.removed, true, '1 de 2 adivinhadores já é metade');
  eq(room(drawId).turnResult.reason, 'reported');
  const saved = [...store.entries()].filter(([k]) => k.startsWith('game_reports/'));
  eq(saved.length, 1);
  eq(saved[0][1].strokesPath, `game_rooms/${drawId}/strokes`);
});
await t('Draw It!: quem desenha cai → a vez passa sem esperar o relógio', async () => {
  clock = room(drawId).nextAt; beat(drawId, 'ana', 'bia', 'caio');
  await mustOk('ana', { action: 'tick', roomId: drawId });
  const r = room(drawId);
  eq(r.phase, 'choose');
  const drawer = r.drawer;
  const others = ['ana', 'bia', 'caio'].filter((u) => u !== drawer);
  clock += 45000; beat(drawId, ...others); // quem desenha parou de mandar sinal
  await mustOk(others[0], { action: 'tick', roomId: drawId });
  eq(room(drawId).turnResult.reason, 'drawer_left');
});
await t('Draw It!: termina a rodada e paga quem participou', async () => {
  let guard = 0;
  while (room(drawId).status === 'playing' && guard++ < 20) {
    clock = (room(drawId).nextAt || clock) + 10; beat(drawId, 'ana', 'bia', 'caio');
    await mustOk('ana', { action: 'tick', roomId: drawId });
  }
  const r = room(drawId);
  eq(r.status, 'finished');
  yes(r.paid && r.afterDone);
  yes(Object.values(r.rewards).every((x) => x.xp > 0));
});
await t('Lobby: host sai e outro vira host; sala vazia fecha', async () => {
  const a = await mustOk('ana', { action: 'create', game: 'draw', mode: 'party' });
  await mustOk('bia', { action: 'join', code: a.room.code });
  await mustOk('ana', { action: 'leave', roomId: a.room.id });
  eq(room(a.room.id).hostId, 'bia');
  await mustOk('bia', { action: 'leave', roomId: a.room.id });
  eq(room(a.room.id).status, 'closed');
});
await t('Draw It!: sala lotada (8) recusa o 9º', async () => {
  for (let i = 0; i < 9; i++) user('x' + i, '@x' + i);
  const a = await mustOk('x0', { action: 'create', game: 'draw', mode: 'party' });
  for (let i = 1; i < 8; i++) await mustOk('x' + i, { action: 'join', code: a.room.code });
  const r = await call('x8', { action: 'join', code: a.room.code });
  eq([r._status, r.error], [400, 'A sala está cheia.']);
});
await t('Convite chega para o colega (documento só dele)', async () => {
  const a = await mustOk('ana', { action: 'create', game: 'quiz', mode: 'party' });
  await mustOk('ana', { action: 'invite', roomId: a.room.id, to: 'caio' });
  const inv = store.get(`game_invites/caio_${a.room.id}`);
  eq([inv.to, inv.code, inv.from.username], ['caio', a.room.code, '@ana']);
  const self = await call('ana', { action: 'invite', roomId: a.room.id, to: 'ana' });
  eq(self._status, 400);
});
await t('Hub mostra a partida em andamento e salas públicas abertas', async () => {
  const a = await mustOk('caio', { action: 'quick', game: 'quiz' });
  const h = await mustOk('caio', { action: 'hub' });
  eq(h.current.id, a.room.id);
  const h2 = await mustOk('bia', { action: 'hub' });
  yes(h2.open.quiz >= 1);
});
await t('Teto diário de XP dos games vale entre partidas', async () => {
  user('farm', '@farm');
  for (let k = 0; k < 15; k++) {
    const r = await mustOk('farm', { action: 'create', game: 'quiz', mode: 'solo', settings: { count: 15 } });
    for (let n = 0; n < 15; n++) {
      clock = room(r.room.id).q.startsAt + 10;
      await mustOk('farm', { action: 'answer', roomId: r.room.id, n, choice: secret(r.room.id).questions[n].answer });
      clock = room(r.room.id).nextAt; await mustOk('farm', { action: 'tick', roomId: r.room.id });
    }
  }
  eq(store.get('game_players/farm').daily.xp, 200);
  eq(store.get('users/farm').gamification.xp, 100 + 200);
});

console.log(`\n${ok} ok, ${fail} falha(s)\n`);
process.exit(fail ? 1 : 0);
