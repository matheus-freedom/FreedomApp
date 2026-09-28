// ============================================================
// FREEDOMAPP — Function: duel
// ------------------------------------------------------------
// Servidor do "Duelo da Roleta" (aba Desafios). TODA mudança de uma
// partida passa por aqui, dentro de uma transação do Firestore:
// girar a roleta, responder, conquistar coroa, pagar prêmio e
// aposta. O navegador nunca grava nada do duelo — nem consegue: as
// coleções duel_* não aparecem nas regras do Firestore, então ficam
// fechadas para o app (o Admin SDK daqui ignora as regras).
//
// Ações (campo "action" do body):
//   hub        → dados da aba: meu perfil de duelista + meus duelos
//   get        → um duelo (o app consulta enquanto espera o adversário)
//   setLevel   → "Qual seu nível?" (só para quem não fez nivelamento)
//   search     → procurar adversário por @ ou nome
//   create     → convidar (amigo ou aleatório), com aposta opcional
//   respond    → aceitar / recusar convite
//   cancel     → desfazer convite que eu mandei
//   spin       → girar a roleta
//   pickCrown  → escolher a categoria da pergunta da coroa
//   answer     → responder (o servidor corrige)
//   help       → ajudas grátis: 50/50 e pular
//   forfeit    → desistir
//   report     → reportar pergunta com problema
//
// Coleções:
//   duels/{id}          estado público da partida (SEM gabarito)
//   duel_secrets/{id}   gabarito da pergunta em jogo
//   duel_players/{uid}  troféus, vitórias, estatísticas, teto diário
//   duel_seen/{uid}     perguntas já vistas (para não repetir)
//   duel_bank/{cat_lv}  perguntas geradas pela IA (reuso da escola toda)
//   duel_reports/{id}   perguntas reportadas pelos alunos
//   duel_pairs/{a_b}    trava: um duelo aberto por dupla de jogadores
// ============================================================

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { randomUUID } = require("crypto");
const core = require("./lib/duel-core");
const { staticPool } = require("./lib/duel-bank");
const { signScoped } = require("./lib/journey-sign");
const { weekKeyOf, monthKeyOf } = require("./lib/ranking-core");

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

// Erro "de regra" (mensagem vai para o aluno) x erro inesperado.
class DuelError extends Error {
  constructor(message, code = "RULE", status = 400, duelId = null) { super(message); this.code = code; this.status = status; this.duelId = duelId; }
}

// ── Helpers de dados ──────────────────────────────────────────
const isApproved = (u) => !u.accessStatus || u.accessStatus === "approved";
const isAdminDoc = (u) => u.isAdmin === true || String(u.username || "").toLowerCase() === "admin";
const safePhoto = (p) => (typeof p === "string" && /^https?:\/\//.test(p) && p.length < 800 ? p : null);

const infoOf = (uid, user, player) => {
  const lv = core.levelFrom(user.gamification, player && player.levelChoice);
  return {
    username: user.username || "",
    name: user.fullName || user.userName || user.username || "Aluno",
    photo: safePhoto(user.profilePhoto),
    level: lv.level,
  };
};

// Todos os alunos (para busca/aleatório). A escola tem poucas
// centenas de contas, então ler a coleção é barato; guardamos 60s
// na instância para a digitação na busca não multiplicar leituras.
let usersCache = { at: 0, list: [] };
const allUsers = async (db) => {
  if (Date.now() - usersCache.at < 60000) return usersCache.list;
  const snap = await db.collection("users").get();
  usersCache = { at: Date.now(), list: snap.docs.map((d) => ({ uid: d.id, ...d.data() })) };
  return usersCache.list;
};

const myDuels = async (db, uid) => {
  const snap = await db.collection("duels").where("players", "array-contains", uid).get();
  return snap.docs.map((d) => d.data());
};
const isOpen = (d) => d.status === "invited" || d.status === "active";

// ── Economia: prêmios, apostas, contadores de período ─────────
// Mesma lógica de virada de semana/mês do award-activity, para o XP
// do duelo entrar no ranking semanal/mensal do jeito certo.
const yearKeyOf = (ms) => `${new Date(ms - 3 * 3600000).getUTCFullYear()}`;
const addXpFr = (user, xp, fr, now) => {
  const g = user.gamification || (user.gamification = {});
  const wk = weekKeyOf(now), mk = monthKeyOf(now), yk = yearKeyOf(now);
  if (g.lastWeekKey && g.lastWeekKey !== wk) { g.weeklyXp = 0; g.weeklyActivities = 0; }
  if (g.lastMonthKey && g.lastMonthKey !== mk) { g.monthlyXp = 0; g.monthlyActivities = 0; }
  if (g.lastYearKey && g.lastYearKey !== yk) { g.yearlyXp = 0; }
  g.lastWeekKey = wk; g.lastMonthKey = mk; g.lastYearKey = yk;
  g.xp = (g.xp || 0) + xp;
  g.weeklyXp = (g.weeklyXp || 0) + xp;
  g.monthlyXp = (g.monthlyXp || 0) + xp;
  g.yearlyXp = (g.yearlyXp || 0) + xp;
  g.frBalance = core.round2((g.frBalance || 0) + fr);
};
const addFr = (user, fr) => {
  const g = user.gamification || (user.gamification = {});
  g.frBalance = core.round2((g.frBalance || 0) + fr);
};

// Paga o fim de partida DENTRO da transação. `ctx` traz os docs já
// lidos: users[uid], players[uid]. Devolve o que precisa ser feito
// depois (histórico e desafios da Liga) — fora da transação.
const settle = (d, ctx, now) => {
  const raw = core.rewardsFor(d);
  d.rewards = {};
  const after = [];
  for (const uid of d.players) {
    const r = raw[uid];
    const player = ctx.players[uid] || {};
    const cap = core.applyDailyCap(player.daily, r, now);
    const user = ctx.users[uid];
    if (user) addXpFr(user, cap.xp, cap.fr + r.pot, now);
    const stats = core.applyStats(player, d, uid, r);
    stats.daily = cap.daily;
    stats.updatedAt = now;
    ctx.players[uid] = stats;
    d.rewards[uid] = { result: r.result, xp: cap.xp, fr: cap.fr, pot: r.pot, trophies: r.trophies, capped: cap.capped, trophiesTotal: stats.trophies };
    if (cap.xp > 0) after.push({ uid, xp: cap.xp, fr: cap.fr });
  }
  return after;
};

const refundCreator = (d, ctx) => {
  if (d.stake > 0 && ctx.users[d.players[0]]) addFr(ctx.users[d.players[0]], d.stake);
};

// Depois de pagar: histórico (é dele que sai o Hall da Fama) e os
// desafios da Liga em Grupo (corrida de XP entre amigos).
const afterSettle = async (db, d, list, now) => {
  // Idempotente: o Firestore pode REFAZER uma transação (quando duas
  // chamadas mexem no mesmo duelo ao mesmo tempo) e duas chamadas podem
  // terminar o mesmo duelo quase juntas. A marca "afterDone" no duelo
  // garante que histórico e Liga recebem o XP UMA vez só.
  const ref = db.collection("duels").doc(d.id);
  let go = false;
  await db.runTransaction(async (tx) => {
    go = false;
    const s = await tx.get(ref);
    if (!s.exists || s.data().afterDone) return;
    tx.set(ref, { afterDone: true }, { merge: true });
    go = true;
  });
  if (!go) return;
  // Usa os prêmios GRAVADOS no duelo (fonte da verdade), não a lista
  // da chamada — que pode ter vindo de uma tentativa descartada.
  const fresh = (await ref.get()).data() || d;
  const paid = Object.entries(fresh.rewards || {}).filter(([, r]) => r.xp > 0).map(([uid, r]) => ({ uid, xp: r.xp, fr: r.fr }));
  for (const { uid, xp, fr } of paid) {
    const opp = core.other(d, uid);
    const rec = {
      id: `duel_${d.id}_${uid}`, userId: uid, date: now,
      level: (d.info[uid] && d.info[uid].level) || "A1", theme: "Desafios",
      topic: `Duelo da Roleta vs ${(d.info[opp] && d.info[opp].username) || "adversário"}`,
      score: d.correct[uid] || 0, total: d.answered[uid] || 0, type: "duel",
      xpGained: xp, frGained: fr, signature: `duel|${d.id}|${uid}`,
    };
    await db.collection("history").doc(rec.id).set(rec).catch((e) => console.error("duel history:", e));
    await updateLeagueChallenges(db, uid, xp).catch((e) => console.error("duel challenges:", e));
  }
};

// Cópia da regra do award-activity: XP ganho soma nas Ligas ativas.
const updateLeagueChallenges = async (db, uid, xp) => {
  if (xp <= 0) return;
  const snap = await db.collection("challenges").where("participantIds", "array-contains", uid).get();
  const now = Date.now();
  for (const doc of snap.docs) {
    const c = doc.data();
    if (c.status !== "active" || now > c.endDate) continue;
    if (!c.participantStats) c.participantStats = {};
    if (!c.participantStats[uid]) c.participantStats[uid] = { xpGained: 0, activitiesDone: 0 };
    c.participantStats[uid].xpGained += xp;
    c.participantStats[uid].activitiesDone += 1;
    await doc.ref.set(c);
  }
};

// ── Leitura em lote dentro da transação ───────────────────────
const readCtx = async (tx, db, uids) => {
  const refs = uids.flatMap((u) => [db.collection("users").doc(u), db.collection("duel_players").doc(u)]);
  const snaps = await Promise.all(refs.map((r) => tx.get(r)));
  const ctx = { users: {}, players: {} };
  uids.forEach((u, i) => {
    ctx.users[u] = snaps[i * 2].exists ? snaps[i * 2].data() : null;
    ctx.players[u] = snaps[i * 2 + 1].exists ? snaps[i * 2 + 1].data() : null;
  });
  return ctx;
};
const writeCtx = (tx, db, ctx, which) => {
  for (const u of which.users || []) if (ctx.users[u]) tx.set(db.collection("users").doc(u), ctx.users[u]);
  for (const u of which.players || []) if (ctx.players[u]) tx.set(db.collection("duel_players").doc(u), ctx.players[u]);
};

// ── Varredura (prazos vencidos) ───────────────────────────────
// Roda antes das ações e ao abrir a aba. Pergunta com tempo
// estourado vira erro; vez abandonada por 48h vira W.O.; convite
// sem resposta em 72h expira e devolve a aposta.
const sweepDuel = async (db, duelId) => {
  const ref = db.collection("duels").doc(duelId);
  let after = null, dOut = null;
  await db.runTransaction(async (tx) => {
    after = null; dOut = null; // a transação pode ser refeita
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const d = snap.data();
    const now = Date.now();
    if (!isOpen(d) || !d.deadline || now <= d.deadline) { dOut = d; return; }
    const ctx = await readCtx(tx, db, d.players);
    const happened = core.sweep(d, now);
    if (happened.includes("expired")) {
      refundCreator(d, ctx);
      writeCtx(tx, db, ctx, { users: [d.players[0]] });
    } else if (d.status === "finished") {
      after = settle(d, ctx, now);
      writeCtx(tx, db, ctx, { users: d.players, players: d.players });
    }
    if (happened.includes("question_timeout") || d.status === "finished") tx.delete(db.collection("duel_secrets").doc(d.id));
    tx.set(ref, d);
    dOut = d;
  });
  if (after && after.length) await afterSettle(db, dOut, after, Date.now());
  return dOut;
};

// ── Banco de perguntas: sortear + pedir mais à IA ─────────────
const pickFor = async (tx, db, uid, cat, level, excludeId = null) => {
  const bucket = core.bucketKey(cat, level);
  const [seenSnap, aiSnap] = await Promise.all([
    tx.get(db.collection("duel_seen").doc(uid)),
    tx.get(db.collection("duel_bank").doc(bucket)),
  ]);
  const seenDoc = seenSnap.exists ? seenSnap.data() : { buckets: {} };
  const ai = aiSnap.exists ? (aiSnap.data().items || []) : [];
  const pool = [...staticPool(cat, level), ...ai];
  const { item, unseenLeft } = core.pickQuestion(pool, (seenDoc.buckets || {})[bucket], Math.random, excludeId);
  const shuffled = core.shuffleItem(item);
  return {
    shuffled, bucket, item,
    needMore: unseenLeft < core.LOW_STOCK && ai.length < core.AI_BUCKET_CAP,
    commitSeen: () => {
      const buckets = { ...(seenDoc.buckets || {}) };
      buckets[bucket] = core.markSeen(buckets[bucket], item.id);
      tx.set(db.collection("duel_seen").doc(uid), { buckets, updatedAt: Date.now() });
    },
  };
};

// Pede à background function uma leva nova para aquele cat/nível.
// Trava de 10 min no próprio doc do banco evita pedidos repetidos
// enquanto a IA ainda está gerando.
const requestMore = async (db, bucket) => {
  const ref = db.collection("duel_bank").doc(bucket);
  let go = false;
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const d = s.exists ? s.data() : {};
    if ((d.items || []).length >= core.AI_BUCKET_CAP) return;
    if (d.generatingSince && Date.now() - d.generatingSince < 10 * 60000) return;
    tx.set(ref, { generatingSince: Date.now() }, { merge: true });
    go = true;
  }).catch(() => {});
  if (!go) return;
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  if (!base) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    // Aguardado de propósito: na Netlify, fetch "solto" pode não sair
    // (mesmo motivo registrado no fred-explains).
    await fetch(`${base}/.netlify/functions/duel-bank-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket, signature: signScoped("duel-bank", bucket) }),
      signal: ctrl.signal,
    });
  } catch (e) { console.error("duel: falha ao pedir perguntas", bucket, e?.message); }
  finally { clearTimeout(t); }
};

// ── Visão "eu" (perfil de duelista) ──────────────────────────
const meView = (uid, user, player) => {
  const p = player || {};
  const lv = core.levelFrom(user && user.gamification, p.levelChoice);
  const trophies = p.trophies || 0;
  const league = core.leagueFor(trophies);
  const next = core.LEAGUES.find((l) => l.min > trophies) || null;
  const day = core.spDay(Date.now());
  const daily = p.daily && p.daily.day === day ? p.daily : { day, xp: 0, fr: 0 };
  return {
    uid, level: lv.level, levelSource: lv.source, needLevel: !lv.level,
    trophies, league, nextLeague: next,
    wins: p.wins || 0, losses: p.losses || 0, draws: p.draws || 0, played: p.played || 0,
    streak: p.streak || 0, bestStreak: p.bestStreak || 0, crownsTotal: p.crownsTotal || 0,
    catStats: p.catStats || {}, daily, dailyCap: core.DAILY_CAP,
    balance: core.round2((user && user.gamification && user.gamification.frBalance) || 0),
    xp: (user && user.gamification && user.gamification.xp) || 0,
  };
};

// ════════════════════════════════════════════════════════════════
// AÇÕES
// ════════════════════════════════════════════════════════════════
const actions = {};

actions.hub = async (db, uid) => {
  const [userSnap, playerSnap, duels] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("duel_players").doc(uid).get(),
    myDuels(db, uid),
  ]);
  const now = Date.now();
  const list = [];
  for (const d of duels) {
    if (isOpen(d) && d.deadline && now > d.deadline) list.push(await sweepDuel(db, d.id));
    else list.push(d);
  }
  // Recarrega o perfil se a varredura pagou algum prêmio.
  const changed = list.some((d, i) => d && d.status !== duels[i].status);
  const [u2, p2] = changed
    ? await Promise.all([db.collection("users").doc(uid).get(), db.collection("duel_players").doc(uid).get()])
    : [userSnap, playerSnap];
  const finished = list.filter((d) => d && !isOpen(d)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 15);
  const open = list.filter((d) => d && isOpen(d));
  return { me: meView(uid, u2.data(), p2.exists ? p2.data() : null), duels: [...open, ...finished] };
};

actions.get = async (db, uid, body) => {
  const d = await sweepDuel(db, String(body.duelId || ""));
  if (!d || !d.players.includes(uid)) throw new DuelError("Duelo não encontrado.", "NOT_FOUND", 404);
  return { duel: d };
};

actions.setLevel = async (db, uid, body) => {
  if (!core.LEVELS.includes(body.level)) throw new DuelError("Nível inválido.");
  const user = (await db.collection("users").doc(uid).get()).data() || {};
  const lv = core.levelFrom(user.gamification, null);
  if (lv.level) throw new DuelError("Seu nível já vem do nivelamento.");
  await db.collection("duel_players").doc(uid).set({ levelChoice: body.level, updatedAt: Date.now() }, { merge: true });
  const p = (await db.collection("duel_players").doc(uid).get()).data();
  return { me: meView(uid, user, p) };
};

actions.search = async (db, uid, body) => {
  const q = String(body.q || "").trim().toLowerCase().replace(/^@/, "");
  const users = (await allUsers(db)).filter((u) => u.uid !== uid && isApproved(u) && u.accessStatus !== "blocked");
  let found;
  if (q.length >= 2) {
    found = users.filter((u) =>
      String(u.username || "").toLowerCase().replace(/^@/, "").includes(q) ||
      String(u.fullName || "").toLowerCase().includes(q));
  } else {
    // Sem busca: sugere quem entrou mais recentemente.
    found = users.filter((u) => !isAdminDoc(u))
      .sort((a, b) => String(b.gamification?.lastLoginDate || "").localeCompare(String(a.gamification?.lastLoginDate || "")));
  }
  return {
    players: found.slice(0, 10).map((u) => ({
      uid: u.uid, username: u.username || "", name: u.fullName || u.username || "Aluno",
      photo: safePhoto(u.profilePhoto), level: core.levelFrom(u.gamification, null).level,
    })),
  };
};

actions.create = async (db, uid, body) => {
  const stake = Number(body.stake || 0);
  if (!core.STAKES.includes(stake)) throw new DuelError("Aposta inválida.");
  const mine = await myDuels(db, uid);
  if (mine.filter(isOpen).length >= core.MAX_OPEN_DUELS) {
    throw new DuelError(`Você já tem ${core.MAX_OPEN_DUELS} duelos abertos. Termine algum antes de começar outro.`);
  }

  // Quem é o adversário?
  let opponentId = body.opponentId ? String(body.opponentId) : null;
  const busyWith = new Set(mine.filter(isOpen).flatMap((d) => d.players));
  if (body.random) {
    const users = (await allUsers(db)).filter((u) => u.uid !== uid && isApproved(u) && u.accessStatus !== "blocked" && !isAdminDoc(u) && !busyWith.has(u.uid));
    const cutoff = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
    const recent = users.filter((u) => String(u.gamification?.lastLoginDate || "") >= cutoff);
    const pool = recent.length ? recent : users;
    if (!pool.length) throw new DuelError("Não achamos um adversário disponível agora. Tente convidar alguém pelo @.");
    opponentId = pool[Math.floor(Math.random() * pool.length)].uid;
  }
  if (!opponentId || opponentId === uid) throw new DuelError("Escolha um adversário.");
  if (busyWith.has(opponentId)) {
    const existing = mine.find((d) => isOpen(d) && d.players.includes(opponentId));
    throw new DuelError("Vocês já têm um duelo aberto. Termine esse antes de começar outro.", "ALREADY_OPEN", 409, existing && existing.id);
  }
  const oppDuels = await myDuels(db, opponentId);
  if (oppDuels.filter(isOpen).length >= core.MAX_OPEN_DUELS) throw new DuelError("Esse adversário está com a agenda de duelos cheia. Tente outra pessoa.");

  const id = randomUUID();
  const now = Date.now();
  let duel;
  await db.runTransaction(async (tx) => {
    // Trava por dupla de jogadores: sem ela, um clique duplo abria dois
    // convites (e cobrava duas apostas) antes de qualquer um ser gravado.
    const pairRef = db.collection("duel_pairs").doc([uid, opponentId].sort().join("_"));
    const pairSnap = await tx.get(pairRef);
    const openId = pairSnap.exists ? pairSnap.data().duelId : null;
    if (openId) {
      const prev = await tx.get(db.collection("duels").doc(openId));
      if (prev.exists && isOpen(prev.data())) throw new DuelError("Vocês já têm um duelo aberto. Termine esse antes de começar outro.", "ALREADY_OPEN", 409, openId);
    }
    const ctx = await readCtx(tx, db, [uid, opponentId]);
    const me = ctx.users[uid], opp = ctx.users[opponentId];
    if (!me) throw new DuelError("Perfil não encontrado.", "NOT_FOUND", 404);
    if (!opp || !isApproved(opp) || opp.accessStatus === "blocked") throw new DuelError("Adversário não encontrado.");
    const myInfo = infoOf(uid, me, ctx.players[uid]);
    if (!myInfo.level) throw new DuelError("Antes do primeiro duelo, conte pra gente o seu nível.", "NEED_LEVEL");
    if (stake > 0) {
      const bal = (me.gamification && me.gamification.frBalance) || 0;
      if (bal < stake) throw new DuelError(`Saldo insuficiente para apostar FR$ ${stake}.`);
      addFr(me, -stake);
      writeCtx(tx, db, ctx, { users: [uid] });
    }
    duel = core.newDuel({ id, creator: uid, opponent: opponentId, stake, now,
      info: { [uid]: myInfo, [opponentId]: infoOf(opponentId, opp, ctx.players[opponentId]) } });
    tx.set(db.collection("duels").doc(id), duel);
    tx.set(pairRef, { duelId: id, at: now });
  });
  return { duel };
};

actions.respond = async (db, uid, body) => {
  const ref = db.collection("duels").doc(String(body.duelId || ""));
  let duel;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DuelError("Convite não encontrado.", "NOT_FOUND", 404);
    const d = snap.data();
    if (d.status !== "invited" || d.players[1] !== uid) throw new DuelError("Esse convite não está mais aberto.");
    const ctx = await readCtx(tx, db, d.players);
    const now = Date.now();
    if (now > d.expiresAt) {
      core.sweep(d, now); refundCreator(d, ctx);
      writeCtx(tx, db, ctx, { users: [d.players[0]] }); tx.set(ref, d); duel = d; return;
    }
    if (!body.accept) {
      d.status = "declined"; d.updatedAt = now; core.syncDeadline(d);
      refundCreator(d, ctx);
      writeCtx(tx, db, ctx, { users: [d.players[0]] });
      tx.set(ref, d); duel = d; return;
    }
    const me = ctx.users[uid];
    const myInfo = infoOf(uid, me, ctx.players[uid]);
    if (!myInfo.level) throw new DuelError("Antes do primeiro duelo, conte pra gente o seu nível.", "NEED_LEVEL");
    if (d.stake > 0) {
      const bal = (me.gamification && me.gamification.frBalance) || 0;
      if (bal < d.stake) throw new DuelError(`Esse duelo tem aposta de FR$ ${d.stake} e seu saldo não cobre.`);
      addFr(me, -d.stake);
      writeCtx(tx, db, ctx, { users: [uid] });
    }
    d.info[uid] = myInfo;
    // Atualiza o nível de quem convidou (pode ter feito nivelamento
    // entre o convite e o aceite).
    const creatorInfo = infoOf(d.players[0], ctx.users[d.players[0]], ctx.players[d.players[0]]);
    if (creatorInfo.level) d.info[d.players[0]] = creatorInfo;
    core.accept(d, now);
    tx.set(ref, d); duel = d;
  });
  return { duel };
};

actions.cancel = async (db, uid, body) => {
  const ref = db.collection("duels").doc(String(body.duelId || ""));
  let duel;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DuelError("Duelo não encontrado.", "NOT_FOUND", 404);
    const d = snap.data();
    if (d.status !== "invited" || d.players[0] !== uid) throw new DuelError("Esse convite não pode mais ser cancelado.");
    const ctx = await readCtx(tx, db, [uid]);
    d.status = "cancelled"; d.updatedAt = Date.now(); core.syncDeadline(d);
    refundCreator(d, ctx);
    writeCtx(tx, db, ctx, { users: [uid] });
    tx.set(ref, d); duel = d;
  });
  return { duel };
};

// Confere se é a minha vez numa fase específica.
const assertMyTurn = (d, uid, phase) => {
  if (!d.players.includes(uid)) throw new DuelError("Duelo não encontrado.", "NOT_FOUND", 404);
  if (d.status !== "active") throw new DuelError("Esse duelo já terminou.", "STALE", 409);
  if (d.turn !== uid) throw new DuelError("Não é a sua vez.", "STALE", 409);
  if (phase && d.phase !== phase) throw new DuelError("Essa jogada já foi feita.", "STALE", 409);
};

actions.spin = async (db, uid, body) => {
  const duelId = String(body.duelId || "");
  await sweepDuel(db, duelId);
  const ref = db.collection("duels").doc(duelId);
  let out, needMore = null;
  await db.runTransaction(async (tx) => {
    out = undefined; needMore = null;
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DuelError("Duelo não encontrado.", "NOT_FOUND", 404);
    const d = snap.data();
    assertMyTurn(d, uid, "spin");
    const now = Date.now();
    const slot = core.spinSlot();
    const res = core.applySpin(d, uid, slot, now);
    if (res.kind === "question") {
      const level = d.info[uid].level || "A1";
      const pick = await pickFor(tx, db, uid, res.cat, level);
      core.setQuestion(d, { kind: "normal", cat: res.cat, level, pub: pick.shuffled.pub, now, delayMs: core.SPIN_ANIM_MS });
      tx.set(db.collection("duel_secrets").doc(d.id), { answer: pick.shuffled.answer, explain: pick.shuffled.explain, qid: pick.item.id, n: d.question.n });
      pick.commitSeen();
      if (pick.needMore) needMore = pick.bucket;
    }
    core.syncDeadline(d);
    tx.set(ref, d);
    out = { slot, target: core.WHEEL[slot], duel: d };
  });
  if (needMore) await requestMore(db, needMore);
  return out;
};

actions.pickCrown = async (db, uid, body) => {
  const duelId = String(body.duelId || "");
  await sweepDuel(db, duelId);
  const ref = db.collection("duels").doc(duelId);
  let out, needMore = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DuelError("Duelo não encontrado.", "NOT_FOUND", 404);
    const d = snap.data();
    out = undefined; needMore = null;
    assertMyTurn(d, uid, "crown_pick");
    const cat = String(body.cat || "");
    const level = d.info[uid].level || "A1";
    const pick = core.availableCrowns(d, uid).includes(cat) ? await pickFor(tx, db, uid, cat, level) : null;
    if (!pick || !core.applyCrownPick(d, uid, cat)) throw new DuelError("Escolha uma categoria que você ainda não conquistou.");
    const now = Date.now();
    core.setQuestion(d, { kind: "crown", cat, level, pub: pick.shuffled.pub, now });
    tx.set(db.collection("duel_secrets").doc(d.id), { answer: pick.shuffled.answer, explain: pick.shuffled.explain, qid: pick.item.id, n: d.question.n });
    pick.commitSeen();
    if (pick.needMore) needMore = pick.bucket;
    tx.set(ref, d);
    out = { duel: d };
  });
  if (needMore) await requestMore(db, needMore);
  return out;
};

actions.answer = async (db, uid, body) => {
  const ref = db.collection("duels").doc(String(body.duelId || ""));
  let out, after = null, final = null;
  await db.runTransaction(async (tx) => {
    out = undefined; after = null; final = null;
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DuelError("Duelo não encontrado.", "NOT_FOUND", 404);
    const d = snap.data();
    // Resposta repetida (clique duplo, rede lenta): devolve o que já
    // foi decidido em vez de dar erro.
    if (d.lastResult && d.lastResult.uid === uid && d.lastResult.n === Number(body.n)) {
      out = { result: d.lastResult, event: d.lastResult.event || "repeat", repeat: true, duel: d }; return;
    }
    assertMyTurn(d, uid, "question");
    if (Number(body.n) !== d.question.n) throw new DuelError("Essa pergunta já foi respondida.", "STALE", 409);
    const secretRef = db.collection("duel_secrets").doc(d.id);
    const secretSnap = await tx.get(secretRef);
    const ctx = await readCtx(tx, db, d.players);
    const secret = secretSnap.exists ? secretSnap.data() : null;
    const now = Date.now();
    const choice = Number.isInteger(body.choice) ? body.choice : -1;
    const timedOut = now > d.question.deadline;
    const ok = !!secret && !timedOut && choice === secret.answer;
    const event = core.applyAnswer(d, uid, {
      ok, choice: timedOut ? -1 : choice,
      correctIndex: secret ? secret.answer : null, explain: secret ? secret.explain : null,
      qid: secret ? secret.qid : null,
    }, now);
    d.lastResult.event = event;
    if (d.status === "finished") {
      after = settle(d, ctx, now);
      writeCtx(tx, db, ctx, { users: d.players, players: d.players });
      final = d;
    }
    tx.delete(secretRef);
    tx.set(ref, d);
    out = { result: d.lastResult, event, timedOut, duel: d };
  });
  if (after && after.length) await afterSettle(db, final, after, Date.now());
  return out;
};

actions.help = async (db, uid, body) => {
  const kind = body.kind;
  if (!["fifty", "skip"].includes(kind)) throw new DuelError("Ajuda inválida.");
  const ref = db.collection("duels").doc(String(body.duelId || ""));
  let out, needMore = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DuelError("Duelo não encontrado.", "NOT_FOUND", 404);
    const d = snap.data();
    out = undefined; needMore = null;
    assertMyTurn(d, uid, "question");
    const now = Date.now();
    if (now > d.question.deadline) throw new DuelError("O tempo dessa pergunta acabou.", "STALE", 409);
    const helps = d.helps[uid] || {};
    if (!(helps[kind] > 0)) throw new DuelError("Você já usou essa ajuda neste duelo.");
    const secretRef = db.collection("duel_secrets").doc(d.id);
    const secretSnap = await tx.get(secretRef);
    if (!secretSnap.exists) throw new DuelError("Pergunta não encontrada.", "STALE", 409);
    const secret = secretSnap.data();
    if (kind === "fifty") {
      if ((d.question.removed || []).length) throw new DuelError("As alternativas já foram reduzidas.");
      d.question.removed = core.fiftyFifty(secret.answer);
    } else {
      const q = d.question;
      const pick = await pickFor(tx, db, uid, q.cat, q.level, secret.qid);
      core.setQuestion(d, { kind: q.kind, cat: q.cat, level: q.level, pub: pick.shuffled.pub, now });
      tx.set(secretRef, { answer: pick.shuffled.answer, explain: pick.shuffled.explain, qid: pick.item.id, n: d.question.n });
      pick.commitSeen();
      if (pick.needMore) needMore = pick.bucket;
    }
    helps[kind] -= 1;
    d.helps[uid] = helps;
    d.updatedAt = now;
    tx.set(ref, d);
    out = { duel: d };
  });
  if (needMore) await requestMore(db, needMore);
  return out;
};

actions.forfeit = async (db, uid, body) => {
  const duelId = String(body.duelId || "");
  const cur = await sweepDuel(db, duelId);
  if (!cur || !cur.players.includes(uid)) throw new DuelError("Duelo não encontrado.", "NOT_FOUND", 404);
  if (cur.status === "invited") {
    return cur.players[0] === uid ? actions.cancel(db, uid, body) : actions.respond(db, uid, { duelId, accept: false });
  }
  const ref = db.collection("duels").doc(duelId);
  let out, after = null;
  await db.runTransaction(async (tx) => {
    out = undefined; after = null;
    const snap = await tx.get(ref);
    const d = snap.data();
    if (d.status !== "active") { out = { duel: d }; return; }
    const ctx = await readCtx(tx, db, d.players);
    const now = Date.now();
    core.finish(d, core.other(d, uid), "forfeit", now);
    after = settle(d, ctx, now);
    writeCtx(tx, db, ctx, { users: d.players, players: d.players });
    tx.delete(db.collection("duel_secrets").doc(d.id));
    tx.set(ref, d);
    out = { duel: d };
  });
  if (after && after.length) await afterSettle(db, out.duel, after, Date.now());
  return out;
};

actions.report = async (db, uid, body) => {
  const qid = String(body.qid || "").slice(0, 80);
  if (!qid) throw new DuelError("Pergunta inválida.");
  await db.collection("duel_reports").doc(randomUUID()).set({
    qid, uid, duelId: String(body.duelId || "").slice(0, 80),
    reason: String(body.reason || "").slice(0, 300), at: Date.now(),
  });
  return { ok: true };
};

// ════════════════════════════════════════════════════════════════
exports._internals = { settle, addXpFr, meView, infoOf };

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
    // Conta bloqueada ou não aprovada não joga.
    const me = await db.collection("users").doc(uid).get();
    if (!me.exists || !isApproved(me.data())) return { statusCode: 403, headers, body: JSON.stringify({ error: "Acesso não liberado." }) };
    const result = await fn(db, uid, body);
    // serverNow: o app usa para acertar o cronômetro mesmo se o relógio
    // do celular estiver adiantado/atrasado.
    return { statusCode: 200, headers, body: JSON.stringify({ ...result, serverNow: Date.now() }) };
  } catch (e) {
    if (e instanceof DuelError) {
      return { statusCode: e.status, headers, body: JSON.stringify({ error: e.message, code: e.code, duelId: e.duelId || undefined }) };
    }
    console.error("duel:", body.action, e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Algo deu errado no duelo. Tente de novo." }) };
  }
};
