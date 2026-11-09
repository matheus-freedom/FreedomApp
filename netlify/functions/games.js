// ============================================================
// FREEDOMAPP — Function: games
// ------------------------------------------------------------
// Servidor dos jogos AO VIVO da aba Games:
//   • Quiz Party (estilo Kahoot) — sozinho ou em sala, com modo
//     professor (telão) e partida rápida.
//   • Draw It! (estilo Gartic) — desenhar e adivinhar em inglês.
// (O Duelo da Roleta continua na function "duel".)
//
// COMO O "TEMPO REAL" FUNCIONA
// O estado público da sala mora em game_rooms/{id}. O app de cada
// jogador fica "escutando" esse documento (onSnapshot do Firestore):
// quando o servidor muda algo, todos veem na hora, sem recarregar.
// O navegador PODE LER a sala, mas NÃO PODE ESCREVER nela — toda
// mudança passa por aqui. O que é segredo (gabarito do quiz, palavra
// do desenho) fica em game_secrets/{id}, que o navegador nem lê.
//
// Exceções que o navegador grava direto (as regras do Firestore
// conferem quem pode): os TRAÇOS do desenho
// (game_rooms/{id}/strokes — só quem está desenhando naquela vez) e o
// SINAL DE VIDA (game_rooms/{id}/presence/{uid} — cada um o seu).
// Os traços vão direto porque passar cada risco pelo servidor
// deixaria o desenho travando.
//
// Ações (campo "action"):
//   hub       dados da aba (meu nível, estatísticas, sala atual, salas abertas)
//   create    criar sala (quiz solo, quiz em grupo, draw)
//   join      entrar com código
//   quick     partida rápida (entra numa sala pública ou cria uma)
//   leave     sair da sala
//   settings  host muda nível/configurações no lobby
//   kick      host tira alguém da sala
//   start     host começa
//   tick      "já deu a hora?" — avança a partida quando o relógio vence
//   answer    resposta do quiz
//   peek      quem desenha vê as opções / a palavra
//   pick      quem desenha escolhe a palavra
//   guess     palpite do desenho
//   react     reação rápida (emoji da lista fixa)
//   report    denunciar desenho impróprio
//   invite    convidar um colega (aparece na tela dele na hora)
//   again     "jogar de novo" (cria a revanche com os mesmos ajustes)
// ============================================================

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { randomUUID } = require("crypto");
const core = require("./lib/games-core");
const duelCore = require("./lib/duel-core");
const { staticPool } = require("./lib/duel-bank");
const { addXpFr, updateLeagueChallenges } = require("./lib/economy");

const ALLOWED_ORIGINS = [
  "https://freedom.app.br",
  "https://www.freedom.app.br",
  "http://localhost:3000",
  "http://localhost:5173",
];
const buildHeaders = (origin) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
});

const initFirebase = () => {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return { db: getFirestore(), auth: getAuth() };
};

class GameError extends Error {
  constructor(message, code = "RULE", status = 400, extra = {}) { super(message); this.code = code; this.status = status; this.extra = extra; }
}

const isApproved = (u) => !u.accessStatus || u.accessStatus === "approved";
const isAdminDoc = (u) => u.isAdmin === true || String(u.username || "").toLowerCase() === "admin";
const safePhoto = (p) => (typeof p === "string" && /^https?:\/\//.test(p) && p.length < 800 ? p : null);

const ROOMS = "game_rooms", SECRETS = "game_secrets", CODES = "game_codes", PLAYERS = "game_players",
  ANSWERS = "game_answers", INVITES = "game_invites", REPORTS = "game_reports";

// Nível do jogador: o mesmo critério do Duelo (nivelamento; senão o
// "Qual seu nível?" que ele respondeu lá).
const levelOf = async (db, uid, user) => {
  const dp = await db.collection("duel_players").doc(uid).get();
  return duelCore.levelFrom(user.gamification, dp.exists ? dp.data().levelChoice : null);
};
const infoOf = (user, level) => ({
  username: user.username || "",
  name: user.fullName || user.userName || user.username || "Aluno",
  photo: safePhoto(user.profilePhoto),
  level: level || null,
});

const roomRef = (db, id) => db.collection(ROOMS).doc(id);
const secretRef = (db, id) => db.collection(SECRETS).doc(id);

const getRoom = async (db, id) => {
  const s = await roomRef(db, String(id || "")).get();
  if (!s.exists) throw new GameError("Sala não encontrada.", "NOT_FOUND", 404);
  return s.data();
};

// Quem está "no ar" (sinal de vida nos últimos 30s).
const toMs = (v) => (typeof v === "number" ? v : v && typeof v.toMillis === "function" ? v.toMillis() : 0);
const onlineSet = async (db, roomId, now) => {
  const snap = await roomRef(db, roomId).collection("presence").get();
  const set = new Set();
  for (const d of snap.docs) if (now - toMs(d.data().at) < core.LOBBY.offlineMs) set.add(d.id);
  return set;
};
// Quem acabou de agir está no ar, mesmo que o sinal de vida ainda
// não tenha chegado (ex.: acabou de entrar).
const withMe = (set, uid) => { const s = new Set(set); s.add(uid); return s; };
// Até 40s depois de entrar, conta como "no ar" mesmo sem sinal de vida
// (o primeiro sinal pode demorar alguns segundos para chegar).
const withFresh = (set, room, now) => {
  const s = new Set(set);
  for (const u of core.activeUids(room)) if (now - (room.players[u].joinedAt || 0) < 40000) s.add(u);
  return s;
};

// ── Perguntas do quiz ────────────────────────────────────────
// Usa o MESMO banco do Duelo da Roleta (650 perguntas fixas + as que
// a IA já gerou para a escola em duel_bank). Aqui não pedimos mais à
// IA: quem completa o banco é o Duelo, com as regras de custo dele.
const pickQuizQuestions = async (db, level, cats, count, rand = Math.random) => {
  const pools = {};
  await Promise.all(cats.map(async (c) => {
    const bucket = duelCore.bucketKey(c, level);
    let ai = [];
    try { const s = await db.collection("duel_bank").doc(bucket).get(); ai = s.exists ? (s.data().items || []) : []; } catch { ai = []; }
    const all = [...staticPool(c, level), ...ai].filter((q) => q && Array.isArray(q.options) && q.options.length === 4);
    pools[c] = all.sort(() => rand() - 0.5);
  }));
  const out = [];
  const used = new Set();
  let i = 0, guard = 0;
  // Reveza as categorias para a partida não ficar só de gramática.
  const order = [...cats].sort(() => rand() - 0.5);
  while (out.length < count && guard++ < count * 20) {
    const c = order[i++ % order.length];
    const q = pools[c].find((x) => !used.has(x.id));
    if (!q) { if (order.every((cc) => !pools[cc].some((x) => !used.has(x.id)))) break; continue; }
    used.add(q.id);
    const sh = duelCore.shuffleItem(q, rand);
    out.push({ pub: sh.pub, answer: sh.answer, explain: sh.explain || "", cat: c, id: q.id });
  }
  if (!out.length) throw new GameError("Não encontramos perguntas para esse nível. Tente outro nível ou categoria.");
  return out;
};

// ── Código da sala ───────────────────────────────────────────
const reserveCode = async (db, roomId, now) => {
  for (let i = 0; i < 8; i++) {
    const code = core.makeCode();
    const ref = db.collection(CODES).doc(code);
    let ok = false;
    await db.runTransaction(async (tx) => {
      ok = false;
      const s = await tx.get(ref);
      if (s.exists && s.data().expiresAt > now) return;
      tx.set(ref, { roomId, expiresAt: now + 6 * 3600000 });
      ok = true;
    });
    if (ok) return code;
  }
  throw new GameError("Não conseguimos gerar um código agora. Tente de novo.", "CODE", 503);
};

// ── Pagamento no fim da partida ──────────────────────────────
// Lê (dentro da transação) o aluno e as estatísticas de quem ganhou
// prêmio; devolve uma função que grava tudo. Assim leitura vem antes
// da escrita, como a transação do Firestore exige.
const preparePay = async (tx, db, room, now) => {
  if (room.status !== "finished" || room.paid) return null;
  const uids = core.playerUids(room);
  const snaps = await Promise.all(uids.flatMap((u) => [tx.get(db.collection("users").doc(u)), tx.get(db.collection(PLAYERS).doc(u))]));
  return () => {
    room.paid = true;
    const paid = {};
    uids.forEach((u, i) => {
      const user = snaps[i * 2].exists ? snaps[i * 2].data() : null;
      const player = snaps[i * 2 + 1].exists ? snaps[i * 2 + 1].data() : {};
      const r = room.rewards && room.rewards[u];
      let stats = core.applyStats(player, room, u);
      if (player.currentRoom === room.id) stats.currentRoom = null;
      if (r && user) {
        const cap = core.applyDailyCap(player.daily, r, now);
        addXpFr(user, cap.xp, cap.fr, now);
        stats.daily = cap.daily;
        paid[u] = { ...r, xp: cap.xp, fr: cap.fr, capped: cap.capped };
        tx.set(db.collection("users").doc(u), user);
      }
      stats.updatedAt = now;
      tx.set(db.collection(PLAYERS).doc(u), stats);
    });
    room.rewards = { ...(room.rewards || {}), ...paid };
    room.paidRewards = paid;
  };
};

// Depois de pagar: histórico (conta no Hall da Fama) e Ligas em
// Grupo. Idempotente (marca afterDone), como no Duelo.
const afterPay = async (db, roomId, now) => {
  const ref = roomRef(db, roomId);
  let go = false;
  await db.runTransaction(async (tx) => {
    go = false;
    const s = await tx.get(ref);
    if (!s.exists || !s.data().paid || s.data().afterDone) return;
    tx.update(ref, { afterDone: true });
    go = true;
  });
  if (!go) return;
  const room = (await ref.get()).data();
  const label = room.game === "quiz" ? (room.mode === "solo" ? "Quiz Party (solo)" : "Quiz Party") : "Draw It!";
  for (const [uid, r] of Object.entries(room.paidRewards || {})) {
    if (!r.xp) continue;
    const me = (room.standings || []).find((s) => s.uid === uid) || { correct: 0 };
    const rec = {
      id: `game_${room.id}_${uid}`, userId: uid, date: now,
      level: room.level, theme: "Games", topic: label,
      score: me.correct || 0, total: room.game === "quiz" ? room.total || 0 : me.correct || 0, type: "game",
      xpGained: r.xp, frGained: r.fr || 0, signature: `game|${room.id}|${uid}`,
    };
    await db.collection("history").doc(rec.id).set(rec).catch((e) => console.error("games history:", e));
    await updateLeagueChallenges(db, uid, r.xp).catch((e) => console.error("games league:", e));
  }
};

// ── Motor: roda o relógio dentro de uma transação ────────────
// `mutate(room, secret, ctx)` pode mexer na sala; depois disso o
// relógio avança o que estiver vencido (respostas do quiz são lidas
// aqui quando a pergunta fecha). Se a partida acabou, paga.
const runRoom = async (db, roomId, uid, mutate, { readAnswers = true } = {}) => {
  const now0 = Date.now();
  const online0 = await onlineSet(db, roomId, now0);
  let out = null, room = null, needAfter = false;
  await db.runTransaction(async (tx) => {
    out = null; needAfter = false;
    const now = Date.now();
    const [rs, ss] = await Promise.all([tx.get(roomRef(db, roomId)), tx.get(secretRef(db, roomId))]);
    if (!rs.exists) throw new GameError("Sala não encontrada.", "NOT_FOUND", 404);
    room = rs.data();
    const secret = ss.exists ? ss.data() : {};
    const online = withFresh(uid ? withMe(online0, uid) : online0, room, now);
    // Escritas extras pedidas pela ação (ex.: "sala atual" do jogador)
    // ficam numa fila e só acontecem no fim: numa transação do Firestore
    // TODAS as leituras precisam vir antes de qualquer escrita.
    const deferred = [];
    const ctx = { now, online, defer: (fn) => deferred.push(fn) };
    out = mutate ? await mutate(room, secret, ctx) : null;

    // Relógio: até 3 avanços por chamada (ex.: revelar + ir para a próxima).
    for (let i = 0; i < 3; i++) {
      const ev = core.tick(room, secret, now, { online });
      if (ev.includes("autostart")) { await startRoom(db, room, secret, now); continue; }
      if (ev.includes("reveal_due") && readAnswers) {
        const answers = await readQuizAnswers(tx, db, room);
        core.quizReveal(room, secret, answers, now);
        continue;
      }
      if (!ev.length) break;
    }
    const pay = await preparePay(tx, db, room, now);
    if (pay) { pay(); needAfter = true; }
    tx.set(roomRef(db, roomId), room);
    tx.set(secretRef(db, roomId), secret);
    for (const fn of deferred) fn(tx);
  });
  if (needAfter) await afterPay(db, roomId, Date.now());
  return { room, out };
};

const readQuizAnswers = async (tx, db, room) => {
  const n = room.q.n;
  const snap = await tx.get(db.collection(ANSWERS).where("roomId", "==", room.id).where("n", "==", n));
  const answers = {};
  for (const d of snap.docs) { const a = d.data(); answers[a.uid] = { choice: a.choice, at: a.at }; }
  return answers;
};

const startRoom = async (db, room, secret, now) => {
  if (room.game === "quiz") {
    const qs = await pickQuizQuestions(db, room.level, room.settings.cats, room.settings.count);
    secret.questions = qs;
    core.quizStart(room, secret, now);
  } else {
    core.drawStart(room, secret, now);
  }
};

const setCurrent = (tx, db, uid, roomId) => tx.set(db.collection(PLAYERS).doc(uid), { currentRoom: roomId, updatedAt: Date.now() }, { merge: true });

const assertHost = (room, uid) => { if (room.hostId !== uid) throw new GameError("Só quem criou a sala pode fazer isso."); };

// ════════════════════════════════════════════════════════════════
// AÇÕES
// ════════════════════════════════════════════════════════════════
const actions = {};

actions.hub = async (db, uid, body, me) => {
  const lv = await levelOf(db, uid, me);
  const ps = await db.collection(PLAYERS).doc(uid).get();
  const p = ps.exists ? ps.data() : {};
  const now = Date.now();
  let current = null;
  if (p.currentRoom) {
    try {
      const r = await getRoom(db, p.currentRoom);
      const inside = (r.players[uid] && !r.players[uid].left) || (r.hostId === uid && !r.hostPlays);
      if (inside && (r.status === "lobby" || r.status === "playing") && now - r.updatedAt < core.LOBBY.staleMs) {
        current = { id: r.id, code: r.code, game: r.game, mode: r.mode, status: r.status, players: core.activeUids(r).length };
      }
    } catch { current = null; }
  }
  const open = { quiz: 0, draw: 0 };
  try {
    const snap = await db.collection(ROOMS).where("public", "==", true).where("status", "==", "lobby").get();
    for (const d of snap.docs) {
      const r = d.data();
      if (now - r.updatedAt < core.LOBBY.quickFreshMs && open[r.game] !== undefined) open[r.game] += 1;
    }
  } catch { /* contagem é só enfeite */ }
  const day = core.spDay(now);
  return {
    me: {
      uid, level: lv.level, levelSource: lv.source, needLevel: !lv.level,
      quiz: p.quiz || null, draw: p.draw || null,
      daily: p.daily && p.daily.day === day ? p.daily : { day, xp: 0, fr: 0 }, dailyCap: core.DAILY_CAP,
      balance: core.round2((me.gamification && me.gamification.frBalance) || 0), xp: (me.gamification && me.gamification.xp) || 0,
    },
    current, open,
  };
};

actions.create = async (db, uid, body, me) => {
  const game = String(body.game || "");
  if (!core.GAMES.includes(game)) throw new GameError("Jogo inválido.");
  const mode = body.mode === "solo" ? "solo" : "party";
  if (mode === "solo" && game !== "quiz") throw new GameError("Esse jogo é só em grupo.");
  const lv = await levelOf(db, uid, me);
  const level = core.LEVELS.includes(body.level) ? body.level : lv.level;
  if (!level) throw new GameError("Escolha seu nível antes de jogar.", "NEED_LEVEL");
  const hostPlays = game === "draw" || mode === "solo" ? true : body.hostPlays !== false;
  const now = Date.now();
  const id = randomUUID();
  const code = mode === "solo" ? null : await reserveCode(db, id, now);
  const room = core.newRoom({
    id, code, game, mode, hostId: uid, hostInfo: infoOf(me, lv.level), hostPlays, level,
    isPublic: !!body.public, settings: body.settings, now,
  });
  const secret = {};
  if (mode === "solo") await startRoom(db, room, secret, now);
  await db.runTransaction(async (tx) => {
    tx.set(roomRef(db, id), room);
    tx.set(secretRef(db, id), secret);
    setCurrent(tx, db, uid, id);
  });
  return { room };
};

const joinRoom = async (db, uid, me, roomId) => {
  const lv = await levelOf(db, uid, me);
  const { room } = await runRoom(db, roomId, uid, async (r, s, { now, defer }) => {
    if (r.hostId === uid && !r.hostPlays) { defer((tx) => setCurrent(tx, db, uid, r.id)); return; } // professor voltando
    if ((r.kicked || []).includes(uid)) throw new GameError("Você foi removido desta sala pelo host.");
    if (now - r.updatedAt > core.LOBBY.staleMs && r.status !== "finished") { r.status = "closed"; r.phase = "closed"; }
    const res = core.addPlayer(r, uid, infoOf(me, lv.level), now);
    if (res.error) throw new GameError(res.error);
    defer((tx) => setCurrent(tx, db, uid, r.id));
  });
  return { room };
};

actions.join = async (db, uid, body, me) => {
  if (body.roomId) return joinRoom(db, uid, me, String(body.roomId));
  const code = core.cleanCode(body.code);
  if (code.length !== core.CODE_LEN) throw new GameError("O código tem 5 letras/números.");
  const cs = await db.collection(CODES).doc(code).get();
  if (!cs.exists || cs.data().expiresAt < Date.now()) throw new GameError("Não achamos uma sala com esse código.", "NOT_FOUND", 404);
  return joinRoom(db, uid, me, cs.data().roomId);
};

actions.quick = async (db, uid, body, me) => {
  const game = String(body.game || "");
  if (!core.GAMES.includes(game)) throw new GameError("Jogo inválido.");
  const lv = await levelOf(db, uid, me);
  if (!lv.level) throw new GameError("Escolha seu nível antes de jogar.", "NEED_LEVEL");
  const now = Date.now();
  const snap = await db.collection(ROOMS).where("public", "==", true).where("status", "==", "lobby").where("game", "==", game).get();
  const myIdx = core.LEVELS.indexOf(lv.level);
  const candidates = snap.docs.map((d) => d.data())
    .filter((r) => now - r.updatedAt < core.LOBBY.quickFreshMs && core.activeUids(r).length < core.LIMITS[game].maxPlayers && !(r.players[uid] && !r.players[uid].left))
    .map((r) => ({ r, dist: Math.abs(core.LEVELS.indexOf(r.level) - myIdx) }))
    .filter((x) => x.dist <= 1) // no máximo um nível de diferença
    .sort((a, b) => a.dist - b.dist || core.activeUids(b.r).length - core.activeUids(a.r).length);
  for (const c of candidates) {
    try { return { ...(await joinRoom(db, uid, me, c.r.id)), matched: true }; }
    catch (e) { if (!(e instanceof GameError)) throw e; } // encheu no meio do caminho: tenta a próxima
  }
  const r = await actions.create(db, uid, { game, mode: "party", public: true, hostPlays: true, level: lv.level }, me);
  return { ...r, matched: false };
};

actions.leave = async (db, uid, body) => {
  const roomId = String(body.roomId || "");
  const { room } = await runRoom(db, roomId, null, async (r, s, { now, defer }) => {
    if (r.hostId === uid && !r.hostPlays) {
      // Professor saindo: no lobby encerra a sala; em jogo, a partida segue sozinha.
      if (r.status === "lobby") {
        const next = core.activeUids(r)[0];
        if (next) { r.hostId = next; r.hostInfo = { ...r.players[next] }; r.hostPlays = true; }
        else { r.status = "closed"; r.phase = "closed"; r.nextAt = null; }
      }
    } else core.removePlayer(r, uid, now);
    defer((tx) => tx.set(db.collection(PLAYERS).doc(uid), { currentRoom: null, updatedAt: now }, { merge: true }));
  });
  return { room };
};

actions.settings = async (db, uid, body) => {
  const { room } = await runRoom(db, String(body.roomId || ""), uid, async (r) => {
    assertHost(r, uid);
    if (r.status !== "lobby") throw new GameError("A partida já começou.");
    if (body.settings) r.settings = core.normalizeSettings(r.game, { ...r.settings, ...body.settings });
    if (core.LEVELS.includes(body.level)) r.level = body.level;
    r.updatedAt = Date.now();
  });
  return { room };
};

actions.kick = async (db, uid, body) => {
  const target = String(body.uid || "");
  const { room } = await runRoom(db, String(body.roomId || ""), uid, async (r, s, { now, defer }) => {
    assertHost(r, uid);
    if (target === uid) throw new GameError("Para sair, use o botão Sair.");
    if (!r.players[target]) throw new GameError("Essa pessoa não está na sala.");
    core.removePlayer(r, target, now);
    r.kicked = [...(r.kicked || []), target].slice(-30);
    defer((tx) => tx.set(db.collection(PLAYERS).doc(target), { currentRoom: null, updatedAt: now }, { merge: true }));
  });
  return { room };
};

actions.start = async (db, uid, body) => {
  const roomId = String(body.roomId || "");
  const peekRoom = await getRoom(db, roomId);
  assertHost(peekRoom, uid);
  // Perguntas sorteadas FORA da transação (lê o banco; pode demorar).
  const questions = peekRoom.game === "quiz" ? await pickQuizQuestions(db, peekRoom.level, peekRoom.settings.cats, peekRoom.settings.count) : null;
  const { room } = await runRoom(db, roomId, uid, async (r, s, { now }) => {
    assertHost(r, uid);
    if (!core.canStart(r)) throw new GameError(`Precisa de pelo menos ${core.minToStart(r)} jogador(es) para começar.`);
    if (r.game === "quiz") { s.questions = questions; core.quizStart(r, s, now); }
    else core.drawStart(r, s, now);
  });
  return { room };
};

actions.tick = async (db, uid, body) => {
  const { room } = await runRoom(db, String(body.roomId || ""), uid, null);
  return { room };
};

actions.answer = async (db, uid, body) => {
  const roomId = String(body.roomId || "");
  const n = Number(body.n), choice = Number(body.choice);
  if (!Number.isInteger(choice) || choice < 0 || choice > 3) throw new GameError("Resposta inválida.");
  const room = await getRoom(db, roomId);
  const now = Date.now();
  const why = core.quizCanAnswer(room, uid, n, now);
  // Só aceita até meio segundo antes do fechamento oficial, para a
  // resposta estar gravada quando o servidor for corrigir.
  if (why || now > room.q.endsAt + core.QUIZ.graceMs - 500) throw new GameError(why || "O tempo acabou.", "LATE");
  // Uma resposta por pessoa por pergunta: create() falha se já existir.
  // Fica num documento separado (e não dentro da sala) para 30 alunos
  // respondendo no mesmo segundo não brigarem pelo mesmo documento.
  try {
    await db.collection(ANSWERS).doc(`${roomId}_${n}_${uid}`).create({ roomId, n, uid, choice, at: now, expiresAt: now + 86400000 });
  } catch (e) {
    throw new GameError("Você já respondeu.", "DUP");
  }
  await roomRef(db, roomId).update({ [`answered.${uid}`]: true });
  // Se foi a última resposta que faltava, revela na hora.
  const fresh = await getRoom(db, roomId);
  const online = withFresh(withMe(await onlineSet(db, roomId, Date.now()), uid), fresh, Date.now());
  if (fresh.phase === "question" && fresh.q && fresh.q.n === n && core.quizAllAnswered(fresh, online)) {
    const { room: r2 } = await runRoom(db, roomId, uid, async (r, s, { now: t }) => {
      if (r.phase === "question" && r.q.n === n && core.quizAllAnswered(r, online)) r.nextAt = Math.min(r.nextAt, t);
    });
    return { ok: true, room: r2 };
  }
  return { ok: true };
};

actions.peek = async (db, uid, body) => {
  const roomId = String(body.roomId || "");
  const room = await getRoom(db, roomId);
  if (room.game !== "draw" || room.drawer !== uid) throw new GameError("Não é a sua vez de desenhar.");
  const s = (await secretRef(db, roomId).get()).data() || {};
  const view = (e) => (e ? { w: e.w, pt: e.pt, c: e.c } : null);
  return { turn: room.turn, phase: room.phase, choices: room.phase === "choose" ? (s.choices || []).map(view) : null, word: view(s.word) };
};

actions.pick = async (db, uid, body) => {
  const { room, out } = await runRoom(db, String(body.roomId || ""), uid, async (r, s, { now }) => {
    if (Number(body.turn) !== r.turn) throw new GameError("Essa vez já passou.");
    const why = core.drawPick(r, s, uid, Number(body.idx), now);
    if (why) throw new GameError(why);
    return { w: s.word.w, pt: s.word.pt, c: s.word.c };
  });
  return { room, word: out };
};

actions.guess = async (db, uid, body) => {
  const text = String(body.text || "").slice(0, 40);
  if (!text.trim()) throw new GameError("Digite um palpite.");
  const { room, out } = await runRoom(db, String(body.roomId || ""), uid, async (r, s, { now, online }) => {
    const last = (s.lastGuess && s.lastGuess[uid]) || 0;
    if (now - last < 600) return { slow: true };
    s.lastGuess = { ...(s.lastGuess || {}), [uid]: now };
    const res = core.drawGuess(r, s, uid, text, now, online);
    if (res.error) throw new GameError(res.error);
    return res;
  });
  return { room, result: out };
};

actions.react = async (db, uid, body) => {
  const r = Number(body.r);
  if (!Number.isInteger(r) || r < 0 || r >= core.REACTIONS.length) throw new GameError("Reação inválida.");
  const { room } = await runRoom(db, String(body.roomId || ""), uid, async (room, s, { now }) => {
    const p = room.players[uid];
    if (!p || p.left) throw new GameError("Você não está nesta partida.");
    if (now - (p.lastReact || 0) < 1500) return;
    p.lastReact = now;
    core.pushFeed(room, { k: "react", uid, name: p.username || p.name, x: r }, now);
  });
  return { room };
};

actions.report = async (db, uid, body) => {
  const roomId = String(body.roomId || "");
  let reportInfo = null;
  const { room, out } = await runRoom(db, roomId, uid, async (r, s, { now, online }) => {
    const res = core.drawReport(r, s, uid, now, online);
    if (res.error) throw new GameError(res.error);
    reportInfo = { roomId, turn: r.turn, drawer: r.turnResult ? r.turnResult.drawer : r.drawer, word: s.word ? s.word.w : null, removed: res.removed };
    return res;
  });
  // Registro para o admin (com o caminho dos traços, que ficam guardados).
  await db.collection(REPORTS).add({
    ...reportInfo, reporter: uid, at: Date.now(),
    drawerInfo: room.players[reportInfo.drawer] ? { username: room.players[reportInfo.drawer].username, name: room.players[reportInfo.drawer].name } : null,
    strokesPath: `${ROOMS}/${roomId}/strokes`,
  }).catch((e) => console.error("games report:", e));
  return { room, result: out };
};

actions.invite = async (db, uid, body, me) => {
  const roomId = String(body.roomId || "");
  const to = String(body.to || "");
  const room = await getRoom(db, roomId);
  if (!(room.players[uid] && !room.players[uid].left) && room.hostId !== uid) throw new GameError("Você não está nesta sala.");
  if (room.status !== "lobby" && !(room.status === "playing" && room.game === "draw")) throw new GameError("Essa partida não aceita mais convites.");
  if (to === uid) throw new GameError("Escolha outra pessoa.");
  const target = await db.collection("users").doc(to).get();
  if (!target.exists || !isApproved(target.data())) throw new GameError("Aluno não encontrado.");
  const now = Date.now();
  await db.collection(INVITES).doc(`${to}_${roomId}`).set({
    to, roomId, code: room.code, game: room.game, level: room.level,
    from: infoOf(me, null), fromUid: uid, createdAt: now, expiresAt: now + core.LOBBY.inviteMs,
  });
  return { ok: true };
};

actions.again = async (db, uid, body, me) => {
  const old = await getRoom(db, String(body.roomId || ""));
  if (old.status !== "finished") throw new GameError("A partida ainda não terminou.");
  if (old.next && old.next.id) return joinRoom(db, uid, me, old.next.id);
  if (old.mode === "solo") return actions.create(db, uid, { game: old.game, mode: "solo", level: old.level, settings: old.settings }, me);
  const created = await actions.create(db, uid, { game: old.game, mode: "party", hostPlays: old.hostId === uid ? old.hostPlays : true, level: old.level, settings: old.settings, public: old.public }, me);
  // Avisa a sala antiga: os outros veem o botão "Entrar na revanche".
  let next = null;
  await db.runTransaction(async (tx) => {
    const s = await tx.get(roomRef(db, old.id));
    const cur = s.data();
    if (cur.next && cur.next.id) { next = cur.next; return; }
    tx.update(roomRef(db, old.id), { next: { id: created.room.id, code: created.room.code, by: uid } });
  });
  if (next) return joinRoom(db, uid, me, next.id); // alguém criou a revanche um instante antes
  return created;
};

exports.handler = async (event) => {
  const headers = buildHeaders(event.headers.origin || "");
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Método não permitido" }) };
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Configuração de servidor incompleta." }) };
  }
  const { db, auth } = initFirebase();
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: "Não autenticado." }) };
  let uid;
  try { uid = (await auth.verifyIdToken(token)).uid; }
  catch { return { statusCode: 401, headers, body: JSON.stringify({ error: "Sessão inválida. Faça login novamente." }) }; }
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido." }) }; }
  const fn = actions[body.action];
  if (!fn) return { statusCode: 400, headers, body: JSON.stringify({ error: "Ação inválida." }) };
  try {
    const meSnap = await db.collection("users").doc(uid).get();
    if (!meSnap.exists || !isApproved(meSnap.data())) return { statusCode: 403, headers, body: JSON.stringify({ error: "Acesso não liberado." }) };
    const result = await fn(db, uid, body, meSnap.data());
    return { statusCode: 200, headers, body: JSON.stringify({ ...result, serverNow: Date.now() }) };
  } catch (e) {
    if (e instanceof GameError) return { statusCode: e.status, headers, body: JSON.stringify({ error: e.message, code: e.code, ...e.extra }) };
    console.error("games:", body.action, e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Algo deu errado no jogo. Tente de novo." }) };
  }
};

// Para os testes.
exports._internal = { actions, pickQuizQuestions };
