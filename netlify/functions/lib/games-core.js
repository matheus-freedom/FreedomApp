// ============================================================
// FREEDOMAPP — lib/games-core
// ------------------------------------------------------------
// Regras PURAS dos jogos ao vivo da aba Games:
//   • Quiz Party (estilo Kahoot): todos respondem a MESMA pergunta
//     ao mesmo tempo; vale mais quem acerta mais rápido.
//   • Draw It! (estilo Gartic): um desenha, os outros adivinham a
//     palavra em inglês.
//
// "Pura" quer dizer: nada aqui fala com o Firestore nem olha o
// relógio sozinho — tudo recebe `now` (e, quando sorteia algo, uma
// função `rand`). Isso permite testar partidas inteiras em memória
// (test-games.mjs) e garante que o servidor (games.js) é o único
// juiz: o navegador só desenha o que o servidor decidiu.
//
// COMO O TEMPO ANDA SEM UM "SERVIDOR LIGADO O TEMPO TODO"
// A Netlify não mantém um programa rodando entre as chamadas. Por
// isso cada sala guarda `nextAt` — o instante (no relógio do
// servidor) do próximo acontecimento: acabar a pergunta, dar uma
// dica, passar a vez... Quando esse instante chega, os aparelhos
// dos jogadores chamam a ação "tick" e o servidor confere com o
// PRÓPRIO relógio se já é hora; se for, avança. Vários aparelhos
// chamando ao mesmo tempo não dão problema: a transação garante
// que só um avanço acontece.
// ============================================================

const WORDS = require("./games/draw-words.json");

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const GAMES = ["quiz", "draw"];
const QUIZ_CATS = ["grammar", "vocabulary", "reading", "listening", "travel", "everyday"];

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem O/0/I/1 (confundem)
const CODE_LEN = 5;

const LIMITS = {
  quiz: { maxPlayers: 40, minPlayers: 2 },
  draw: { maxPlayers: 8, minPlayers: 2 },
};

const QUIZ = {
  counts: [5, 10, 15],
  defaultCount: 10,
  introMs: 3000,      // "Get ready": a pergunta aparece, as alternativas ainda não
  questionMs: 20000,
  longQuestionMs: 30000, // reading/listening (tem texto ou áudio)
  graceMs: 1500,      // folga de rede para a resposta chegar
  revealMs: { solo: 3500, party: 6500, presenter: 9000 },
  maxStreakBonus: 250,
};

const DRAW = {
  rounds: [1, 2, 3],
  defaultRounds: 2,
  drawTimes: [60000, 80000, 100000],
  defaultDrawMs: 80000,
  chooseMs: 15000,
  turnEndMs: 6000,
  hintsAt: [0.45, 0.7], // fração do tempo em que uma letra é revelada
  guessPoints: [100, 90, 80, 70, 60, 50], // 1º a acertar, 2º, ... (mínimo 50)
  drawerPerGuess: 30,
  choices: 3,
};

const LOBBY = {
  quickAutoStartMs: 20000, // partida rápida: começa sozinha 20s depois de ter 2 jogadores
  staleMs: 2 * 3600000,    // sala parada há 2h é encerrada
  quickFreshMs: 5 * 60000, // partida rápida só entra em sala mexida nos últimos 5 min
  offlineMs: 30000,        // sem sinal de vida há 30s = fora do ar
  inviteMs: 10 * 60000,
  feedKeep: 14,
};

const REACTIONS = ["👏", "😂", "🔥", "😮", "❤️", "🤔"];

const REWARDS = {
  places: [{ xp: 40, fr: 0.3 }, { xp: 30, fr: 0.2 }, { xp: 25, fr: 0.1 }],
  participation: { xp: 15, fr: 0 },
  perQuizCorrect: 2,
  perDrawGuess: 3,
  solo: { perCorrect: 2, goodBonus: 10 },
};
const DAILY_CAP = { xp: 200, fr: 1 };

const round2 = (n) => Math.round(n * 100) / 100;
const spDay = (ms) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);

const makeCode = (rand = Math.random) => {
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return s;
};
// Limpa o que o aluno digitou: maiúsculas, sem espaço/traço.
const cleanCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LEN);

// ── Sala ─────────────────────────────────────────────────────
// players: só quem JOGA. Quem apresenta (modo professor) fica em
// hostId/hostInfo e não entra em players.
const newRoom = ({ id, code, game, mode, hostId, hostInfo, hostPlays, level, isPublic, settings, now }) => {
  if (!GAMES.includes(game)) throw new Error("jogo inválido");
  const room = {
    id, code, game, mode, // mode: 'solo' | 'party'
    hostId, hostInfo, hostPlays: mode === "solo" ? true : hostPlays !== false,
    level: LEVELS.includes(level) ? level : "A1",
    public: !!isPublic && mode === "party",
    status: "lobby", phase: "lobby", nextAt: null,
    players: {}, order: [],
    settings: normalizeSettings(game, settings),
    feed: [], createdAt: now, updatedAt: now, startedAt: null, finishedAt: null,
    rewards: null, standings: null, paid: false,
  };
  if (room.hostPlays) addPlayer(room, hostId, hostInfo, now, { silent: true });
  return room;
};

const normalizeSettings = (game, s = {}) => {
  if (game === "quiz") {
    const cats = Array.isArray(s.cats) ? s.cats.filter((c) => QUIZ_CATS.includes(c)) : [];
    return { count: QUIZ.counts.includes(Number(s.count)) ? Number(s.count) : QUIZ.defaultCount, cats: cats.length ? [...new Set(cats)] : [...QUIZ_CATS] };
  }
  return {
    rounds: DRAW.rounds.includes(Number(s.rounds)) ? Number(s.rounds) : DRAW.defaultRounds,
    drawMs: DRAW.drawTimes.includes(Number(s.drawMs)) ? Number(s.drawMs) : DRAW.defaultDrawMs,
  };
};

const pushFeed = (room, e, now) => {
  room.feed = [...(room.feed || []), { t: now, ...e }].slice(-LOBBY.feedKeep);
};

const playerUids = (room) => room.order.filter((u) => room.players[u]);
const activeUids = (room) => playerUids(room).filter((u) => !room.players[u].left);

const addPlayer = (room, uid, info, now, { silent = false } = {}) => {
  const existing = room.players[uid];
  if (existing && !existing.left) return { joined: false, already: true };
  if (room.status === "finished" || room.status === "closed") return { error: "Essa partida já terminou." };
  if (room.mode === "solo" && uid !== room.hostId) return { error: "Essa é uma partida individual." };
  if (!existing && activeUids(room).length >= LIMITS[room.game].maxPlayers) return { error: "A sala está cheia." };
  if (existing) { existing.left = false; existing.leftAt = null; }
  else {
    room.players[uid] = { ...info, score: 0, correct: 0, acts: 0, joinedAt: now, left: false };
    room.order.push(uid);
    if (room.game === "draw" && room.status === "playing" && Array.isArray(room.drawOrder) && !room.drawOrder.includes(uid)) {
      room.drawOrder.push(uid); // entrou no meio: desenha numa vez futura
    }
  }
  if (!silent) pushFeed(room, { k: "join", uid, name: info.username || info.name }, now);
  room.updatedAt = now;
  maybeScheduleAutoStart(room, now);
  return { joined: true };
};

// Saída: no lobby some da lista; em jogo fica marcado (mantém pontos
// e pode voltar com o mesmo código).
const removePlayer = (room, uid, now) => {
  const p = room.players[uid];
  const wasHost = room.hostId === uid;
  if (p) {
    if (room.status === "lobby") {
      delete room.players[uid];
      room.order = room.order.filter((u) => u !== uid);
    } else { p.left = true; p.leftAt = now; }
    pushFeed(room, { k: "leave", uid, name: p.username || p.name }, now);
  }
  if (wasHost && room.status === "lobby") {
    const next = activeUids(room)[0];
    if (next) {
      room.hostId = next;
      room.hostInfo = pick(room.players[next], ["username", "name", "photo", "level"]);
      room.hostPlays = true;
    } else { room.status = "closed"; room.phase = "closed"; room.nextAt = null; }
  }
  if (room.status === "lobby" && room.autoStart && activeUids(room).length < LIMITS[room.game].minPlayers) {
    room.autoStart = false; room.nextAt = null;
  }
  if (room.status === "playing" && activeUids(room).length === 0 && room.hostPlays) {
    finish(room, now, "empty");
  }
  room.updatedAt = now;
};

const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o ? o[k] ?? null : null]));

const minToStart = (room) => {
  if (room.mode === "solo") return 1;
  if (room.game === "quiz" && !room.hostPlays) return 1; // professor pode testar com 1 aluno
  return LIMITS[room.game].minPlayers;
};
const canStart = (room) => room.status === "lobby" && activeUids(room).length >= minToStart(room);

// Partida rápida (sala pública): ao chegar no mínimo de jogadores,
// começa sozinha em 20s — ninguém fica esperando um "host" que saiu.
const maybeScheduleAutoStart = (room, now) => {
  if (!room.public || room.status !== "lobby" || room.autoStart) return;
  if (activeUids(room).length >= LIMITS[room.game].minPlayers) {
    room.autoStart = true;
    room.nextAt = now + LOBBY.quickAutoStartMs;
  }
};

// ════════════════════════════════════════════════════════════════
// QUIZ PARTY
// ════════════════════════════════════════════════════════════════
const quizTimeFor = (cat) => (cat === "reading" || cat === "listening" ? QUIZ.longQuestionMs : QUIZ.questionMs);

// Kahoot: acertar no primeiro instante vale 1000; no último, 500.
// Sequência de acertos dá bônus de 50 por acerto seguido (até 250).
const quizPoints = (elapsedMs, totalMs, streak) => {
  const t = Math.min(Math.max(elapsedMs, 0), totalMs);
  const base = Math.round(1000 * (1 - t / totalMs / 2));
  const bonus = Math.min(Math.max(streak - 1, 0) * 50, QUIZ.maxStreakBonus);
  return base + bonus;
};

const revealMsFor = (room) => (room.mode === "solo" ? QUIZ.revealMs.solo : room.hostPlays ? QUIZ.revealMs.party : QUIZ.revealMs.presenter);

// secret.questions: [{ pub, answer, explain, cat }] — sorteadas no início.
const quizStart = (room, secret, now) => {
  room.status = "playing";
  room.startedAt = now;
  room.autoStart = false;
  room.total = secret.questions.length;
  secret.streaks = {};
  quizSetQuestion(room, secret, 0, now);
};

const quizSetQuestion = (room, secret, n, now) => {
  const item = secret.questions[n];
  const startsAt = now + QUIZ.introMs;
  const ms = quizTimeFor(item.cat);
  room.phase = "question";
  room.q = { n, total: secret.questions.length, cat: item.cat, ...item.pub, startsAt, endsAt: startsAt + ms, ms };
  room.answered = {};
  room.reveal = null;
  room.nextAt = startsAt + ms + QUIZ.graceMs;
  room.updatedAt = now;
};

// Resposta válida? (o servidor grava em game_answers e marca answered)
const quizCanAnswer = (room, uid, n, now) => {
  if (room.status !== "playing" || room.phase !== "question" || !room.q || room.q.n !== n) return "Essa pergunta já fechou.";
  const p = room.players[uid];
  if (!p || p.left) return "Você não está nesta partida.";
  if (now < room.q.startsAt - 300) return "Calma! As alternativas ainda vão aparecer.";
  if (now > room.q.endsAt + QUIZ.graceMs) return "O tempo acabou.";
  if (room.answered && room.answered[uid]) return "Você já respondeu.";
  return null;
};

// Todo mundo (que está no ar) já respondeu? Então revela na hora.
const quizAllAnswered = (room, online) => {
  const who = activeUids(room).filter((u) => !online || online.has(u));
  return who.length > 0 && who.every((u) => room.answered && room.answered[u]);
};

// answers: { uid: { choice, at } } da pergunta atual.
const quizReveal = (room, secret, answers, now) => {
  const n = room.q.n;
  const item = secret.questions[n];
  const dist = [0, 0, 0, 0];
  const results = {};
  for (const uid of playerUids(room)) {
    const a = answers[uid];
    const p = room.players[uid];
    if (!a) {
      secret.streaks[uid] = 0;
      if (!p.left) results[uid] = { ok: false, pts: 0, choice: null, streak: 0 };
      continue;
    }
    if (a.choice >= 0 && a.choice < 4) dist[a.choice] += 1;
    const ok = a.choice === item.answer;
    const streak = ok ? (secret.streaks[uid] || 0) + 1 : 0;
    secret.streaks[uid] = streak;
    const pts = ok ? quizPoints(a.at - room.q.startsAt, room.q.ms, streak) : 0;
    p.score += pts;
    p.acts += 1;
    if (ok) p.correct += 1;
    results[uid] = { ok, pts, choice: a.choice, streak };
  }
  room.phase = "reveal";
  room.reveal = { n, answer: item.answer, explain: item.explain || "", dist, results };
  room.nextAt = now + revealMsFor(room);
  room.updatedAt = now;
  room.standings = standings(room);
};

const quizAfterReveal = (room, secret, now) => {
  const next = room.q.n + 1;
  if (next >= secret.questions.length) finish(room, now, "done");
  else quizSetQuestion(room, secret, next, now);
};

// ════════════════════════════════════════════════════════════════
// DRAW IT!
// ════════════════════════════════════════════════════════════════
const wordsFor = (level) => WORDS[level] || WORDS.A1;

const stripAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
// "The Ice-Cream!" → "icecream". Também tira artigo e plural simples,
// para "a cat", "cats" e "Cat" contarem como "cat".
const normalizeGuess = (s) => {
  let t = stripAccents(String(s || "").toLowerCase()).replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^(a|an|the)\s+/, "");
  t = t.replace(/[\s-]/g, "");
  return t;
};
const singular = (t) => (t.length > 4 && t.endsWith("es") ? [t, t.slice(0, -2), t.slice(0, -1)] : t.length > 3 && t.endsWith("s") ? [t, t.slice(0, -1)] : [t]);
const formsOf = (entry) => [entry.w, ...(entry.alt || [])].map(normalizeGuess).filter(Boolean);

const matchesWord = (guess, entry) => {
  const g = normalizeGuess(guess);
  if (!g) return false;
  const gs = singular(g);
  return formsOf(entry).some((f) => singular(f).some((x) => gs.includes(x)));
};

const levenshtein = (a, b) => {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
};
// "Quase!": um erro de digitação (dois em palavras longas).
const isClose = (guess, entry) => {
  const g = normalizeGuess(guess);
  if (g.length < 3) return false;
  return formsOf(entry).some((f) => {
    const limit = f.length >= 8 ? 2 : f.length >= 4 ? 1 : 0;
    return limit > 0 && Math.abs(f.length - g.length) <= limit && levenshtein(g, f) <= limit;
  });
};

// Máscara da palavra: letras viram null (o app desenha "_"), espaço
// e hífen aparecem. `revealed` = posições já liberadas como dica.
const maskOf = (word, revealed = []) => [...word].map((ch, i) => (/[a-z]/i.test(ch) ? (revealed.includes(i) ? ch.toLowerCase() : null) : ch));

const pickChoices = (level, used = [], rand = Math.random, k = DRAW.choices) => {
  const pool = wordsFor(level).filter((e) => !used.includes(e.w));
  const src = pool.length >= k ? pool : wordsFor(level);
  const copy = [...src];
  const out = [];
  while (out.length < k && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
};

const drawStart = (room, secret, now, rand = Math.random) => {
  room.status = "playing";
  room.startedAt = now;
  room.autoStart = false;
  const order = activeUids(room);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  room.drawOrder = order;
  room.round = 1;
  room.turnIdx = -1;
  room.turn = 0;
  secret.used = [];
  drawNextTurn(room, secret, now, rand, null);
};

// Próxima pessoa que desenha (pula quem saiu ou está fora do ar).
const drawNextTurn = (room, secret, now, rand = Math.random, online = null) => {
  const order = room.drawOrder;
  let idx = room.turnIdx;
  let round = room.round;
  for (let guard = 0; guard < order.length * 4 + 2; guard++) {
    idx += 1;
    if (idx >= order.length) { idx = 0; round += 1; }
    if (round > room.settings.rounds) { finish(room, now, "done"); return; }
    const uid = order[idx];
    const p = room.players[uid];
    if (p && !p.left && (!online || online.has(uid))) {
      if (activeUids(room).filter((u) => !online || online.has(u)).length < 2) { finish(room, now, "few"); return; }
      room.turnIdx = idx;
      room.round = round;
      room.turn += 1;
      room.drawer = uid;
      room.phase = "choose";
      room.nextAt = now + DRAW.chooseMs;
      room.guessed = {};
      room.mask = null;
      room.wordInfo = null;
      room.turnResult = null;
      room.reports = {};
      room.drawStartsAt = null;
      room.drawEndsAt = null;
      secret.choices = pickChoices(room.level, secret.used, rand);
      secret.word = null;
      secret.revealed = [];
      room.updatedAt = now;
      return;
    }
  }
  finish(room, now, "few");
};

const drawPick = (room, secret, uid, idx, now) => {
  if (room.phase !== "choose" || room.drawer !== uid) return "Não é hora de escolher.";
  const entry = secret.choices[idx];
  if (!entry) return "Opção inválida.";
  secret.word = entry;
  secret.used = [...(secret.used || []), entry.w].slice(-120);
  secret.revealed = [];
  room.phase = "draw";
  room.drawStartsAt = now;
  room.drawEndsAt = now + room.settings.drawMs;
  room.mask = maskOf(entry.w, []);
  room.wordInfo = { c: entry.c, len: entry.w.replace(/[^a-z]/gi, "").length };
  room.hintsGiven = 0;
  room.nextAt = nextDrawEvent(room, now);
  room.updatedAt = now;
  return null;
};

const nextDrawEvent = (room) => {
  const total = room.settings.drawMs;
  const h = room.hintsGiven || 0;
  if (h < DRAW.hintsAt.length) return room.drawStartsAt + Math.round(total * DRAW.hintsAt[h]);
  return room.drawEndsAt;
};

const giveHint = (room, secret, rand = Math.random) => {
  const w = secret.word.w;
  const letters = [...w].map((ch, i) => (/[a-z]/i.test(ch) ? i : -1)).filter((i) => i >= 0 && !secret.revealed.includes(i));
  // Nunca revela tudo: sobra pelo menos metade das letras escondida.
  const totalLetters = [...w].filter((ch) => /[a-z]/i.test(ch)).length;
  if (letters.length > Math.ceil(totalLetters / 2)) {
    secret.revealed.push(letters[Math.floor(rand() * letters.length)]);
  }
  room.mask = maskOf(w, secret.revealed);
  room.hintsGiven = (room.hintsGiven || 0) + 1;
};

// Palpite. Devolve { ok, close, pts } — o texto do palpite NUNCA vai
// para a sala (palpites errados ficam só na tela de quem digitou).
const drawGuess = (room, secret, uid, text, now, online = null) => {
  if (room.status !== "playing" || room.phase !== "draw" || !secret.word) return { error: "Agora não dá para adivinhar." };
  const p = room.players[uid];
  if (!p || p.left) return { error: "Você não está nesta partida." };
  if (uid === room.drawer) return { error: "Quem desenha não adivinha 😉" };
  if (room.guessed[uid]) return { already: true };
  if (now > room.drawEndsAt + 1500) return { error: "O tempo acabou." };
  p.acts += 1;
  if (matchesWord(text, secret.word)) {
    const order = Object.keys(room.guessed).length;
    const pts = DRAW.guessPoints[Math.min(order, DRAW.guessPoints.length - 1)];
    room.guessed[uid] = { order: order + 1, pts };
    p.score += pts;
    p.correct += 1;
    const drawer = room.players[room.drawer];
    if (drawer) { drawer.score += DRAW.drawerPerGuess; drawer.acts += 1; }
    pushFeed(room, { k: "guess", uid, name: p.username || p.name }, now);
    room.updatedAt = now;
    room.standings = standings(room);
    if (drawAllGuessed(room, online)) drawEndTurn(room, secret, now, "all");
    return { ok: true, pts };
  }
  return { ok: false, close: isClose(text, secret.word) };
};

const drawGuessers = (room, online) => activeUids(room).filter((u) => u !== room.drawer && (!online || online.has(u)));
const drawAllGuessed = (room, online) => {
  const g = drawGuessers(room, online);
  return g.length > 0 && g.every((u) => room.guessed[u]);
};

const drawEndTurn = (room, secret, now, reason) => {
  room.phase = "turnEnd";
  room.turnResult = {
    word: secret.word ? secret.word.w : null,
    pt: secret.word ? secret.word.pt : null,
    reason, // all | time | drawer_left | reported | no_pick
    guessed: { ...room.guessed },
    drawer: room.drawer,
  };
  room.mask = secret.word ? maskOf(secret.word.w, [...secret.word.w].map((_, i) => i)) : null;
  room.nextAt = now + DRAW.turnEndMs;
  room.updatedAt = now;
  room.standings = standings(room);
};

// Denúncia de desenho impróprio. Metade dos adivinhadores (ou mais)
// denunciou → o desenho some e a vez acaba sem pontos para quem
// desenhou. Uma denúncia já fica registrada para o admin.
const drawReport = (room, secret, uid, now, online = null) => {
  if (room.phase !== "draw" && room.phase !== "choose") return { error: "Nada para denunciar agora." };
  if (uid === room.drawer) return { error: "Você está desenhando." };
  room.reports = { ...(room.reports || {}), [uid]: true };
  const guessers = drawGuessers(room, online).length || 1;
  const count = Object.keys(room.reports).length;
  if (count >= Math.ceil(guessers / 2)) {
    const d = room.players[room.drawer];
    if (d) d.score = Math.max(0, d.score - DRAW.drawerPerGuess * Object.keys(room.guessed || {}).length);
    drawEndTurn(room, secret, now, "reported");
    return { removed: true, count };
  }
  return { removed: false, count };
};

// ════════════════════════════════════════════════════════════════
// RELÓGIO: avança o que estiver vencido
// ════════════════════════════════════════════════════════════════
// online: Set dos uids com sinal de vida recente (ou null = todos).
// Devolve uma lista do que aconteceu (para o servidor saber se precisa
// sortear perguntas, pagar prêmio etc.).
const tick = (room, secret, now, { online = null, rand = Math.random } = {}) => {
  const ev = [];
  if (room.status === "lobby") {
    if (room.autoStart && room.nextAt && now >= room.nextAt) ev.push("autostart");
    return ev;
  }
  if (room.status !== "playing") return ev;

  // Draw: quem desenha saiu ou caiu → passa a vez sem esperar o relógio.
  if (room.game === "draw" && (room.phase === "choose" || room.phase === "draw")) {
    const d = room.players[room.drawer];
    const gone = !d || d.left || (online && !online.has(room.drawer) && now - (d.joinedAt || 0) > LOBBY.offlineMs);
    if (gone) { drawEndTurn(room, secret, now, "drawer_left"); ev.push("turn_end"); return ev; }
  }
  if (!room.nextAt || now < room.nextAt) return ev;

  if (room.game === "quiz") {
    if (room.phase === "question") ev.push("reveal_due");      // o servidor lê as respostas e chama quizReveal
    else if (room.phase === "reveal") { quizAfterReveal(room, secret, now); ev.push(room.status === "finished" ? "finished" : "next_question"); }
    return ev;
  }
  // draw
  if (room.phase === "choose") {
    // Não escolheu a tempo: o servidor escolhe a primeira opção.
    drawPick(room, secret, room.drawer, 0, now);
    ev.push("auto_pick");
  } else if (room.phase === "draw") {
    if (now >= room.drawEndsAt) { drawEndTurn(room, secret, now, "time"); ev.push("turn_end"); }
    else { giveHint(room, secret, rand); room.nextAt = nextDrawEvent(room); ev.push("hint"); }
  } else if (room.phase === "turnEnd") {
    drawNextTurn(room, secret, now, rand, online);
    ev.push(room.status === "finished" ? "finished" : "next_turn");
  }
  return ev;
};

// ════════════════════════════════════════════════════════════════
// FIM DE JOGO E PRÊMIOS
// ════════════════════════════════════════════════════════════════
const standings = (room) => playerUids(room)
  .map((u) => ({ uid: u, score: room.players[u].score, correct: room.players[u].correct, joinedAt: room.players[u].joinedAt }))
  .sort((a, b) => b.score - a.score || b.correct - a.correct || a.joinedAt - b.joinedAt)
  .map((s, i) => ({ uid: s.uid, place: i + 1, score: s.score, correct: s.correct }));

const finish = (room, now, reason) => {
  room.status = "finished";
  room.phase = "podium";
  room.nextAt = null;
  room.finishedAt = now;
  room.endReason = reason;
  room.standings = standings(room);
  room.rewards = rewardsFor(room);
  room.updatedAt = now;
};

// Prêmio ANTES do teto diário (o servidor aplica o teto ao pagar).
// Só ganha quem participou de verdade (respondeu/adivinhou/desenhou).
// Em grupo, só há colocação se pelo menos 2 pessoas participaram —
// senão um aluno sozinho "venceria" uma sala vazia toda hora.
const rewardsFor = (room) => {
  const out = {};
  const st = room.standings || standings(room);
  if (room.mode === "solo") {
    for (const s of st) {
      const p = room.players[s.uid];
      if (!p.acts) continue;
      const total = room.total || 1;
      const xp = s.correct * REWARDS.solo.perCorrect + (s.correct / total >= 0.5 ? REWARDS.solo.goodBonus : 0);
      out[s.uid] = { place: 1, xp, fr: 0 };
    }
    return out;
  }
  const participants = st.filter((s) => room.players[s.uid].acts > 0);
  const ranked = participants.length >= 2;
  participants.forEach((s, i) => {
    const base = ranked ? REWARDS.places[i] || REWARDS.participation : REWARDS.participation;
    const per = room.game === "quiz" ? REWARDS.perQuizCorrect : REWARDS.perDrawGuess;
    out[s.uid] = { place: ranked ? i + 1 : null, xp: base.xp + s.correct * per, fr: ranked ? base.fr : 0 };
  });
  return out;
};

const applyDailyCap = (daily, reward, now) => {
  const day = spDay(now);
  const cur = daily && daily.day === day ? { ...daily } : { day, xp: 0, fr: 0 };
  const xp = Math.max(0, Math.min(reward.xp, DAILY_CAP.xp - cur.xp));
  const fr = round2(Math.max(0, Math.min(reward.fr, round2(DAILY_CAP.fr - cur.fr))));
  cur.xp += xp; cur.fr = round2(cur.fr + fr);
  return { daily: cur, xp, fr, capped: xp < reward.xp || fr < reward.fr };
};

// Estatísticas permanentes do jogador (game_players/{uid}).
const applyStats = (p, room, uid) => {
  const s = { ...(p || {}) };
  const g = { played: 0, wins: 0, podiums: 0, best: 0, correct: 0, ...(s[room.game] || {}) };
  const me = (room.standings || []).find((x) => x.uid === uid);
  const r = room.rewards && room.rewards[uid];
  g.played += 1;
  if (me) {
    g.best = Math.max(g.best, me.score);
    g.correct += me.correct;
    if (room.mode === "party" && r && r.place === 1) g.wins += 1;
    if (room.mode === "party" && r && r.place && r.place <= 3) g.podiums += 1;
  }
  s[room.game] = g;
  return s;
};

module.exports = {
  LEVELS, GAMES, QUIZ_CATS, LIMITS, QUIZ, DRAW, LOBBY, REACTIONS, REWARDS, DAILY_CAP, CODE_CHARS, CODE_LEN,
  round2, spDay, makeCode, cleanCode, newRoom, normalizeSettings, pushFeed, playerUids, activeUids,
  addPlayer, removePlayer, canStart, minToStart, maybeScheduleAutoStart,
  quizTimeFor, quizPoints, quizStart, quizSetQuestion, quizCanAnswer, quizAllAnswered, quizReveal, quizAfterReveal,
  wordsFor, normalizeGuess, matchesWord, isClose, levenshtein, maskOf, pickChoices,
  drawStart, drawNextTurn, drawPick, giveHint, drawGuess, drawAllGuessed, drawEndTurn, drawReport, drawGuessers,
  tick, standings, finish, rewardsFor, applyDailyCap, applyStats,
};
