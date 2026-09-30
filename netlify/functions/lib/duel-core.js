// ============================================================
// FREEDOMAPP — lib/duel-core
// ------------------------------------------------------------
// Regras do "Duelo da Roleta" (modo inspirado no Perguntados).
//
// Este arquivo é PURO: não fala com o Firestore nem com a IA.
// Recebe o estado do duelo, devolve o estado novo. Por quê?
//   1) Dá para testar todas as regras sem internet
//      (test-duel.mjs roda centenas de partidas simuladas).
//   2) Quem decide acerto, coroa, vitória e prêmio é SEMPRE o
//      servidor (function duel.js), que usa este arquivo. O navegador
//      só mostra o que o servidor devolveu — ninguém "forja" coroa.
//
// COMO O JOGO FUNCIONA
//   • 2 jogadores, cada um joga na sua hora (assíncrono).
//   • Na sua vez você gira a roleta: 6 categorias + a fatia "Coroa".
//   • Acertou → enche 1/3 do medidor e gira de novo.
//     Medidor cheio (3 acertos) → você escolhe uma categoria e
//     responde a "pergunta da coroa". Acertou = ganhou a coroa.
//   • A fatia "Coroa" leva direto à pergunta da coroa.
//   • Errou (ou o tempo acabou) → a vez passa para o adversário.
//   • Quem juntar as 6 coroas primeiro vence na hora.
//   • Limite de MAX_TURNS vezes para cada um: acabou, vence quem tem
//     mais coroas; empate em coroas → mais acertos; senão, empate.
//   • 48h sem jogar na sua vez = derrota por W.O.
// ============================================================

const CATEGORIES = ["grammar", "vocabulary", "reading", "listening", "travel", "everyday"];
// A ordem da roleta importa: o front desenha as fatias nesta ordem e
// anima até o índice que o servidor sorteou (paridade testada).
const WHEEL = [...CATEGORIES, "crown"];
const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

const MAX_TURNS = 15;          // vezes por jogador
const CROWNS_TO_WIN = 6;
const METER_MAX = 3;
const ANSWER_MS = 25000;       // tempo para responder
const READING_MS = 60000;      // reading: tem o texto para ler antes (pedido do Matheus, 30/09)
const LISTENING_MS = 40000;    // listening: conta só DEPOIS que o áudio termina
const LONG_ANSWER_MS = READING_MS; // (nome antigo, mantido para compatibilidade)
// Listening: enquanto o aluno não terminou de ouvir o áudio pela 1ª
// vez, o relógio da resposta não corre. Mas não pode ficar parado
// para sempre (senão bastaria nunca apertar o play): esta é a janela
// máxima para ouvir. Passou dela sem ouvir, o relógio começa sozinho.
const LISTEN_WINDOW_MS = 120000;
const GRACE_MS = 5000;         // folga de rede entre clicar e o servidor receber
const TURN_MS = 48 * 3600000;  // prazo para jogar a sua vez
const INVITE_MS = 72 * 3600000;// prazo para aceitar o convite
const STAKES = [0, 1, 2, 5];   // apostas permitidas (FR$ por jogador)
const MAX_OPEN_DUELS = 10;     // convites + partidas em andamento por aluno
const HELPS = { fifty: 1, skip: 1 }; // ajudas grátis por duelo

// Prêmios (antes do teto diário). Referência de valor: um exercício
// completo dá até 100 XP e FR$ 1,00 — um duelo vencido vale mais ou
// menos meio exercício, para o jogo complementar o estudo, não
// substituir.
const REWARDS = {
  win: { xp: 50, fr: 0.5 },
  draw: { xp: 25, fr: 0.25 },
  loss: { xp: 15, fr: 0.1 },
  perCrown: 5,     // XP extra por coroa conquistada (vale para os dois)
};
const DAILY_CAP = { xp: 200, fr: 2 }; // teto do que duelos rendem por dia
const TROPHIES = { win: 30, draw: 10, loss: -10, forfeitLoss: -20 };
const LEAGUES = [
  { id: "bronze", name: "Bronze", min: 0 },
  { id: "prata", name: "Prata", min: 150 },
  { id: "ouro", name: "Ouro", min: 400 },
  { id: "diamante", name: "Diamante", min: 800 },
  { id: "lenda", name: "Lenda", min: 1500 },
];
const SEEN_KEEP = 400;          // quantas perguntas lembrar por categoria/nível
const LOW_STOCK = 6;            // abaixo disso de inéditas, pede mais à IA
const AI_BUCKET_CAP = 240;      // máximo de perguntas de IA por categoria/nível

const other = (d, uid) => (d.players[0] === uid ? d.players[1] : d.players[0]);
const round2 = (n) => Math.round(n * 100) / 100;

// Dia no fuso de São Paulo (mesma convenção do tracker/analytics).
const spDay = (ms) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);

// ── Nível do jogador ─────────────────────────────────────────
// Média dos níveis do nivelamento por habilidade (arredonda para
// baixo, para o duelo não ficar frustrante); sem nivelamento novo,
// usa o legado; sem nada, o nível que o aluno escolheu no duelo.
const levelFrom = (gamification, levelChoice) => {
  const g = gamification || {};
  const res = Object.values(g.placementResults || {})
    .map((r) => LEVELS.indexOf(r && r.level))
    .filter((i) => i >= 0);
  if (res.length) return { level: LEVELS[Math.floor(res.reduce((a, b) => a + b, 0) / res.length)], source: "placement" };
  if (LEVELS.includes(g.lastPlacementLevel)) return { level: g.lastPlacementLevel, source: "placement" };
  if (LEVELS.includes(levelChoice)) return { level: levelChoice, source: "choice" };
  return { level: null, source: null };
};

const leagueFor = (trophies) => {
  let l = LEAGUES[0];
  for (const x of LEAGUES) if ((trophies || 0) >= x.min) l = x;
  return l;
};

// ── Criação ──────────────────────────────────────────────────
const emptyPer = (players, v) => Object.fromEntries(players.map((p) => [p, typeof v === "function" ? v() : v]));

const newDuel = ({ id, creator, opponent, info, stake, now }) => {
  const players = [creator, opponent];
  return {
    id, mode: "roleta", status: "invited", players, info, stake: stake || 0,
    createdAt: now, updatedAt: now, expiresAt: now + INVITE_MS, deadline: now + INVITE_MS,
    turn: null, phase: null, turnDeadline: null, streakInTurn: 0,
    turns: emptyPer(players, 0), crowns: emptyPer(players, () => []), meter: emptyPer(players, 0),
    correct: emptyPer(players, 0), answered: emptyPer(players, 0),
    catStats: emptyPer(players, () => ({})), helps: emptyPer(players, () => ({ ...HELPS })),
    question: null, qSeq: 0, lastResult: null, log: [],
    winner: null, endReason: null, finishedAt: null, rewards: null,
  };
};

const syncDeadline = (d) => {
  if (d.status === "invited") d.deadline = d.expiresAt;
  else if (d.status === "active") d.deadline = d.question ? Math.min(d.question.deadline, d.turnDeadline) : d.turnDeadline;
  else d.deadline = null;
  return d;
};

const startTurn = (d, uid, now) => {
  d.turn = uid;
  d.phase = "spin";
  d.turnDeadline = now + TURN_MS;
  d.streakInTurn = 0;
  d.question = null;
  d.crownSource = null;
  return syncDeadline(d);
};

const accept = (d, now) => {
  d.status = "active";
  d.acceptedAt = now;
  d.updatedAt = now;
  return startTurn(d, d.players[0], now); // quem convidou começa
};

// ── Roleta ───────────────────────────────────────────────────
const spinSlot = (rand = Math.random) => Math.floor(rand() * WHEEL.length) % WHEEL.length;

const answerMsFor = (cat) => (cat === "reading" ? READING_MS : cat === "listening" ? LISTENING_MS : ANSWER_MS);

// Coloca uma pergunta na mesa. `pub` é a versão SEM gabarito.
// `delayMs`: quando a pergunta sai de um giro, a tela ainda passa ~5s
// animando a roleta antes de mostrá-la. O relógio só começa depois,
// senão o aluno perderia esses segundos.
const SPIN_ANIM_MS = 4800;
const setQuestion = (d, { kind, cat, level, pub, now, delayMs = 0 }) => {
  d.qSeq = (d.qSeq || 0) + 1;
  const ms = answerMsFor(cat);
  const start = now + delayMs;
  const waitAudio = cat === "listening";
  d.question = {
    n: d.qSeq, kind, cat, level,
    q: pub.q, options: pub.options, passage: pub.passage || null, audio: pub.audio || null, id: pub.id,
    audioUrl: pub.audioUrl || null,
    askedAt: start, limitMs: ms, removed: [],
    // Listening: o prazo inclui a janela para ouvir; ele é encurtado
    // para "agora + tempo de resposta" quando o áudio termina
    // (startAnswerClock, chamado pela ação audioDone).
    waitingAudio: waitAudio,
    deadline: start + (waitAudio ? LISTEN_WINDOW_MS : 0) + ms + GRACE_MS,
  };
  // Uma pergunta aberta nunca vira W.O. antes do tempo dela acabar.
  if (d.turnDeadline && d.turnDeadline < d.question.deadline) d.turnDeadline = d.question.deadline;
  d.phase = "question";
  d.updatedAt = now;
  return syncDeadline(d);
};

// Listening: o aluno terminou de ouvir o áudio pela 1ª vez → agora
// sim começa o tempo de resposta. Só vale uma vez por pergunta e só
// dentro da janela de escuta. Devolve true se o relógio foi iniciado.
const startAnswerClock = (d, n, now) => {
  const q = d.question;
  if (!q || q.n !== n || !q.waitingAudio) return false;
  const limitEnd = now + q.limitMs + GRACE_MS;
  if (now > q.deadline) return false;
  q.waitingAudio = false;
  q.audioDoneAt = now;
  q.askedAt = now;
  q.deadline = Math.min(q.deadline, limitEnd);
  if (d.turnDeadline && d.turnDeadline < q.deadline) d.turnDeadline = q.deadline;
  d.updatedAt = now;
  syncDeadline(d);
  return true;
};

const availableCrowns = (d, uid) => CATEGORIES.filter((c) => !(d.crowns[uid] || []).includes(c));

// Resultado do giro: categoria (vai para a pergunta) ou coroa (vai
// para a escolha). Não coloca a pergunta — isso é com o chamador,
// que precisa sortear no banco.
const applySpin = (d, uid, slot, now) => {
  const target = WHEEL[slot];
  d.lastSpin = { uid, slot, at: now };
  d.updatedAt = now;
  if (target === "crown") { d.phase = "crown_pick"; d.crownSource = "wheel"; return { kind: "crown_pick" }; }
  return { kind: "question", cat: target };
};

// ── Fim de vez / fim de jogo ─────────────────────────────────
const finish = (d, winner, reason, now) => {
  d.status = "finished";
  d.winner = winner;          // null = empate
  d.endReason = reason;       // crowns | turns | forfeit | timeout
  d.finishedAt = now;
  d.updatedAt = now;
  d.phase = null;
  d.question = null;
  d.turn = null;
  return syncDeadline(d);
};

const outcomeByScore = (d) => {
  const [a, b] = d.players;
  const ca = d.crowns[a].length, cb = d.crowns[b].length;
  if (ca !== cb) return ca > cb ? a : b;
  if (d.correct[a] !== d.correct[b]) return d.correct[a] > d.correct[b] ? a : b;
  return null;
};

const endTurn = (d, now) => {
  const uid = d.turn;
  d.turns[uid] = (d.turns[uid] || 0) + 1;
  d.question = null;
  const [a, b] = d.players;
  if (d.turns[a] >= MAX_TURNS && d.turns[b] >= MAX_TURNS) return finish(d, outcomeByScore(d), "turns", now);
  return startTurn(d, other(d, uid), now);
};

const pushLog = (d, entry) => {
  d.log = [...(d.log || []), entry].slice(-40);
};

// ── Resposta ─────────────────────────────────────────────────
// `ok` já vem decidido pelo servidor (comparando com o gabarito
// secreto). choice = -1 quando o tempo acabou.
const applyAnswer = (d, uid, { ok, choice, correctIndex, explain, qid }, now) => {
  const q = d.question;
  const cat = q.cat;
  d.answered[uid] = (d.answered[uid] || 0) + 1;
  const cs = d.catStats[uid] || (d.catStats[uid] = {});
  const st = cs[cat] || (cs[cat] = { c: 0, t: 0 });
  st.t += 1;
  if (ok) { st.c += 1; d.correct[uid] = (d.correct[uid] || 0) + 1; }
  d.lastResult = { uid, n: q.n, ok, choice, correctIndex, explain, cat, kind: q.kind, qid, at: now, event: null };
  pushLog(d, { uid, cat, kind: q.kind, ok, at: now });
  d.question = null;
  d.updatedAt = now;
  let event = ok ? "correct" : "wrong";

  if (q.kind === "crown") {
    if (ok) {
      if (!d.crowns[uid].includes(cat)) d.crowns[uid].push(cat);
      event = "crown";
      if (d.crowns[uid].length >= CROWNS_TO_WIN) { finish(d, uid, "crowns", now); return "win"; }
      d.phase = "spin";
      d.streakInTurn += 1;
      syncDeadline(d);
      return event;
    }
    endTurn(d, now);
    return d.status === "finished" ? "end" : event;
  }

  if (ok) {
    d.streakInTurn += 1;
    d.meter[uid] = Math.min(METER_MAX, (d.meter[uid] || 0) + 1);
    if (d.meter[uid] >= METER_MAX) { d.phase = "crown_pick"; d.crownSource = "meter"; event = "meter_full"; }
    else d.phase = "spin";
    syncDeadline(d);
    return event;
  }
  endTurn(d, now);
  return d.status === "finished" ? "end" : event;
};

// Escolha da categoria para a pergunta da coroa. Se veio do medidor,
// o medidor zera (é "gasto" nessa tentativa).
const applyCrownPick = (d, uid, cat) => {
  if (!availableCrowns(d, uid).includes(cat)) return false;
  if (d.crownSource === "meter") d.meter[uid] = 0;
  return true;
};

// ── Relógio: pergunta vencida e vez abandonada ───────────────
// Chamado antes de qualquer ação e na varredura. Devolve uma lista
// do que aconteceu (para o chamador saber se precisa pagar prêmios
// ou devolver apostas).
const sweep = (d, now) => {
  const happened = [];
  if (d.status === "invited" && now > d.expiresAt) {
    d.status = "expired"; d.updatedAt = now; syncDeadline(d);
    happened.push("expired");
    return happened;
  }
  if (d.status !== "active") return happened;
  if (d.question && now > d.question.deadline) {
    applyAnswer(d, d.turn, { ok: false, choice: -1, correctIndex: null, explain: null, qid: d.question.id }, now);
    happened.push("question_timeout");
  }
  if (d.status === "active" && now > d.turnDeadline) {
    const loser = d.turn;
    finish(d, other(d, loser), "timeout", now);
    happened.push("turn_timeout");
  }
  if (d.status === "finished") happened.push("finished");
  return happened;
};

// ── Prêmios ──────────────────────────────────────────────────
// Resultado bruto de cada jogador (antes do teto diário). O pote da
// aposta é separado: não entra no teto (é dinheiro dos próprios
// jogadores trocando de mão).
const rewardsFor = (d) => {
  const out = {};
  const walkover = d.endReason === "timeout" || d.endReason === "forfeit";
  for (const uid of d.players) {
    const opp = other(d, uid);
    let res, xp = 0, fr = 0, trophies = 0, pot = 0;
    if (d.winner === null) res = "draw";
    else res = d.winner === uid ? "win" : "loss";
    const crowns = (d.crowns[uid] || []).length;

    if (res === "draw") { xp = REWARDS.draw.xp; fr = REWARDS.draw.fr; trophies = TROPHIES.draw; pot = d.stake; }
    else if (res === "win") {
      trophies = TROPHIES.win;
      pot = d.stake * 2;
      // Vitória por W.O. contra quem nem chegou a responder nada não
      // rende XP/FR$ (senão bastaria convidar uma conta parada e
      // esperar 48h). Troféus e pote continuam valendo.
      if (!(walkover && (d.answered[opp] || 0) === 0)) { xp = REWARDS.win.xp; fr = REWARDS.win.fr; }
    } else {
      trophies = walkover ? TROPHIES.forfeitLoss : TROPHIES.loss;
      if (!walkover) { xp = REWARDS.loss.xp; fr = REWARDS.loss.fr; }
    }
    if (xp > 0) xp += crowns * REWARDS.perCrown;
    out[uid] = { result: res, xp, fr: round2(fr), trophies, pot };
  }
  return out;
};

// Aplica o teto diário. `daily` = { day, xp, fr } do jogador.
const applyDailyCap = (daily, reward, now) => {
  const day = spDay(now);
  const cur = daily && daily.day === day ? { ...daily } : { day, xp: 0, fr: 0 };
  const xp = Math.max(0, Math.min(reward.xp, DAILY_CAP.xp - cur.xp));
  const fr = round2(Math.max(0, Math.min(reward.fr, round2(DAILY_CAP.fr - cur.fr))));
  cur.xp += xp; cur.fr = round2(cur.fr + fr);
  return { daily: cur, xp, fr, capped: xp < reward.xp || fr < reward.fr };
};

// Estatísticas permanentes do jogador (duel_players/{uid}).
const applyStats = (p, d, uid, reward) => {
  const s = { wins: 0, losses: 0, draws: 0, played: 0, streak: 0, bestStreak: 0, trophies: 0, crownsTotal: 0, catStats: {}, ...(p || {}) };
  s.played += 1;
  if (reward.result === "win") { s.wins += 1; s.streak += 1; s.bestStreak = Math.max(s.bestStreak, s.streak); }
  else if (reward.result === "loss") { s.losses += 1; s.streak = 0; }
  else { s.draws += 1; }
  s.trophies = Math.max(0, (s.trophies || 0) + reward.trophies);
  s.crownsTotal += (d.crowns[uid] || []).length;
  const cs = { ...(s.catStats || {}) };
  for (const [cat, v] of Object.entries(d.catStats[uid] || {})) {
    const prev = cs[cat] || { c: 0, t: 0 };
    cs[cat] = { c: prev.c + v.c, t: prev.t + v.t };
  }
  s.catStats = cs;
  return s;
};

// ── Banco de perguntas ───────────────────────────────────────
const bucketKey = (cat, level) => `${cat}_${level}`;

// Sorteia uma pergunta inédita para o jogador. `pool` = banco fixo +
// perguntas geradas pela IA daquele cat/nível. Se ele já viu todas,
// recomeça pelas que viu há mais tempo (a lista `seen` é em ordem).
const pickQuestion = (pool, seenList, rand = Math.random, excludeId = null) => {
  const seen = new Set(seenList || []);
  const fresh = pool.filter((q) => !seen.has(q.id) && q.id !== excludeId);
  let item, unseenLeft;
  if (fresh.length) {
    item = fresh[Math.floor(rand() * fresh.length)];
    unseenLeft = fresh.length - 1;
  } else {
    const order = (seenList || []).filter((id) => id !== excludeId);
    const oldest = order.slice(0, Math.max(1, Math.ceil(order.length / 3)));
    const byId = new Map(pool.map((q) => [q.id, q]));
    const candidates = oldest.map((id) => byId.get(id)).filter(Boolean);
    item = candidates.length ? candidates[Math.floor(rand() * candidates.length)] : pool[Math.floor(rand() * pool.length)];
    unseenLeft = 0;
  }
  return { item, unseenLeft };
};

const markSeen = (seenList, id) => [...(seenList || []).filter((x) => x !== id), id].slice(-SEEN_KEEP);

// Embaralha as alternativas (o banco tem a correta em posições
// variadas, mas embaralhar de novo a cada partida impede decorar
// "é sempre a B").
const shuffleItem = (item, rand = Math.random) => {
  const idx = item.options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return {
    pub: { id: item.id, q: item.q, passage: item.passage || null, audio: item.audio || null, options: idx.map((i) => item.options[i]) },
    answer: idx.indexOf(item.answer),
    explain: item.explain,
  };
};

// 50/50: tira duas alternativas erradas, sorteadas.
const fiftyFifty = (answer, rand = Math.random) => {
  const wrong = [0, 1, 2, 3].filter((i) => i !== answer);
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }
  return wrong.slice(0, 2).sort();
};

// Validação de uma pergunta (usada nas geradas pela IA; o banco fixo
// passa pela mesma regra nos testes).
const validateItem = (q, cat, level) => {
  const errs = [];
  if (!q || typeof q !== "object") return ["não é objeto"];
  if (typeof q.q !== "string" || q.q.trim().length < 5 || q.q.length > 200) errs.push("q");
  if (!Array.isArray(q.options) || q.options.length !== 4) errs.push("options");
  else {
    if (q.options.some((o) => typeof o !== "string" || !o.trim() || o.length > 80)) errs.push("option");
    if (new Set(q.options.map((o) => String(o).trim().toLowerCase())).size !== 4) errs.push("dup");
  }
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) errs.push("answer");
  if (typeof q.explain !== "string" || q.explain.length < 10 || q.explain.length > 200) errs.push("explain");
  if (cat === "reading" && (typeof q.passage !== "string" || q.passage.length < 20 || q.passage.length > 340)) errs.push("passage");
  if (cat === "listening" && (typeof q.audio !== "string" || q.audio.length < 5 || q.audio.length > 240)) errs.push("audio");
  if (q.cat && q.cat !== cat) errs.push("cat");
  if (q.level && q.level !== level) errs.push("level");
  return errs;
};

module.exports = {
  CATEGORIES, WHEEL, LEVELS, MAX_TURNS, CROWNS_TO_WIN, METER_MAX, ANSWER_MS, LONG_ANSWER_MS, GRACE_MS,
  TURN_MS, INVITE_MS, STAKES, MAX_OPEN_DUELS, HELPS, REWARDS, DAILY_CAP, TROPHIES, LEAGUES,
  SEEN_KEEP, LOW_STOCK, AI_BUCKET_CAP, SPIN_ANIM_MS, READING_MS, LISTENING_MS, LISTEN_WINDOW_MS, startAnswerClock,
  other, spDay, levelFrom, leagueFor, newDuel, accept, startTurn, spinSlot, answerMsFor, setQuestion,
  availableCrowns, applySpin, applyAnswer, applyCrownPick, endTurn, finish, outcomeByScore, sweep,
  rewardsFor, applyDailyCap, applyStats, bucketKey, pickQuestion, markSeen, shuffleItem, fiftyFifty,
  validateItem, syncDeadline, round2,
};
