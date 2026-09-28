// ============================================================
// Testes do Duelo da Roleta (sem rede, sem IA, sem Firebase real).
// Roda com:  node test-duel.mjs
//
// 1) Banco fixo: formato, quantidade, ids.
// 2) Regras puras (lib/duel-core): centenas de partidas simuladas.
// 3) A function duel.js inteira contra um Firestore FALSO em memória:
//    convite, aposta, partida completa, prêmios, prazos, ajudas.
// ============================================================

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

const core = require('./netlify/functions/lib/duel-core.js');
const bank = require('./netlify/functions/lib/duel-bank.js');

// ── 1) Banco fixo ────────────────────────────────────────────
console.log('\n── Banco de perguntas ──');
{
  const all = bank.allStatic();
  check('650 perguntas no banco fixo', all.length === 650, `(${all.length})`);
  check('Ids únicos', new Set(all.map(q => q.id)).size === all.length);
  const bad = all.filter(q => core.validateItem(q, q.cat, q.level).length);
  check('Todas passam na validação', bad.length === 0, bad.slice(0, 5).map(q => `${q.id}:${core.validateItem(q, q.cat, q.level)}`).join(' '));
  let buckets = true;
  for (const c of core.CATEGORIES) for (const l of core.LEVELS) if (bank.staticPool(c, l).length !== (c === 'everyday' ? 30 : 20)) buckets = false;
  check('20 perguntas por categoria × nível (30 em Dia a dia, que inclui trabalho)', buckets);
  check('Business virou Viagem', !core.CATEGORIES.includes('business') && core.CATEGORIES.includes('travel'));
  const noRegra = all.filter(q => /regra de ouro|dica de ouro/i.test(q.explain));
  check('Nenhuma explicação com "Regra/Dica de ouro"', noRegra.length === 0);
}

// ── 2) Regras puras ──────────────────────────────────────────
console.log('\n── Regras do jogo ──');
{
  const A = 'a', B = 'b';
  const mk = () => core.newDuel({ id: 'x', creator: A, opponent: B, info: { a: { level: 'B1' }, b: { level: 'A2' } }, stake: 0, now: 0 });
  const d = mk();
  check('Duelo nasce como convite', d.status === 'invited' && d.deadline === core.INVITE_MS);
  core.accept(d, 1000);
  check('Ao aceitar, quem convidou começa girando', d.status === 'active' && d.turn === A && d.phase === 'spin');
  check('Roleta tem 7 fatias (6 categorias + coroa)', core.WHEEL.length === 7 && core.WHEEL[6] === 'crown');

  const pub = { id: 'q1', q: 'Q?', options: ['a', 'b', 'c', 'd'] };
  core.setQuestion(d, { kind: 'normal', cat: 'grammar', level: 'B1', pub, now: 2000 });
  check('Pergunta de grammar tem 25s + folga', d.question.deadline === 2000 + 25000 + core.GRACE_MS);
  let ev = core.applyAnswer(d, A, { ok: true, choice: 0, correctIndex: 0, explain: 'x', qid: 'q1' }, 3000);
  check('Acerto enche 1/3 do medidor e continua a vez', ev === 'correct' && d.meter[A] === 1 && d.turn === A && d.phase === 'spin');
  core.setQuestion(d, { kind: 'normal', cat: 'reading', level: 'B1', pub, now: 4000 });
  check('Reading ganha 40s', d.question.limitMs === core.LONG_ANSWER_MS);
  core.applyAnswer(d, A, { ok: true }, 5000);
  core.setQuestion(d, { kind: 'normal', cat: 'vocabulary', level: 'B1', pub, now: 6000 });
  ev = core.applyAnswer(d, A, { ok: true }, 7000);
  check('3 acertos → escolher categoria da coroa', ev === 'meter_full' && d.phase === 'crown_pick' && d.crownSource === 'meter');
  check('Não pode escolher coroa inexistente', core.applyCrownPick(d, A, 'math') === false);
  check('Escolher coroa zera o medidor', core.applyCrownPick(d, A, 'grammar') && d.meter[A] === 0);
  core.setQuestion(d, { kind: 'crown', cat: 'grammar', level: 'B1', pub, now: 8000 });
  ev = core.applyAnswer(d, A, { ok: true }, 9000);
  check('Acertou a da coroa → ganha a coroa e segue', ev === 'crown' && d.crowns[A].includes('grammar') && d.turn === A);
  check('Coroa conquistada some das opções', !core.availableCrowns(d, A).includes('grammar'));
  core.setQuestion(d, { kind: 'normal', cat: 'business', level: 'B1', pub, now: 10000 });
  ev = core.applyAnswer(d, A, { ok: false, choice: 2, correctIndex: 1 }, 11000);
  check('Errou → a vez passa', ev === 'wrong' && d.turn === B && d.turns[A] === 1 && d.phase === 'spin');
  check('Log registra as jogadas', d.log.length === 5 && d.log[4].ok === false);

  // Fatia coroa: não mexe no medidor
  const r = core.applySpin(d, B, 6, 12000);
  check('Fatia "Coroa" vai direto para a escolha', r.kind === 'crown_pick' && d.crownSource === 'wheel');
  d.meter[B] = 2; core.applyCrownPick(d, B, 'listening');
  check('Coroa pela roleta mantém o medidor', d.meter[B] === 2);

  // Prazos
  core.setQuestion(d, { kind: 'crown', cat: 'listening', level: 'A2', pub, now: 13000 });
  let h = core.sweep(d, d.question.deadline + 1);
  check('Pergunta vencida conta como erro e passa a vez', h.includes('question_timeout') && d.turn === A && d.lastResult.choice === -1);
  h = core.sweep(d, d.turnDeadline + 1);
  check('48h sem jogar → W.O.', h.includes('turn_timeout') && d.status === 'finished' && d.winner === B && d.endReason === 'timeout');

  const inv = mk();
  check('Convite vencido expira', core.sweep(inv, core.INVITE_MS + 1).includes('expired') && inv.status === 'expired');

  // 6 coroas = vitória imediata
  const w = mk(); core.accept(w, 0);
  w.crowns[A] = ['grammar', 'vocabulary', 'reading', 'listening', 'business'];
  core.setQuestion(w, { kind: 'crown', cat: 'everyday', level: 'B1', pub, now: 1 });
  ev = core.applyAnswer(w, A, { ok: true }, 2);
  check('6ª coroa encerra o duelo na hora', ev === 'win' && w.status === 'finished' && w.winner === A && w.endReason === 'crowns');

  // Limite de vezes
  const t = mk(); core.accept(t, 0);
  for (let i = 0; i < core.MAX_TURNS * 2; i++) {
    core.setQuestion(t, { kind: 'normal', cat: 'grammar', level: 'B1', pub, now: i });
    core.applyAnswer(t, t.turn, { ok: false }, i);
  }
  check(`Depois de ${core.MAX_TURNS} vezes de cada um, acaba`, t.status === 'finished' && t.endReason === 'turns' && t.winner === null);

  // Simulação em massa: toda partida termina, invariantes valem.
  let ok = true, reasons = {};
  for (let g = 0; g < 500; g++) {
    const x = mk(); core.accept(x, 0);
    let steps = 0;
    while (x.status === 'active' && steps++ < 5000) {
      const u = x.turn;
      if (x.phase === 'spin') {
        const res = core.applySpin(x, u, core.spinSlot(), steps);
        if (res.kind === 'question') core.setQuestion(x, { kind: 'normal', cat: res.cat, level: 'B1', pub, now: steps });
      } else if (x.phase === 'crown_pick') {
        const av = core.availableCrowns(x, u);
        const c = av[Math.floor(Math.random() * av.length)];
        core.applyCrownPick(x, u, c);
        core.setQuestion(x, { kind: 'crown', cat: c, level: 'B1', pub, now: steps });
      } else {
        core.applyAnswer(x, u, { ok: Math.random() < 0.75 }, steps);
      }
      if (x.crowns.a.length > 6 || x.crowns.b.length > 6 || x.meter.a > 3 || x.turns.a > core.MAX_TURNS) ok = false;
    }
    if (x.status !== 'finished') ok = false;
    reasons[x.endReason] = (reasons[x.endReason] || 0) + 1;
  }
  check('500 partidas simuladas terminam sem quebrar regra', ok, JSON.stringify(reasons));
  console.log(`     (fins: ${JSON.stringify(reasons)})`);

  // Prêmios
  const f = mk(); core.accept(f, 0); f.stake = 2; f.crowns.a = ['grammar', 'reading']; f.answered = { a: 10, b: 8 };
  core.finish(f, A, 'turns', 1);
  let rw = core.rewardsFor(f);
  check('Vencedor: 50 XP + 5/coroa, FR$0,50, +30 troféus, pote 2×aposta', rw.a.xp === 60 && rw.a.fr === 0.5 && rw.a.trophies === 30 && rw.a.pot === 4);
  check('Perdedor: 15 XP, FR$0,10, −10 troféus, sem pote', rw.b.xp === 15 && rw.b.fr === 0.1 && rw.b.trophies === -10 && rw.b.pot === 0);
  const wo = mk(); core.accept(wo, 0); wo.answered = { a: 5, b: 0 };
  core.finish(wo, A, 'timeout', 1);
  rw = core.rewardsFor(wo);
  check('W.O. contra quem nem jogou: troféus sim, XP não', rw.a.xp === 0 && rw.a.trophies === 30 && rw.b.trophies === core.TROPHIES.forfeitLoss);
  const dr = mk(); core.accept(dr, 0); dr.stake = 1; core.finish(dr, null, 'turns', 1);
  rw = core.rewardsFor(dr);
  check('Empate devolve a aposta de cada um', rw.a.pot === 1 && rw.b.pot === 1 && rw.a.result === 'draw');

  let cap = core.applyDailyCap(null, { xp: 150, fr: 1.5 }, 0);
  cap = core.applyDailyCap(cap.daily, { xp: 150, fr: 1.5 }, 1000);
  check('Teto diário corta XP e FR$', cap.xp === 50 && cap.fr === 0.5 && cap.capped);
  cap = core.applyDailyCap(cap.daily, { xp: 50, fr: 0.5 }, 86400000 * 2);
  check('Teto zera no dia seguinte', cap.xp === 50 && !cap.capped);

  // Nível
  check('Nível = média do nivelamento (para baixo)', core.levelFrom({ placementResults: { grammar: { level: 'B2' }, reading: { level: 'B1' } } }).level === 'B1');
  check('Sem nivelamento usa a escolha do aluno', core.levelFrom({}, 'A2').level === 'A2' && core.levelFrom({}, 'A2').source === 'choice');
  check('Sem nada → pede o nível', core.levelFrom({}, null).level === null);
  check('Ligas por troféus', core.leagueFor(0).id === 'bronze' && core.leagueFor(450).id === 'ouro' && core.leagueFor(9999).id === 'lenda');

  // Sorteio
  const pool = bank.staticPool('grammar', 'A1');
  let seen = [];
  for (let i = 0; i < 20; i++) seen = core.markSeen(seen, core.pickQuestion(pool, seen).item.id);
  check('20 sorteios seguidos não repetem pergunta', new Set(seen).size === 20);
  const again = core.pickQuestion(pool, seen);
  check('Banco esgotado → reaproveita as vistas há mais tempo', seen.slice(0, 7).includes(again.item.id) && again.unseenLeft === 0);
  const sh = core.shuffleItem(pool[0]);
  check('Embaralhar mantém a correta', sh.pub.options[sh.answer] === pool[0].options[pool[0].answer]);
  check('Pergunta pública não leva gabarito', !('answer' in sh.pub) && !('explain' in sh.pub));
  const ff = core.fiftyFifty(2);
  check('50/50 tira 2 erradas e nunca a certa', ff.length === 2 && !ff.includes(2));
}

// ── Paridade roleta front x servidor ─────────────────────────
console.log('\n── Paridade front × servidor ──');
{
  execSync('npx esbuild duelConfig.ts --bundle --format=cjs --platform=node --outfile=/tmp/duel-parity.cjs --log-level=error');
  const front = require('/tmp/duel-parity.cjs');
  check('Fatias da roleta na mesma ordem', JSON.stringify(front.WHEEL) === JSON.stringify(core.WHEEL));
  check('Mesmas apostas', JSON.stringify(front.STAKES) === JSON.stringify(core.STAKES));
  check('Mesmas ligas', JSON.stringify(front.LEAGUES.map(l => [l.id, l.min])) === JSON.stringify(core.LEAGUES.map(l => [l.id, l.min])));
  check('Mesmo limite de vezes e coroas', front.MAX_TURNS === core.MAX_TURNS && front.CROWNS_TO_WIN === core.CROWNS_TO_WIN);
}

// ── 3) Function inteira contra Firestore falso ───────────────
console.log('\n── Function duel.js (Firestore em memória) ──');
{
  const store = new Map(); // "col/id" -> objeto
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const docRef = (col, id) => ({
    id, path: `${col}/${id}`,
    get: async () => snapOf(col, id),
    set: async (data, opts) => write(col, id, data, opts),
    delete: async () => { store.delete(`${col}/${id}`); },
  });
  const snapOf = (col, id) => {
    const v = store.get(`${col}/${id}`);
    return { exists: v !== undefined, id, data: () => clone(v), ref: docRef(col, id) };
  };
  const write = (col, id, data, opts) => {
    const k = `${col}/${id}`;
    store.set(k, opts && opts.merge ? { ...(store.get(k) || {}), ...clone(data) } : clone(data));
  };
  const collection = (col) => ({
    doc: (id) => docRef(col, id),
    get: async () => ({ docs: [...store.keys()].filter(k => k.startsWith(col + '/')).map(k => snapOf(col, k.slice(col.length + 1))) }),
    where: (field, op, val) => ({
      get: async () => ({
        docs: [...store.entries()]
          .filter(([k, v]) => k.startsWith(col + '/') && op === 'array-contains' && Array.isArray(v[field]) && v[field].includes(val))
          .map(([k]) => snapOf(col, k.slice(col.length + 1))),
      }),
    }),
  });
  const db = {
    collection,
    runTransaction: async (fn) => {
      const pending = [];
      const tx = {
        get: async (ref) => { if (pending.length) throw new Error('leitura depois de escrita na transação'); return ref.get(); },
        set: (ref, data, opts) => pending.push(() => write(...ref.path.split('/'), data, opts)),
        delete: (ref) => pending.push(() => store.delete(ref.path)),
      };
      const r = await fn(tx);
      pending.forEach(p => p());
      return r;
    },
  };
  // Troca os módulos do firebase-admin pelos falsos ANTES de carregar a function.
  const fake = (name, exp) => { const p = require.resolve(name); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; };
  fake('firebase-admin/app', { initializeApp: () => {}, getApps: () => [1], cert: () => ({}) });
  fake('firebase-admin/firestore', { getFirestore: () => db });
  fake('firebase-admin/auth', { getAuth: () => ({ verifyIdToken: async (t) => ({ uid: t }) }) });
  process.env.FIREBASE_PROJECT_ID = 'x'; process.env.FIREBASE_CLIENT_EMAIL = 'x'; process.env.FIREBASE_PRIVATE_KEY = 'x';
  delete process.env.URL; delete process.env.DEPLOY_PRIME_URL; delete process.env.DEPLOY_URL;
  const { handler } = require('./netlify/functions/duel.js');

  const call = async (uid, body) => {
    const r = await handler({ httpMethod: 'POST', headers: { origin: 'https://freedom.app.br', authorization: `Bearer ${uid}` }, body: JSON.stringify(body) });
    return { status: r.statusCode, ...JSON.parse(r.body) };
  };
  const user = (uid, extra = {}) => write('users', uid, {
    userId: uid, username: `@${uid}`, fullName: uid.toUpperCase(),
    gamification: { xp: 1000, frBalance: 10, weeklyXp: 0, monthlyXp: 0, yearlyXp: 0, placementResults: { grammar: { level: 'B1' } }, lastLoginDate: '2026-09-27' },
    ...extra,
  });
  user('ana'); user('bia'); user('caio', { gamification: { xp: 0, frBalance: 0 } });
  user('dani', { accessStatus: 'blocked' });
  const bal = (u) => store.get(`users/${u}`).gamification.frBalance;
  const xp = (u) => store.get(`users/${u}`).gamification.xp;

  let r = await call('ana', { action: 'hub' });
  check('hub responde com perfil e lista vazia', r.status === 200 && r.me.level === 'B1' && r.duels.length === 0 && r.me.trophies === 0);
  r = await call('caio', { action: 'hub' });
  check('Aluno sem nivelamento → needLevel', r.me.needLevel === true);
  r = await call('caio', { action: 'create', opponentId: 'ana', stake: 0 });
  check('Sem nível não cria duelo (NEED_LEVEL)', r.status === 400 && r.code === 'NEED_LEVEL');
  r = await call('caio', { action: 'setLevel', level: 'A2' });
  check('"Qual seu nível?" grava a escolha', r.me.level === 'A2' && r.me.levelSource === 'choice');
  r = await call('ana', { action: 'setLevel', level: 'A1' });
  check('Quem tem nivelamento não troca o nível na mão', r.status === 400);
  r = await call('dani', { action: 'hub' });
  check('Conta bloqueada não joga', r.status === 403);
  r = await call('ana', { action: 'search', q: 'bi' });
  check('Busca acha pelo @', r.players.length === 1 && r.players[0].uid === 'bia' && !('gamification' in r.players[0]));
  r = await call('ana', { action: 'search', q: 'dani' });
  check('Busca não mostra conta bloqueada', r.players.length === 0);

  r = await call('ana', { action: 'create', opponentId: 'bia', stake: 3 });
  check('Aposta fora da lista é recusada', r.status === 400);
  r = await call('caio', { action: 'create', opponentId: 'ana', stake: 5 });
  check('Aposta sem saldo é recusada', r.status === 400 && /Saldo/.test(r.error));
  r = await call('ana', { action: 'create', opponentId: 'bia', stake: 5 });
  const duelId = r.duel?.id;
  check('Convite com aposta criado e FR$ reservado', r.status === 200 && r.duel.status === 'invited' && bal('ana') === 5);
  r = await call('ana', { action: 'create', opponentId: 'bia', stake: 0 });
  check('Não abre 2 duelos com a mesma pessoa', r.status === 409 && r.duelId === duelId);
  r = await call('ana', { action: 'spin', duelId });
  check('Não gira antes do aceite', r.status === 409);
  r = await call('bia', { action: 'respond', duelId, accept: true });
  check('Aceite cobra a aposta de quem aceitou e começa', r.duel.status === 'active' && bal('bia') === 5 && r.duel.turn === 'ana');
  r = await call('bia', { action: 'spin', duelId });
  check('Fora da vez não gira', r.status === 409);

  // Joga a partida inteira: "Ana" sempre acerta (lê o gabarito no banco falso), "Bia" sempre erra.
  let guard = 0, sawQuestion = null, leaked = false, events = new Set();
  let d = store.get(`duels/${duelId}`);
  while (d.status === 'active' && guard++ < 400) {
    const u = d.turn;
    if (d.phase === 'spin') { r = await call(u, { action: 'spin', duelId }); if (r.duel.question && JSON.stringify(r).includes('"answer"')) leaked = true; }
    else if (d.phase === 'crown_pick') {
      const cat = core.availableCrowns(d, u)[0];
      r = await call(u, { action: 'pickCrown', duelId, cat });
    } else {
      const sec = store.get(`duel_secrets/${duelId}`);
      sawQuestion = sawQuestion || d.question;
      const choice = u === 'ana' ? sec.answer : (sec.answer + 1) % 4;
      r = await call(u, { action: 'answer', duelId, n: d.question.n, choice });
      events.add(r.event);
      if (u === 'ana' && !r.result.ok) leaked = true;
    }
    if (r.status !== 200) { console.log('     erro inesperado:', r); break; }
    d = store.get(`duels/${duelId}`);
  }
  check('Partida completa termina com Ana vencendo por 6 coroas', d.status === 'finished' && d.winner === 'ana' && d.endReason === 'crowns', `${d.status} ${d.endReason}`);
  check('Resposta do servidor nunca traz o gabarito antes da resposta', !leaked);
  check('Passou por acerto, medidor cheio e coroa', events.has('correct') && events.has('meter_full') && events.has('crown'));
  check('Pergunta pública tem 4 alternativas', sawQuestion && sawQuestion.options.length === 4);
  const rw = d.rewards;
  check('Vencedora leva o pote (FR$10) + prêmio', bal('ana') === core.round2(5 + 10 + rw.ana.fr) && rw.ana.pot === 10);
  check('Perdedora fica sem a aposta e ganha o prêmio de participação', bal('bia') === core.round2(5 + rw.bia.fr) && rw.bia.result === 'loss');
  check('XP entrou no perfil (dentro do teto de 200)', xp('ana') === 1000 + rw.ana.xp && rw.ana.xp > 0 && rw.ana.xp <= 200);
  check('XP entrou no ranking semanal', store.get('users/ana').gamification.weeklyXp === rw.ana.xp);
  const hist = [...store.entries()].filter(([k, v]) => k.startsWith('history/') && v.type === 'duel');
  check('Histórico (Hall da Fama) recebe o duelo', hist.length === 2 && hist.every(([, v]) => v.xpGained > 0));
  const pa = store.get('duel_players/ana'), pb = store.get('duel_players/bia');
  check('Estatísticas: vitória, sequência e troféus', pa.wins === 1 && pa.streak === 1 && pa.trophies === 30 && pb.losses === 1 && pb.trophies === 0);
  check('Acertos por categoria gravados', Object.values(pa.catStats).reduce((s, v) => s + v.c, 0) === d.correct.ana);
  check('Gabarito apagado ao fim', !store.has(`duel_secrets/${duelId}`));
  check('Histórico com id fixo por duelo+aluno (não duplica)', store.has(`history/duel_${duelId}_ana`) && store.get(`duels/${duelId}`).afterDone === true);
  check('Trava da dupla gravada', store.get(`duel_pairs/${['ana', 'bia'].sort().join('_')}`)?.duelId === duelId);
  const seenA = store.get('duel_seen/ana');
  check('Perguntas vistas registradas', Object.values(seenA.buckets).flat().length === d.answered.ana);

  // Partida "realista": os dois acertam ~60%. Confere que o convidado
  // também pontua e que a vez sempre alterna certo.
  {
    user('eva'); user('fil');
    let r2 = await call('eva', { action: 'create', opponentId: 'fil', stake: 0 });
    const id = r2.duel.id;
    await call('fil', { action: 'respond', duelId: id, accept: true });
    let x = store.get(`duels/${id}`), g = 0, badTurn = false, prevTurn = x.turn;
    while (x.status === 'active' && g++ < 2000) {
      const u = x.turn;
      if (x.phase === 'spin') r2 = await call(u, { action: 'spin', duelId: id });
      else if (x.phase === 'crown_pick') r2 = await call(u, { action: 'pickCrown', duelId: id, cat: core.availableCrowns(x, u)[0] });
      else {
        const sec = store.get(`duel_secrets/${id}`);
        const ok = Math.random() < 0.6;
        r2 = await call(u, { action: 'answer', duelId: id, n: x.question.n, choice: ok ? sec.answer : (sec.answer + 1) % 4 });
        if (!r2.result.ok && r2.duel.status === 'active' && r2.duel.turn === u) badTurn = true;
      }
      if (r2.status !== 200) { console.log('     erro:', r2); break; }
      x = store.get(`duels/${id}`);
    }
    check('Partida 60%×60% termina', x.status === 'finished', `${x.status} ${g}`);
    check('Os dois jogam e a vez passa a cada erro', x.answered.eva > 0 && x.answered.fil > 0 && !badTurn, JSON.stringify(x.correct));
    check('Ninguém passa do limite de vezes', x.turns.eva <= core.MAX_TURNS && x.turns.fil <= core.MAX_TURNS);
  }

  // Recusa, cancelamento e expiração devolvem a aposta
  const before = bal('ana');
  r = await call('ana', { action: 'create', opponentId: 'bia', stake: 1 });
  const d2 = r.duel.id;
  await call('bia', { action: 'respond', duelId: d2, accept: false });
  check('Recusa devolve a aposta', bal('ana') === before && store.get(`duels/${d2}`).status === 'declined');
  r = await call('ana', { action: 'create', opponentId: 'caio', stake: 1 });
  await call('ana', { action: 'cancel', duelId: r.duel.id });
  check('Cancelar convite devolve a aposta', bal('ana') === before);
  r = await call('ana', { action: 'create', opponentId: 'caio', stake: 2 });
  const d3 = r.duel.id;
  const x3 = store.get(`duels/${d3}`); x3.expiresAt = x3.deadline = Date.now() - 1; store.set(`duels/${d3}`, x3);
  r = await call('ana', { action: 'hub' });
  check('Convite vencido expira no hub e devolve a aposta', bal('ana') === before && r.duels.find(x => x.id === d3).status === 'expired');

  // Tempo estourado e ajudas
  r = await call('ana', { action: 'create', opponentId: 'caio', stake: 0 });
  const d4 = r.duel.id;
  await call('caio', { action: 'respond', duelId: d4, accept: true });
  r = await call('ana', { action: 'spin', duelId: d4 });
  while (r.target === 'crown') { r = await call('ana', { action: 'pickCrown', duelId: d4, cat: 'grammar' }); }
  let q4 = store.get(`duels/${d4}`).question;
  check('Relógio da pergunta só começa depois da animação da roleta', r.target === 'crown' || q4.askedAt >= Date.now() + 3000);
  check('Resposta traz a hora do servidor (acerto do cronômetro)', typeof r.serverNow === 'number');
  const oldId = q4.id;
  r = await call('ana', { action: 'help', duelId: d4, kind: 'skip' });
  check('Pular troca a pergunta (mesma categoria)', r.duel.question.id !== oldId && r.duel.question.cat === q4.cat && r.duel.helps.ana.skip === 0);
  r = await call('ana', { action: 'help', duelId: d4, kind: 'skip' });
  check('Cada ajuda só uma vez por duelo', r.status === 400);
  r = await call('ana', { action: 'help', duelId: d4, kind: 'fifty' });
  const sec4 = store.get(`duel_secrets/${d4}`);
  check('50/50 remove duas erradas', r.duel.question.removed.length === 2 && !r.duel.question.removed.includes(sec4.answer));
  q4 = store.get(`duels/${d4}`); q4.question.deadline = Date.now() - 1; q4.deadline = q4.question.deadline; store.set(`duels/${d4}`, q4);
  r = await call('ana', { action: 'answer', duelId: d4, n: q4.question.n, choice: sec4.answer });
  check('Resposta depois do tempo conta como erro (mesmo certa)', r.result.ok === false && r.timedOut === true && r.duel.turn === 'caio');
  r = await call('ana', { action: 'answer', duelId: d4, n: q4.question.n, choice: sec4.answer });
  check('Clique repetido devolve o mesmo resultado (e o evento original)', r.status === 200 && r.repeat === true && r.event === 'wrong');

  // W.O. por abandono
  const x4 = store.get(`duels/${d4}`); x4.turnDeadline = x4.deadline = Date.now() - 1; store.set(`duels/${d4}`, x4);
  r = await call('ana', { action: 'get', duelId: d4 });
  check('48h sem jogar → W.O. para quem esperava', r.duel.status === 'finished' && r.duel.winner === 'ana' && r.duel.endReason === 'timeout');
  check('W.O. contra quem não respondeu nada não rende XP', r.duel.rewards.ana.xp === 0 && r.duel.rewards.ana.trophies === 30);

  // Desistência
  r = await call('bia', { action: 'create', opponentId: 'caio', stake: 1 });
  const d5 = r.duel.id;
  await call('caio', { action: 'setLevel', level: 'A2' });
  write('users', 'caio', { ...store.get('users/caio'), gamification: { ...store.get('users/caio').gamification, frBalance: 3 } });
  await call('caio', { action: 'respond', duelId: d5, accept: true });
  const bBefore = bal('bia');
  r = await call('caio', { action: 'forfeit', duelId: d5 });
  check('Desistir entrega a vitória e o pote ao adversário', r.duel.winner === 'bia' && r.duel.endReason === 'forfeit' && bal('bia') === core.round2(bBefore + 2 + r.duel.rewards.bia.fr));
  r = await call('ana', { action: 'get', duelId: d5 });
  check('Quem não joga o duelo não consegue ver', r.status === 404);
  r = await call('ana', { action: 'report', duelId, qid: 'gr-b1-01', reason: 'duas certas' });
  check('Reportar pergunta grava para o admin', r.ok && [...store.keys()].some(k => k.startsWith('duel_reports/')));
}

console.log(`\n${pass} ok, ${fail} falha(s)\n`);
process.exit(fail ? 1 : 0);
