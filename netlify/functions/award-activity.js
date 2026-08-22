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
const { weekKeyOf, monthKeyOf, SOURCE_TAG } = require("./lib/ranking-core");

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

// ── Helpers de período ────────────────────────────────────────
// Vêm de lib/ranking-core.js e são calculados no horário de
// Brasília, igual ao que o navegador do aluno faz. Antes rodavam em
// UTC: nos domingos, das 21h à meia-noite, o servidor já achava que
// era segunda e zerava o XP semanal do aluno antes da hora.
const getWeekKey = (date = new Date()) => weekKeyOf(date.getTime());
const getMonthKey = (date = new Date()) => monthKeyOf(date.getTime());
const getYearKey = (date = new Date()) => `${new Date(date.getTime() - 3 * 3600000).getUTCFullYear()}`;

// A apuração do Top 3 (Hall da Fama) NÃO acontece mais aqui.
// Ela saía dos contadores weeklyXp/monthlyXp, que esta mesma
// transação acabara de zerar — o campeão sumia do próprio pódio, e
// quando a foto saía dias depois ela misturava semanas diferentes.
// Agora quem apura é ranking-snapshot-background.js, somando a
// coleção `history`. Aqui só avisamos que há período a fechar.
const DIA_MS = 86400000;
let jaConferiuPendencia = false;

const urlDaApuracao = () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  return base ? `${base}/.netlify/functions/ranking-snapshot-background` : null;
};

const dispararApuracao = async (windowDays) => {
  const url = urlDaApuracao();
  if (!url) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    // Background function: responde 202 na hora, não segura o aluno.
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windowDays }),
      signal: ctrl.signal,
    });
  } catch { /* melhor esforço — a rotina diária cobre de qualquer jeito */ }
  finally { clearTimeout(t); }
};

// Falta fechar a última semana encerrada? (1 leitura barata, e só
// na primeira atividade de cada instância da função)
const faltaFecharSemana = async (db) => {
  if (jaConferiuPendencia) return false;
  jaConferiuPendencia = true;
  try {
    const chave = weekKeyOf(Date.now() - 7 * DIA_MS);
    const snap = await db.collection("ranking_snapshots").doc(`weekly_${chave}`).get();
    return !snap.exists || (snap.data() || {}).source !== SOURCE_TAG;
  } catch {
    return false;
  }
};

// ── Assinatura de uma atividade (identidade para o "1ª vez") ──
const normalizeTopic = (t) => String(t || "").toLowerCase().trim();
const signatureOf = (a) => `${a.type}|${a.level}|${a.theme}|${normalizeTopic(a.topic)}`;

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
    // Virou semana/mês para este aluno, ou o fechamento anterior
    // ficou pendente? Manda apurar em segundo plano.
    if (rollovers.length > 0 || (await faltaFecharSemana(db))) {
      await dispararApuracao(rollovers.length > 0 ? 70 : 400);
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
