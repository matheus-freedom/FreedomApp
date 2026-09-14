// ============================================================
// FREEDOMAPP — Function: fred-explains
// ------------------------------------------------------------
// Porta de entrada do "Fred explica" (aulas de gramática na voz do
// Fred). É a function SÍNCRONA (26s): responde rápido e nunca chama
// a IA diretamente — quem gera é a fred-explains-background.
//
// Ações (campo "action" do body):
//   get        → devolve a aula pronta do banco (fred_lessons/{id}).
//                Se ainda não existe, cria o "pedido" e dispara a
//                geração em segundo plano; o front acompanha o doc
//                em tempo real (onSnapshot) e a aula aparece sozinha.
//   complete   → recebe as respostas do checkpoint final, corrige
//                NO SERVIDOR e dá o XP (uma vez por tema).
//   feedback   → 👍/👎 do aluno sobre a aula (qualidade).
//   regenerate → (admin) apaga e gera de novo uma aula ruim.
//
// Economia de créditos: cada tema é gerado UMA vez para a escola
// inteira. O primeiro aluno que pede espera ~1 minuto; todos os
// outros abrem na hora. O catálogo tem ~117 temas, então o gasto
// máximo desta funcionalidade é fixo e pequeno.
// ============================================================

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { randomUUID } = require("crypto");
const { resolveLesson, scoreFinalQuiz, publicLesson, LESSON_XP } = require("./lib/fred-core");
const { signScoped } = require("./lib/journey-sign");

// Mesmo teto diário de XP do award-activity: a aula entra na conta.
const DAILY_XP_LIMIT = 800;
// Quantas gerações fracassadas antes de desistir de um tema (e avisar
// o aluno para reportar). Evita looping de tentativas pagas.
const MAX_ATTEMPTS = 3;
// Um pedido "em geração" mais velho que isto é considerado travado
// (a background function morreu no meio) e pode ser disparado de novo.
const STALE_MS = 6 * 60 * 1000;

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

const reply = (headers, statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

// ── Dispara a geração (fire-and-forget, assinada) ─────────────
const triggerGeneration = (id, force = false) => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  if (!base) { console.error("fred-explains: sem URL base para disparar a geração"); return false; }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2000);
  fetch(`${base}/.netlify/functions/fred-explains-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, force, signature: signScoped("fred-lesson", id) }),
    signal: ctrl.signal,
  }).catch(() => { /* melhor esforço: o front re-pede se travar */ }).finally(() => clearTimeout(t));
  return true;
};

// ── Chaves de período (idênticas ao award-activity) ────────────
const { weekKeyOf, monthKeyOf } = require("./lib/ranking-core");
const getYearKey = (d = new Date()) => `${new Date(d.getTime() - 3 * 3600000).getUTCFullYear()}`;

// ── Ação: get ─────────────────────────────────────────────────
const handleGet = async (db, uid, entry, headers) => {
  const ref = db.collection("fred_lessons").doc(entry.id);
  const progRef = db.collection("fred_progress").doc(uid);
  const snap = await ref.get();
  const now = Date.now();

  // Marca "abriu" no progresso do aluno (para o catálogo mostrar
  // "em andamento"). Falha aqui não pode derrubar a aula.
  progRef.set({ lessons: { [entry.id]: { openedAt: now } } }, { merge: true }).catch(() => {});

  if (snap.exists) {
    const d = snap.data();
    if (d.status === "ready" && d.content) {
      const prog = (await progRef.get().catch(() => null))?.data()?.lessons?.[entry.id] || null;
      return reply(headers, 200, { status: "ready", id: entry.id, lesson: publicLesson(d.content), model: d.model || null, progress: prog });
    }
    if (d.status === "generating") {
      // Geração travada? Dispara de novo.
      if (now - (d.updatedAt || d.createdAt || 0) > STALE_MS) {
        await ref.set({ updatedAt: now }, { merge: true });
        triggerGeneration(entry.id);
      }
      return reply(headers, 200, { status: "generating", id: entry.id });
    }
    // status === "error"
    if ((d.attempts || 0) >= MAX_ATTEMPTS) {
      return reply(headers, 200, { status: "failed", id: entry.id, error: "O Fred tentou algumas vezes e não conseguiu preparar esta aula. Avise o professor, por favor." });
    }
    await ref.set({ status: "generating", updatedAt: now }, { merge: true });
    triggerGeneration(entry.id);
    return reply(headers, 200, { status: "generating", id: entry.id });
  }

  // Primeira vez que alguém pede este tema: registra o pedido. create()
  // falha se outro aluno pediu no mesmo instante — aí só acompanhamos.
  try {
    await ref.create({
      id: entry.id, level: entry.level, topic: entry.topic,
      status: "generating", attempts: 0, requestedBy: uid, createdAt: now, updatedAt: now,
    });
  } catch (e) {
    const isRace = e?.code === 6 || e?.code === "already-exists" || String(e?.message || "").includes("already exists");
    if (!isRace) throw e;
    return reply(headers, 200, { status: "generating", id: entry.id });
  }
  triggerGeneration(entry.id);
  return reply(headers, 200, { status: "generating", id: entry.id });
};

// ── Ação: complete (checkpoint final → XP) ─────────────────────
const handleComplete = async (db, uid, entry, body, headers) => {
  const lessonSnap = await db.collection("fred_lessons").doc(entry.id).get();
  if (!lessonSnap.exists || lessonSnap.data().status !== "ready") {
    return reply(headers, 400, { error: "Esta aula ainda não está pronta." });
  }
  const result = scoreFinalQuiz(lessonSnap.data().content, body.answers);

  const progRef = db.collection("fred_progress").doc(uid);
  const userRef = db.collection("users").doc(uid);
  const now = Date.now();

  const out = await db.runTransaction(async (tx) => {
    const [progSnap, userSnap] = await Promise.all([tx.get(progRef), tx.get(userRef)]);
    if (!userSnap.exists) throw new Error("USER_NOT_FOUND");
    const prog = progSnap.exists ? progSnap.data() : { lessons: {} };
    const lessons = prog.lessons || {};
    const prev = lessons[entry.id] || {};
    const alreadyCompleted = !!prev.completedAt;

    const next = {
      ...prev,
      attempts: (prev.attempts || 0) + 1,
      bestPct: Math.max(prev.bestPct || 0, result.pct),
      lastPct: result.pct,
      lastAt: now,
    };
    if (result.passed && !alreadyCompleted) next.completedAt = now;

    let xpGained = 0, totalXp = null;
    // XP só na PRIMEIRA aprovação — refazer serve para revisar, não
    // para acumular pontos com o mesmo tema.
    if (result.passed && !alreadyCompleted) {
      const user = userSnap.data();
      const g = user.gamification || {};
      const d = new Date();
      const today = d.toISOString().split("T")[0];
      if (g.lastXpGainDate !== today) { g.dailyXpEarned = 0; g.lastXpGainDate = today; }
      const remaining = Math.max(0, DAILY_XP_LIMIT - (g.dailyXpEarned || 0));
      xpGained = Math.min(LESSON_XP, remaining);

      const wk = weekKeyOf(now), mk = monthKeyOf(now), yk = getYearKey(d);
      if (g.lastWeekKey && g.lastWeekKey !== wk) { g.weeklyXp = 0; g.weeklyActivities = 0; }
      if (g.lastMonthKey && g.lastMonthKey !== mk) { g.monthlyXp = 0; g.monthlyActivities = 0; }
      if (g.lastYearKey && g.lastYearKey !== yk) { g.yearlyXp = 0; }

      g.xp = (g.xp || 0) + xpGained;
      g.dailyXpEarned = (g.dailyXpEarned || 0) + xpGained;
      g.weeklyXp = (g.weeklyXp || 0) + xpGained;
      g.monthlyXp = (g.monthlyXp || 0) + xpGained;
      g.yearlyXp = (g.yearlyXp || 0) + xpGained;
      g.lastWeekKey = wk; g.lastMonthKey = mk; g.lastYearKey = yk;
      user.gamification = g;
      tx.set(userRef, user);
      totalXp = g.xp;
      next.xpAwarded = xpGained;
    }

    lessons[entry.id] = next;
    tx.set(progRef, { lessons, updatedAt: now }, { merge: true });
    return { xpGained, totalXp, alreadyCompleted, progress: next };
  });

  // Registro no histórico para o XP contar no ranking semanal/mensal
  // (a apuração do Hall da Fama lê a coleção history). Só quando houve
  // XP de verdade — repetições não entram.
  if (out.xpGained > 0) {
    const record = {
      id: randomUUID(), userId: uid, date: now,
      level: entry.level, theme: "Gramática", topic: `Fred explica: ${entry.topic}`,
      score: result.score, total: result.total, type: "lesson",
      xpGained: out.xpGained, frGained: 0, signature: `lesson|${entry.id}`,
    };
    await db.collection("history").doc(record.id).set(record).catch((e) => console.error("fred history:", e));
  }

  return reply(headers, 200, { ...result, ...out });
};

// ── Ação: feedback (👍/👎) ─────────────────────────────────────
const handleFeedback = async (db, uid, entry, body, headers) => {
  const vote = body.vote === "up" ? "up" : body.vote === "down" ? "down" : null;
  if (!vote) return reply(headers, 400, { error: "Voto inválido." });
  const ref = db.collection("fred_lessons").doc(entry.id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("NOT_FOUND");
    const fb = snap.data().feedback || { up: 0, down: 0, voters: {} };
    const previous = fb.voters?.[uid];
    if (previous === vote) return;
    if (previous) fb[previous] = Math.max(0, (fb[previous] || 0) - 1);
    fb[vote] = (fb[vote] || 0) + 1;
    fb.voters = { ...(fb.voters || {}), [uid]: vote };
    tx.set(ref, { feedback: fb }, { merge: true });
  });
  return reply(headers, 200, { ok: true, vote });
};

// ── Ação: regenerate (admin) ───────────────────────────────────
const handleRegenerate = async (db, uid, entry, headers) => {
  const userSnap = await db.collection("users").doc(uid).get();
  const u = userSnap.data() || {};
  if (!(u.isAdmin || String(u.username || "").toLowerCase() === "admin")) {
    return reply(headers, 403, { error: "Só o administrador pode regerar uma aula." });
  }
  const ref = db.collection("fred_lessons").doc(entry.id);
  const now = Date.now();
  await ref.set({
    id: entry.id, level: entry.level, topic: entry.topic,
    status: "generating", attempts: 0, updatedAt: now, regeneratedBy: uid, regeneratedAt: now,
    // Zera o feedback: a aula nova é outra aula.
    feedback: FieldValue.delete(),
  }, { merge: true });
  await db.collection("fred_meta").doc("index").set({ ready: { [entry.id]: FieldValue.delete() }, updatedAt: now }, { merge: true }).catch(() => {});
  triggerGeneration(entry.id, true);
  return reply(headers, 200, { status: "generating", id: entry.id });
};

exports.handler = async (event) => {
  const headers = buildHeaders(event.headers.origin || "");
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return reply(headers, 405, { error: "Método não permitido" });
  if (!process.env.FIREBASE_PROJECT_ID) return reply(headers, 500, { error: "Configuração de servidor incompleta." });

  const { db, auth } = initFirebase();

  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply(headers, 401, { error: "Não autenticado." });
  let uid;
  try { uid = (await auth.verifyIdToken(token)).uid; }
  catch { return reply(headers, 401, { error: "Sessão inválida. Faça login novamente." }); }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return reply(headers, 400, { error: "JSON inválido." }); }

  const entry = resolveLesson({ id: body.id, level: body.level, topic: body.topic });
  if (!entry) return reply(headers, 400, { error: "Tema não encontrado no catálogo." });

  try {
    switch (body.action || "get") {
      case "get": return await handleGet(db, uid, entry, headers);
      case "complete": return await handleComplete(db, uid, entry, body, headers);
      case "feedback": return await handleFeedback(db, uid, entry, body, headers);
      case "regenerate": return await handleRegenerate(db, uid, entry, headers);
      default: return reply(headers, 400, { error: "Ação desconhecida." });
    }
  } catch (error) {
    console.error("fred-explains:", error);
    if (String(error?.message).includes("USER_NOT_FOUND")) return reply(headers, 404, { error: "Usuário não encontrado." });
    return reply(headers, 500, { error: "Não consegui falar com o Fred agora. Tente novamente." });
  }
};
