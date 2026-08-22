// ============================================================
// FREEDOMAPP — Function: award-activity
// ------------------------------------------------------------
// Concede XP/Freedom Coins de uma atividade concluída, do lado
// do SERVIDOR, para que o aluno não possa forjar pontos.
//
// Regras de negócio (todas aplicadas AQUI, nunca confiando no
// cliente):
//   1) A identidade do aluno vem do token de login (Firebase ID
//      token), não de um campo enviado pelo navegador.
//   2) O XP é calculado a partir da nota (acerto %), no máximo
//      100 por atividade.
//   3) "Só na primeira vez": se o aluno JÁ tem essa atividade no
//      histórico (mesma assinatura tipo|nível|tema|tópico), a
//      repetição — pelo botão "Refazer" ou pela aba Histórico —
//      concede 0 XP e 0 moedas.
//   4) Teto diário de 800 XP.
//
// Também grava o registro no histórico (fonte confiável) e
// atualiza desafios ativos. Na virada de semana/mês salva o
// snapshot do ranking com trava "criar-se-não-existir" (corrige
// o bug de sobrescrita/notificação duplicada — B7).
//
// Molde de Admin SDK/env herdado de placement-background.js.
// ============================================================

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { randomUUID } = require("crypto");

const DAILY_XP_LIMIT = 800;

const ALLOWED_ORIGINS = [
  "https://freedom.app.br",
  "https://www.freedom.app.br",
  "http://localhost:3000",
  "http://localhost:5173",
];

const buildHeaders = (origin) => {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
};

// ── Firebase Admin (mesmo molde/env do placement-background) ──
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

// ── Helpers de período (espelham services/api.ts, em UTC) ─────
const getWeekKey = (date = new Date()) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
};
const getMonthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const getYearKey = (date = new Date()) => `${date.getFullYear()}`;

const getWeekLabel = (weekKey) => {
  const [year, week] = weekKey.split("-W");
  return `Semana ${week} • ${year}`;
};
const getMonthLabel = (monthKey) => {
  const [year, month] = monthKey.split("-");
  const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
};
const getCongratulationsMessage = (position, weekLabel, xp) => {
  const xpFormatted = Number(xp).toLocaleString("pt-BR");
  if (position === 1) return `🏆 Você foi o CAMPEÃO da ${weekLabel}! Incrível — você acumulou ${xpFormatted} XP e liderou todos os alunos da Freedom. Sua dedicação é inspiradora. Continue assim e conquiste mais uma semana no topo! 🚀`;
  if (position === 2) return `🥈 Parabéns! Você ficou em 2º lugar na ${weekLabel}, acumulando ${xpFormatted} XP. Você foi incrível essa semana! Está muito perto do topo — mais uma semana de foco e a coroa é sua! 💪`;
  return `🥉 Que semana fantástica! Você ficou em 3º lugar na ${weekLabel} com ${xpFormatted} XP. Seu esforço está valendo a pena — continue praticando e logo você estará no topo do ranking! ⭐`;
};

// ── Assinatura de uma atividade (identidade para o "1ª vez") ──
const normalizeTopic = (t) => String(t || "").toLowerCase().trim();
const signatureOf = (a) => `${a.type}|${a.level}|${a.theme}|${normalizeTopic(a.topic)}`;

// ── Snapshot do ranking na virada de período, com trava de
//    "criar-se-não-existir" (impede sobrescrita e notificação
//    duplicada quando vários alunos viram o período) ───────────
const maybeSaveSnapshot = async (db, period, periodKey) => {
  const snapId = `${period}_${periodKey}`;
  const ref = db.collection("ranking_snapshots").doc(snapId);
  const existing = await ref.get();
  if (existing.exists) return; // já foi salvo por outro aluno — não duplica

  const usersSnap = await db.collection("users").get();
  const sorted = usersSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => (u.username || "").toLowerCase() !== "admin")
    .map((u) => {
      const g = u.gamification || {};
      return {
        user: u,
        periodXp: period === "weekly" ? (g.weeklyXp || 0) : (g.monthlyXp || 0),
        activities: period === "weekly" ? (g.weeklyActivities || 0) : (g.monthlyActivities || 0),
      };
    })
    .filter((u) => u.periodXp > 0)
    .sort((a, b) => b.periodXp - a.periodXp || b.activities - a.activities);

  if (sorted.length === 0) return;

  const top3 = sorted.slice(0, 3).map((item, index) => ({
    userId: item.user.userId || item.user.id,
    username: item.user.username,
    fullName: item.user.fullName,
    profilePhoto: item.user.profilePhoto,
    xp: item.periodXp,
    activitiesCount: item.activities,
    position: index + 1,
  }));

  const label = period === "weekly" ? getWeekLabel(periodKey) : getMonthLabel(periodKey);
  const snapshot = {
    id: snapId, period, label,
    startDate: periodKey,
    endDate: new Date().toISOString().split("T")[0],
    top3, savedAt: Date.now(),
  };

  // create() falha se o doc passou a existir no meio do caminho
  // (outro aluno virou o período ao mesmo tempo) — trava a corrida.
  try {
    await ref.create(snapshot);
  } catch {
    return; // criado por outro processo — não notifica de novo
  }

  if (period === "weekly") {
    for (const entry of top3) {
      try {
        const uRef = db.collection("users").doc(entry.userId);
        const uSnap = await uRef.get();
        if (!uSnap.exists) continue;
        const u = uSnap.data();
        u.gamification = u.gamification || {};
        u.gamification.weeklyBadge = { position: entry.position, weekLabel: label, xp: entry.xp, awardedAt: Date.now() };
        if (!u.notifications) u.notifications = [];
        u.notifications.unshift({
          id: randomUUID(),
          message: getCongratulationsMessage(entry.position, label, entry.xp),
          date: Date.now(), read: false, sender: "🏆 Freedom Ranking",
        });
        await uRef.set(u);
      } catch (e) {
        console.error("Erro ao notificar Top 3:", e);
      }
    }
  }
};

// ── Atualiza desafios ativos do aluno com o XP concedido ──────
const updateChallenges = async (db, uid, awardedXp) => {
  if (awardedXp <= 0) return; // repetição não move desafio
  const snap = await db.collection("challenges").get();
  const now = Date.now();
  for (const d of snap.docs) {
    const c = d.data();
    if (c.status !== "active" || !(c.participantIds || []).includes(uid)) continue;
    if (now > c.endDate) {
      c.status = "closed";
      const participants = (c.participantIds || [])
        .map((pid) => ({ id: pid, xp: (c.participantStats?.[pid]?.xpGained) || 0 }))
        .sort((a, b) => b.xp - a.xp);
      c.winnerId = participants[0]?.id;
    } else {
      if (!c.participantStats) c.participantStats = {};
      if (!c.participantStats[uid]) c.participantStats[uid] = { xpGained: 0, activitiesDone: 0 };
      c.participantStats[uid].xpGained += awardedXp;
      c.participantStats[uid].activitiesDone += 1;
    }
    await db.collection("challenges").doc(c.id).set(c);
  }
};

exports.handler = async (event) => {
  const origin = event.headers.origin || "";
  const headers = buildHeaders(origin);

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Método não permitido" }) };

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Configuração de servidor incompleta." }) };
  }

  const { db, auth } = initFirebase();

  // ── 1) Identidade confiável a partir do token ──────────────
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: "Não autenticado." }) };
  let uid;
  try {
    const decoded = await auth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Sessão inválida. Faça login novamente." }) };
  }

  // ── 2) Entrada da atividade ─────────────────────────────────
  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido." }) }; }
  const { level, theme, topic, type, score, total } = body || {};
  if (!["quiz", "writing"].includes(type)) return { statusCode: 400, headers, body: JSON.stringify({ error: "Tipo de atividade inválido." }) };
  const s = Number(score), t = Number(total);
  if (!Number.isFinite(s) || !Number.isFinite(t) || t <= 0 || s < 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Nota inválida." }) };
  }
  const rawXp = Math.min(100, Math.round(Math.min(1, s / t) * 100));
  const sig = signatureOf({ type, level, theme, topic });

  try {
    // ── 3) "Só na primeira vez": já existe no histórico? ──────
    const histSnap = await db.collection("history").where("userId", "==", uid).get();
    let isRepeat = false;
    histSnap.forEach((d) => {
      const h = d.data();
      const hsig = h.signature || `${h.type}|${h.level}|${h.theme}|${normalizeTopic(h.topic)}`;
      if (hsig === sig) isRepeat = true;
    });

    // ── 4) Transação no doc do aluno: XP + teto diário ────────
    const userRef = db.collection("users").doc(uid);
    let rollovers = [];
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new Error("USER_NOT_FOUND");
      const user = snap.data();
      const g = user.gamification || {};
      const now = new Date();
      const today = now.toISOString().split("T")[0];

      if (g.lastXpGainDate !== today) { g.dailyXpEarned = 0; g.lastXpGainDate = today; }
      const remaining = Math.max(0, DAILY_XP_LIMIT - (g.dailyXpEarned || 0));
      const awardedXp = isRepeat ? 0 : Math.min(rawXp, remaining);
      const frGain = awardedXp / 100;

      // Virada de período (reseta contadores; snapshot é salvo fora da transação)
      const wk = getWeekKey(now), mk = getMonthKey(now), yk = getYearKey(now);
      rollovers = [];
      if (g.lastWeekKey && g.lastWeekKey !== wk) { rollovers.push(["weekly", g.lastWeekKey]); g.weeklyXp = 0; g.weeklyActivities = 0; }
      if (g.lastMonthKey && g.lastMonthKey !== mk) { rollovers.push(["monthly", g.lastMonthKey]); g.monthlyXp = 0; g.monthlyActivities = 0; }
      if (g.lastYearKey && g.lastYearKey !== yk) { g.yearlyXp = 0; }

      g.xp = (g.xp || 0) + awardedXp;
      g.frBalance = (g.frBalance || 0) + frGain;
      g.dailyXpEarned = (g.dailyXpEarned || 0) + awardedXp;

      // Contadores de atividade e de período só contam quando há prêmio
      // (repetição = prática livre, sem mexer em ranking/tiebreak).
      if (!isRepeat) {
        g.weeklyXp = (g.weeklyXp || 0) + awardedXp;
        g.monthlyXp = (g.monthlyXp || 0) + awardedXp;
        g.yearlyXp = (g.yearlyXp || 0) + awardedXp;
        g.weeklyActivities = (g.weeklyActivities || 0) + 1;
        g.monthlyActivities = (g.monthlyActivities || 0) + 1;
        g.totalActivities = (g.totalActivities || 0) + 1;
      }
      g.lastWeekKey = wk; g.lastMonthKey = mk; g.lastYearKey = yk;

      user.gamification = g;
      tx.set(userRef, user);
      return { totalXp: g.xp, xpGained: awardedXp, frGained: frGain, totalFr: g.frBalance, isRepeat };
    });

    // ── 5) Registro no histórico (fonte confiável) ────────────
    const record = {
      id: randomUUID(), userId: uid, date: Date.now(),
      level, theme, topic, score: s, total: t, type,
      xpGained: result.xpGained, frGained: result.frGained, signature: sig,
    };
    await db.collection("history").doc(record.id).set(record);

    // ── 6) Efeitos colaterais (fora da transação) ─────────────
    for (const [period, key] of rollovers) {
      try { await maybeSaveSnapshot(db, period, key); } catch (e) { console.error("snapshot:", e); }
    }
    try { await updateChallenges(db, uid, result.xpGained); } catch (e) { console.error("challenges:", e); }

    return { statusCode: 200, headers, body: JSON.stringify({ ...result, record }) };
  } catch (error) {
    console.error("Erro em award-activity:", error);
    if (String(error.message).includes("USER_NOT_FOUND")) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Usuário não encontrado." }) };
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Erro ao registrar a atividade." }) };
  }
};
