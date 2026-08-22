// ============================================================
// FREEDOMAPP — Function: ranking-snapshot-background
// ------------------------------------------------------------
// Fecha as semanas/meses já encerrados e grava o Top 3 de cada um
// em `ranking_snapshots` (é o que alimenta o Hall da Fama).
//
// É "background": a Netlify responde 202 na hora e deixa a função
// trabalhar por até 15 minutos, então quem chama nunca fica
// esperando. Chamadores:
//   • ranking-snapshot.js  → todo dia, 00:10 de Brasília
//   • award-activity.js    → quando percebe que falta fechar algo
//
// Uma trava no Firestore impede que chamadas repetidas (ou um
// aluno curioso batendo na URL) façam a apuração rodar em
// duplicidade. Como a apuração sai do histórico, ela é idempotente:
// no pior caso reescreve o mesmo resultado.
// ============================================================

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { sweepRanking } = require("./lib/ranking-sweep");

const LOCK_ID = "ranking_sweep";
const LOCK_STALE_MS = 10 * 60 * 1000; // execução travada há 10 min = abandonada
const COOLDOWN_MS = 60 * 1000;        // no máximo uma apuração por minuto

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
  return getFirestore();
};

const tryLock = async (db) => {
  const ref = db.collection("ranking_locks").doc(LOCK_ID);
  const now = Date.now();
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const d = snap.data() || {};
        const rodando = d.status === "running" && now - (d.startedAt || 0) < LOCK_STALE_MS;
        const recente = now - (d.finishedAt || 0) < COOLDOWN_MS;
        if (rodando || recente) return false;
      }
      tx.set(ref, { status: "running", startedAt: now }, { merge: true });
      return true;
    });
  } catch (e) {
    console.error("trava do ranking:", e);
    return false;
  }
};

const unlock = async (db, resultado) => {
  try {
    await db.collection("ranking_locks").doc(LOCK_ID).set(
      { status: "idle", finishedAt: Date.now(), ultimoResultado: resultado || null },
      { merge: true }
    );
  } catch (e) {
    console.error("liberar trava do ranking:", e);
  }
};

exports.handler = async (event) => {
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    console.error("ranking-snapshot: variáveis do Firebase ausentes");
    return { statusCode: 500, body: "config" };
  }

  let windowDays = 400;
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    if (Number.isFinite(Number(body.windowDays))) {
      windowDays = Math.min(800, Math.max(40, Number(body.windowDays)));
    }
  } catch { /* corpo opcional */ }

  const db = initFirebase();

  if (!(await tryLock(db))) {
    console.log("ranking-snapshot: apuração já rodou há pouco — ignorando");
    return { statusCode: 200, body: "skip" };
  }

  let resultado = null;
  try {
    resultado = await sweepRanking(db, { windowDays });
    console.log("ranking-snapshot:", JSON.stringify(resultado));
  } catch (e) {
    console.error("ranking-snapshot falhou:", e);
    resultado = { erro: String(e && e.message) };
  } finally {
    await unlock(db, resultado);
  }

  return { statusCode: 200, body: JSON.stringify(resultado) };
};
